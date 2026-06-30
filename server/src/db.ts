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
  max: 10,
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
-- is useless on serverless — each warm instance has its own memory — so the
-- store lives in Postgres.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket   TEXT PRIMARY KEY,
  count    INT NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL DEFAULT 'My Home',
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name          TEXT NOT NULL,
  google_id     TEXT UNIQUE,
  household_id  UUID REFERENCES households(id) ON DELETE SET NULL,
  member_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  initial      TEXT NOT NULL DEFAULT '?',
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  is_you       BOOLEAN NOT NULL DEFAULT false,
  user_id      UUID,
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  time         TEXT NOT NULL DEFAULT '',
  ampm         TEXT NOT NULL DEFAULT '',
  day          TEXT NOT NULL DEFAULT '',
  date_label   TEXT NOT NULL DEFAULT '',
  loc          TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  illo         TEXT NOT NULL DEFAULT 'calendar',
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  from_name    TEXT NOT NULL DEFAULT 'You',
  from_color   TEXT NOT NULL DEFAULT '#3B5BFF',
  due          TEXT NOT NULL DEFAULT 'Today',
  due_key      TEXT NOT NULL DEFAULT 'today',
  done         BOOLEAN NOT NULL DEFAULT false,
  type         TEXT NOT NULL DEFAULT 'Task',
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  by_member    TEXT NOT NULL DEFAULT 'you',
  got          BOOLEAN NOT NULL DEFAULT false,
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'Family',
  tag          TEXT NOT NULL DEFAULT 'Goal',
  title        TEXT NOT NULL,
  sub          TEXT NOT NULL DEFAULT '',
  pct          INT NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  target       NUMERIC NOT NULL DEFAULT 0,
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  cat          TEXT NOT NULL DEFAULT 'Other',
  amount       NUMERIC NOT NULL DEFAULT 0,
  due          TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'unpaid',
  payer        TEXT NOT NULL DEFAULT 'Shared',
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  illo         TEXT NOT NULL DEFAULT 'wallet',
  sort         INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  spent        NUMERIC NOT NULL DEFAULT 0,
  budget_limit NUMERIC NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  sort         INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS savings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  saved        NUMERIC NOT NULL DEFAULT 0,
  target       NUMERIC NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  sort         INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settle (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  txt          TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  amount       TEXT NOT NULL DEFAULT '',
  dir          TEXT NOT NULL DEFAULT 'out',
  who          TEXT NOT NULL DEFAULT '',
  settled      BOOLEAN NOT NULL DEFAULT false,
  sort         INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  illo         TEXT NOT NULL DEFAULT 'bell',
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  time_label   TEXT NOT NULL DEFAULT 'Just now',
  unread       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  who          TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#3B5BFF',
  initial      TEXT NOT NULL DEFAULT '?',
  txt          TEXT NOT NULL,
  time_label   TEXT NOT NULL DEFAULT 'Just now',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_hh ON members(household_id);
CREATE INDEX IF NOT EXISTS idx_events_hh ON events(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_hh ON tasks(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_hh ON shopping(household_id);
CREATE INDEX IF NOT EXISTS idx_goals_hh ON goals(household_id);
CREATE INDEX IF NOT EXISTS idx_bills_hh ON bills(household_id);
CREATE INDEX IF NOT EXISTS idx_notifications_hh ON notifications(household_id);
CREATE INDEX IF NOT EXISTS idx_feed_hh ON feed(household_id);
`;

export async function initSchema() {
  await pool.query(SCHEMA);
}
