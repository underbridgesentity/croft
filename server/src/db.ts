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
  // Verify the DB server's certificate (Neon uses publicly-trusted CAs), so a
  // MITM between the API and the database can't impersonate it.
  ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
  // Serverless-friendly sizing: keep few connections per warm instance and
  // release them quickly so idle functions don't hold Neon's connection slots.
  // (The connection string is already Neon's pooled/PgBouncer endpoint.)
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

const isProd = process.env.NODE_ENV === 'production';

/** Options accepted by the query helpers. */
export interface QueryOpts {
  /** Set false to allow touching a per-household table without a household_id
   *  filter - only for intentional access by an unguessable token/endpoint or a
   *  user's own row by id (invite tokens, push endpoints, delete-account). */
  scoped?: boolean;
}

// Defense-in-depth (a code-level stand-in for row-level security): every query
// that reads or writes a per-household table must also constrain by
// household_id, so a route can't silently leak or clobber another family's data
// by forgetting the tenant filter. Longest names first so "budget_spends" isn't
// mis-matched as "budget".
const SCOPED_TABLES = [
  'push_subscriptions', 'native_push_tokens', 'calendar_sources', 'budget_spends', 'household_info', 'notifications', 'shopping',
  'savings_adds', 'members', 'invites', 'savings', 'events', 'tasks', 'goals', 'bills', 'budget', 'settle', 'feed', 'meals',
];
const SCOPE_RE = new RegExp(`\\b(?:from|join|into|update)\\s+"?(${SCOPED_TABLES.join('|')})"?\\b`, 'i');

function assertHouseholdScope(text: string, opts?: QueryOpts): void {
  if (opts?.scoped === false) return;
  const m = SCOPE_RE.exec(text);
  if (!m || /household_id/i.test(text)) return;
  const msg = `[croft] tenant-scope guard: query touches "${m[1]}" without a household_id filter`;
  // Hard-fail in dev/test so the mistake is caught before it ships; in prod
  // alert (Vercel logs / error webhook) but never break a live request - the
  // app-layer WHERE clauses are still the enforced boundary.
  if (isProd) {
    console.error(msg, text.replace(/\s+/g, ' ').trim().slice(0, 200));
    return;
  }
  throw new Error(
    `${msg}.\nAdd a "household_id = $n" filter, or pass { scoped: false } if this ` +
    `table is intentionally reached by a token/endpoint/own-id.\nSQL: ${text.trim()}`
  );
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: any[] = [],
  opts?: QueryOpts
): Promise<pg.QueryResult<T>> {
  assertHouseholdScope(text, opts);
  return pool.query<T>(text, params);
}

/** A transaction client whose query() runs the tenant-scope guard and accepts
 *  the same { scoped } option as the top-level query() helper. */
export type TxClient = Omit<pg.PoolClient, 'query'> & {
  query<T extends pg.QueryResultRow = any>(text: string, params?: any[], opts?: QueryOpts): Promise<pg.QueryResult<T>>;
};

