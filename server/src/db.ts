import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Throw rather than process.exit(1): in the serverless runtime exit() kills the
  // whole function instance (an opaque FUNCTION_INVOCATION_FAILED), whereas a throw
  // is catchable by the entry handler and surfaces as a clean, loggable 500.
  throw new Error(
    '[croft] DATABASE_URL is not set. Set it to your Neon connection string ' +
      '(Production) or a local Postgres URL (Dev), e.g. ' +
      'postgresql://user:pass@ep-xxx.neon.tech/croft?sslmode=require'
  );
}

// Neon requires SSL; local dev usually does not. Detect by host.
const needsSsl = /neon\.tech|sslmode=require/i.test(connectionString) ||
  process.env.PGSSL === 'require';

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // Serverless-friendly sizing: keep few connections per warm instance and
  // release them quickly so idle functions don't hold Neon's connection slots.
  // (The connection string is already Neon's pooled/PgBouncer endpoint.)
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Run a function inside a transaction. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared (cross-instance) fixed-window rate-limit counters. In-memory limiting
-- is useless on serverless - each warm instance has its own memory - so the
-- store lives in Postgres.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INT NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Home',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  google_id TEXT UNIQUE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  member_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Whether the user has seen the first-run welcome walkthrough (per-user).
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;

-- Optional per-user app-lock passcode (bcrypt hash; NULL = no lock).
ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_pin TEXT;

-- Unguessable token for the household's subscribable calendar (ICS) feed.
ALTER TABLE households ADD COLUMN IF NOT EXISTS calendar_token TEXT UNIQUE;
-- NOTE: ALTERs for the events and bills tables live AFTER those CREATE TABLE
-- statements below - the whole schema runs as one implicit transaction, so an
-- ALTER before its table exists would abort the entire init on a fresh database.

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  initial TEXT NOT NULL DEFAULT '?',
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  is_you BOOLEAN NOT NULL DEFAULT false,
  user_id UUID,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  ampm TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  loc TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  illo TEXT NOT NULL DEFAULT 'calendar',
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'You',
  from_color TEXT NOT NULL DEFAULT '#3B5BFF',
  due TEXT NOT NULL DEFAULT 'Today',
  due_key TEXT NOT NULL DEFAULT 'today',
  done BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL DEFAULT 'Task',
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  by_member TEXT NOT NULL DEFAULT 'you',
  got BOOLEAN NOT NULL DEFAULT false,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'Family',
  tag TEXT NOT NULL DEFAULT 'Goal',
  title TEXT NOT NULL,
  sub TEXT NOT NULL DEFAULT '',
  pct INT NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  target NUMERIC NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cat TEXT NOT NULL DEFAULT 'Other',
  amount NUMERIC NOT NULL DEFAULT 0,
  due TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unpaid',
  payer TEXT NOT NULL DEFAULT 'Shared',
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  illo TEXT NOT NULL DEFAULT 'wallet',
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Real dates (source of truth for reminders); display labels are derived from
-- these. Placed here - after events/bills exist - so a fresh-DB init succeeds.
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE TABLE IF NOT EXISTS budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spent NUMERIC NOT NULL DEFAULT 0,
  budget_limit NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  saved NUMERIC NOT NULL DEFAULT 0,
  target NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  txt TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  dir TEXT NOT NULL DEFAULT 'out',
  who TEXT NOT NULL DEFAULT '',
  settled BOOLEAN NOT NULL DEFAULT false,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  illo TEXT NOT NULL DEFAULT 'bell',
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  time_label TEXT NOT NULL DEFAULT 'Just now',
  unread BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  who TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B5BFF',
  initial TEXT NOT NULL DEFAULT '?',
  txt TEXT NOT NULL,
  time_label TEXT NOT NULL DEFAULT 'Just now',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_hh ON members(household_id);
CREATE INDEX IF NOT EXISTS idx_events_hh ON events(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_hh ON tasks(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_hh ON shopping(household_id);
CREATE INDEX IF NOT EXISTS idx_goals_hh ON goals(household_id);
CREATE INDEX IF NOT EXISTS idx_bills_hh ON bills(household_id);
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  member_id UUID, -- optional: an existing placeholder member to claim
  role TEXT NOT NULL DEFAULT '',
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_hh ON notifications(household_id);
CREATE INDEX IF NOT EXISTS idx_feed_hh ON feed(household_id);
CREATE INDEX IF NOT EXISTS idx_invites_hh ON invites(household_id);
CREATE INDEX IF NOT EXISTS idx_push_hh ON push_subscriptions(household_id);
CREATE INDEX IF NOT EXISTS idx_budget_hh ON budget(household_id);
CREATE INDEX IF NOT EXISTS idx_savings_hh ON savings(household_id);
CREATE INDEX IF NOT EXISTS idx_settle_hh ON settle(household_id);

-- Referential integrity for the user links added by the multi-user work. These
-- columns predate the constraints, so first null out any dangling references
-- (from earlier account deletions), then add each FK once, idempotently.
UPDATE members SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
UPDATE invites SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM users);
UPDATE invites SET accepted_by = NULL WHERE accepted_by IS NOT NULL AND accepted_by NOT IN (SELECT id FROM users);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_user_id_fkey') THEN
    ALTER TABLE members ADD CONSTRAINT members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invites_created_by_fkey') THEN
    ALTER TABLE invites ADD CONSTRAINT invites_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invites_accepted_by_fkey') THEN
    ALTER TABLE invites ADD CONSTRAINT invites_accepted_by_fkey
      FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
`;

export async function initSchema() {
  await pool.query(SCHEMA);
  // Opportunistic cleanup of expired rate-limit buckets (runs on cold start).
  await pool.query(`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`).catch(() => {});
}