/** A transaction client whose query() runs the same tenant-scope guard. */
function guardClient(client: pg.PoolClient): TxClient {
  return new Proxy(client, {
    get(target, prop, recv) {
      if (prop === 'query') {
        return (text: any, params?: any, opts?: QueryOpts) => {
          if (typeof text === 'string') assertHouseholdScope(text, opts);
          return (target.query as any)(text, params);
        };
      }
      const v = Reflect.get(target, prop, recv);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) as unknown as TxClient;
}

/** Run a function inside a transaction. The client is scope-guarded. */
export async function tx<T>(fn: (c: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(guardClient(client));
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

-- Session revocation: bumping this invalidates every outstanding session token
-- (each JWT carries the version it was minted with). Bumped on password
-- change/reset; legacy tokens without a version claim count as version 0.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- Per-user email cadence override (off/daily/weekly/both); NULL = follow the
-- household default. One member's preference must not change everyone's inbox.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_cadence TEXT;

-- Per-user notifications-read watermark: "Mark all read" clears YOUR badge,
-- not the whole family's (rows are shared; read-state is personal).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_read_at TIMESTAMPTZ;

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

-- Native APNs device tokens (the iOS app can't use Web Push in its webview).
CREATE TABLE IF NOT EXISTS native_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
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

-- Real scheduling for to-dos/reminders (the legacy due/due_key text labels are
-- now DERIVED from due_date at read time). due_time 'HH:MM' powers the
-- ~1-hour-before reminder push, mirroring events. (Placed after CREATE TABLE
-- tasks so a fresh database initialises cleanly.)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TEXT NOT NULL DEFAULT '';

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
-- When an event last changed - drives LAST-MODIFIED/SEQUENCE in the ICS feed so
-- calendar clients reliably re-render edits (many ignore changes otherwise).
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Events imported from an external calendar (Google/Apple) carry their origin
-- source + original UID; they are read-only and excluded from our own feed so a
-- subscribe-back loop can't duplicate them.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_uid TEXT;

-- Multi-member assignment (JSONB array of member ids). Display text (loc/payer)
-- stays denormalized for the feed; these ids are the editable source of truth.
ALTER TABLE events ADD COLUMN IF NOT EXISTS assignee_ids JSONB;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS assignee_ids JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_ids JSONB;

-- Recurrence rule: none | daily | weekly | monthly | yearly. Events are expanded
-- into occurrences client-side; a paid recurring bill spawns the next one; a
-- completed recurring task re-opens for next time.
ALTER TABLE events ADD COLUMN IF NOT EXISTS recur TEXT NOT NULL DEFAULT 'none';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recur TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recur TEXT NOT NULL DEFAULT 'none';

-- Reminder lead time (days before the date to also nudge). 0 = on the day only.
ALTER TABLE events ADD COLUMN IF NOT EXISTS remind_days INT NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS remind_days INT NOT NULL DEFAULT 0;

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

-- Who-owes-who rows keep the counterparty's member id so they can be edited.
-- (Placed after the CREATE above so a fresh-DB init succeeds.)
ALTER TABLE settle ADD COLUMN IF NOT EXISTS member_id UUID;
-- Absolute debtor/creditor so an IOU reads correctly for EVERY member (the old
-- txt/dir were baked from the creator's view → "you owe yourself" for others).
ALTER TABLE settle ADD COLUMN IF NOT EXISTS from_member UUID; -- debtor (owes)
ALTER TABLE settle ADD COLUMN IF NOT EXISTS to_member UUID;   -- creditor (owed)
-- Backfill existing IOUs in two-member households, where the creator must be the
-- member who isn't the stored counterparty. (In larger households the creator is
-- unrecoverable; those keep the legacy display until edited/re-added.)
UPDATE settle s SET
  from_member = CASE WHEN s.dir = 'out' THEN o.other_id ELSE s.member_id END,
  to_member   = CASE WHEN s.dir = 'out' THEN s.member_id ELSE o.other_id END
FROM (
  SELECT s2.id AS sid, m.id AS other_id
    FROM settle s2
    JOIN members m ON m.household_id = s2.household_id AND m.id <> s2.member_id
   WHERE s2.from_member IS NULL AND s2.member_id IS NOT NULL
     AND (SELECT COUNT(*) FROM members mm WHERE mm.household_id = s2.household_id) = 2
) o
WHERE s.id = o.sid AND s.from_member IS NULL;

-- External calendars a household imports (Google/Apple secret iCal URLs). Their
-- events live in the events table with source_id set, refreshed on a schedule.
CREATE TABLE IF NOT EXISTS calendar_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Imported calendar',
  color TEXT NOT NULL DEFAULT '#8C7CFF',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_sources_hh ON calendar_sources(household_id);
-- One row per (household, external event instance) so re-imports upsert instead
-- of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_external
  ON events (household_id, external_uid) WHERE external_uid IS NOT NULL;

-- Budget spending is a ledger of individual spends, not a hand-edited total:
-- amounts tally up, "this month's spend" is derived (so it resets itself each
-- month), and history powers the per-month view.
CREATE TABLE IF NOT EXISTS budget_spends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_spends_b ON budget_spends(budget_id);

-- One-time migration: carry any legacy hand-entered totals into the ledger.
INSERT INTO budget_spends (household_id, budget_id, amount, note)
SELECT b.household_id, b.id, b.spent, 'Carried over'
  FROM budget b
 WHERE b.spent > 0
   AND NOT EXISTS (SELECT 1 FROM budget_spends s WHERE s.budget_id = b.id);

-- Weekly meal plan ("what's for dinner"): one or more dishes per date.
CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meals_hh ON meals(household_id);

-- Shared household reference info (wifi, emergency contacts, medical, codes).
CREATE TABLE IF NOT EXISTS household_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'General',
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_household_info_hh ON household_info(household_id);

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
-- ---- depth pass ----
-- Goals: real ownership (id, not display name), optional privacy via owner,
-- and a target date so a goal can pace and remind like everything else.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS member_id UUID;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline DATE;
-- Backfill legacy personal goals (owner was stored as the member's display
-- name in the kind column) - idempotent, and ONLY when exactly one member
-- carries that name (two "Sam"s must not get each other's goals).
UPDATE goals g SET member_id = m.id FROM members m
 WHERE g.member_id IS NULL AND g.kind <> 'Family' AND m.household_id = g.household_id AND m.name = g.kind
   AND (SELECT COUNT(*) FROM members m2 WHERE m2.household_id = g.household_id AND m2.name = g.kind) = 1;
-- Personal goals whose owner member no longer exists are invisible to everyone
-- and undeletable (owner-only rules) - remove the orphans. Idempotent.
DELETE FROM goals g WHERE g.member_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = g.member_id);

-- Meals: ingredients feed the shopping list; an optional cook answers
-- "who's making dinner Thursday?".
ALTER TABLE meals ADD COLUMN IF NOT EXISTS ingredients TEXT NOT NULL DEFAULT '';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS cook_member UUID;

-- Bills: debit orders mark themselves paid on their due date (and roll to the
-- next occurrence) instead of sitting 'overdue' forever.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS autopay BOOLEAN NOT NULL DEFAULT false;

-- Events: an optional end date makes trips/holidays one entry, not seven.
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;

-- Shopping: named lists (Groceries / Hardware / Gifts ...).
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS list_name TEXT NOT NULL DEFAULT 'Groceries';

-- Savings contributions ledger: who added what, when - makes totals auditable
-- and lost updates visible.
CREATE TABLE IF NOT EXISTS savings_adds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  savings_id UUID NOT NULL REFERENCES savings(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_savings_adds_hh ON savings_adds(household_id);

CREATE INDEX IF NOT EXISTS idx_push_hh ON push_subscriptions(household_id);
CREATE INDEX IF NOT EXISTS idx_native_push_hh ON native_push_tokens(household_id);
CREATE INDEX IF NOT EXISTS idx_budget_hh ON budget(household_id);
CREATE INDEX IF NOT EXISTS idx_savings_hh ON savings(household_id);
CREATE INDEX IF NOT EXISTS idx_settle_hh ON settle(household_id);

-- Referential integrity for the user links added by the multi-user work. These
-- columns predate the constraints, so first null out any dangling references
-- (from earlier account deletions), then add each FK once, idempotently.
UPDATE members SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
-- Backfill: founders' members predate the user_id link (only invited members
-- carried it) - link them via the users.member_id side so occupancy counts see
-- every real person.
UPDATE members m SET user_id = u.id FROM users u WHERE u.member_id = m.id AND m.user_id IS NULL;
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
  -- Deleting an imported calendar removes the events it brought in.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_source_id_fkey') THEN
    ALTER TABLE events ADD CONSTRAINT events_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE;
  END IF;
END $$;
`;

export async function initSchema() {
  await pool.query(SCHEMA);
  // Opportunistic cleanup of expired rate-limit buckets (runs on cold start).
  await pool.query(`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`).catch(() => {});
}
