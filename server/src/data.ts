import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const dataRouter = Router();
dataRouter.use(requireAuth);

const num = (v: any) => (v == null ? 0 : Number(v));

/** Assemble the whole app state for a household (raw rows; client formats). */
async function assembleState(householdId: string) {
  const [
    hh, members, events, tasks, shopping, goals, bills, budget, savings, settle, notifications, feed,
  ] = await Promise.all([
    query(`SELECT name, settings FROM households WHERE id = $1`, [householdId]),
    query(`SELECT id, name, role, initial, color, is_you, sort FROM members WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, title, time, ampm, day, date_label, loc, color, illo FROM events WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, title, from_name, from_color, due, due_key, done, type FROM tasks WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, name, by_member, got FROM shopping WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, kind, tag, title, sub, pct, color, target FROM goals WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, name, cat, amount, due, status, payer, color, illo FROM bills WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, name, spent, budget_limit, color FROM budget WHERE household_id=$1 ORDER BY sort`, [householdId]),
    query(`SELECT id, name, saved, target, color FROM savings WHERE household_id=$1 ORDER BY sort`, [householdId]),
    query(`SELECT id, txt, detail, amount, dir, who, settled FROM settle WHERE household_id=$1 ORDER BY sort`, [householdId]),
    query(`SELECT id, illo, color, title, body, time_label, unread FROM notifications WHERE household_id=$1 ORDER BY created_at DESC`, [householdId]),
    query(`SELECT id, who, color, initial, txt, time_label FROM feed WHERE household_id=$1 ORDER BY created_at DESC`, [householdId]),
  ]);

  const household = hh.rows[0] || { name: 'My Home', settings: {} };
  return {
    household: { name: household.name, settings: household.settings || {} },
    members: members.rows.map((m) => ({
      id: m.id, name: m.name, role: m.role, initial: m.initial, color: m.color, you: m.is_you,
    })),
    events: events.rows,
    tasks: tasks.rows,
    shopping: shopping.rows.map((s) => ({ id: s.id, name: s.name, by: s.by_member, got: s.got })),
    goals: goals.rows.map((g) => ({ ...g, pct: num(g.pct), target: num(g.target) })),
    bills: bills.rows.map((b) => ({ ...b, amount: num(b.amount) })),
    budget: budget.rows.map((c) => ({ id: c.id, name: c.name, spent: num(c.spent), limit: num(c.budget_limit), color: c.color })),
    savings: savings.rows.map((v) => ({ ...v, saved: num(v.saved), target: num(v.target) })),
    settle: settle.rows,
    notifications: notifications.rows,
    feed: feed.rows,
  };
}

/** Return fresh state — every mutation ends with this. */
async function sendState(req: AuthedRequest, res: Response) {
  res.json(await assembleState(req.householdId!));
}

const hh = (req: AuthedRequest) => req.householdId!;
const nextSort = (table: string) =>
  `(SELECT COALESCE(MAX(sort),0)+1 FROM ${table} WHERE household_id=$1)`;

dataRouter.get('/state', async (req: AuthedRequest, res) => {
  res.json(await assembleState(hh(req)));
});

// Mark the first-run welcome walkthrough as seen for this user.
dataRouter.post('/onboarded', async (req: AuthedRequest, res) => {
  await query(`UPDATE users SET onboarded = true WHERE id = $1`, [req.userId]);
  res.json({ ok: true });
});

// helper to log activity feed
async function addFeed(householdId: string, who: string, color: string, initial: string, txt: string) {
  await query(
    `INSERT INTO feed (household_id, who, color, initial, txt, time_label) VALUES ($1,$2,$3,$4,$5,'just now')`,
    [householdId, who, color, initial, txt]
  );
}
async function meMember(householdId: string) {
  const r = await query(`SELECT name, color, initial FROM members WHERE household_id=$1 AND is_you=true LIMIT 1`, [householdId]);
  return r.rows[0] || { name: 'You', color: '#3B5BFF', initial: 'Y' };
}

// ---------------- EVENTS ----------------
dataRouter.post('/events', async (req: AuthedRequest, res) => {
  const b = z.object({ title: z.string().min(1), date: z.string().optional(), time: z.string().optional(), who: z.string().optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a title first' });
  const m = (await query(`SELECT name, color FROM members WHERE id=$1 AND household_id=$2`, [b.data.who, hh(req)])).rows[0];
  const time = b.data.time || 'All';
  await query(
    `INSERT INTO events (household_id, title, time, ampm, date_label, loc, color, illo, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'calendar',${nextSort('events')})`,
    [hh(req), b.data.title, time, b.data.time ? '' : 'day', b.data.date || 'Upcoming', 'For ' + (m?.name || 'the family'), m?.color || '#3B5BFF']
  );
  await sendState(req, res);
});
dataRouter.delete('/events/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM events WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- TASKS ----------------
dataRouter.post('/tasks', async (req: AuthedRequest, res) => {
  const b = z.object({ title: z.string().min(1), type: z.string().optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Type a to-do' });
  const me = await meMember(hh(req));
  await query(
    `INSERT INTO tasks (household_id, title, from_name, from_color, due, due_key, done, type, sort)
     VALUES ($1,$2,$3,$4,'Today','today',false,$5,${nextSort('tasks')})`,
    [hh(req), b.data.title, me.name, me.color, b.data.type || 'Task']
  );
  await sendState(req, res);
});
dataRouter.patch('/tasks/:id', async (req: AuthedRequest, res) => {
  const done = !!req.body?.done;
  await query(`UPDATE tasks SET done=$1 WHERE id=$2 AND household_id=$3`, [done, req.params.id, hh(req)]);
  if (done) {
    const t = (await query(`SELECT title FROM tasks WHERE id=$1`, [req.params.id])).rows[0];
    const me = await meMember(hh(req));
    if (t) await addFeed(hh(req), 'You', me.color, me.initial, `completed "${t.title}"`);
  }
  await sendState(req, res);
});
dataRouter.delete('/tasks/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM tasks WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- SHOPPING ----------------
dataRouter.post('/shopping', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Type an item' });
  await query(
    `INSERT INTO shopping (household_id, name, by_member, got, sort) VALUES ($1,$2,'you',false,${nextSort('shopping')})`,
    [hh(req), b.data.name]
  );
  const me = await meMember(hh(req));
  await addFeed(hh(req), 'You', me.color, me.initial, `added ${b.data.name} to the shopping list`);
  await sendState(req, res);
});
dataRouter.patch('/shopping/:id', async (req: AuthedRequest, res) => {
  await query(`UPDATE shopping SET got = NOT got WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/shopping/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM shopping WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- GOALS ----------------
dataRouter.post('/goals', async (req: AuthedRequest, res) => {
  const b = z.object({ title: z.string().min(1), kind: z.string().optional(), target: z.union([z.string(), z.number()]).optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a goal title' });
  const fam = b.data.kind !== 'personal';
  const target = Number(b.data.target) || 0;
  const me = await meMember(hh(req));
  const kind = fam ? 'Family' : me.name;
  const sub = target ? `R0 of R${target.toLocaleString('en-ZA')}` : 'Just getting started';
  await query(
    `INSERT INTO goals (household_id, kind, tag, title, sub, pct, color, target, sort)
     VALUES ($1,$2,$3,$4,$5,0,'#3B5BFF',$6,${nextSort('goals')})`,
    [hh(req), kind, fam ? 'Goal' : 'Personal', b.data.title, sub, target]
  );
  await sendState(req, res);
});
dataRouter.patch('/goals/:id', async (req: AuthedRequest, res) => {
  await query(`UPDATE goals SET pct = LEAST(100, pct + 8) WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/goals/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM goals WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- BILLS ----------------
dataRouter.post('/bills', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1), amount: z.union([z.string(), z.number()]).optional(), due: z.string().optional(), payer: z.string().optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a bill name' });
  const m = (await query(`SELECT name FROM members WHERE id=$1 AND household_id=$2`, [b.data.payer, hh(req)])).rows[0];
  await query(
    `INSERT INTO bills (household_id, name, cat, amount, due, status, payer, color, illo, sort)
     VALUES ($1,$2,'Other',$3,$4,'unpaid',$5,'#3B5BFF','wallet',${nextSort('bills')})`,
    [hh(req), b.data.name, Number(b.data.amount) || 0, b.data.due || 'This month', m?.name || 'Shared']
  );
  await sendState(req, res);
});
dataRouter.patch('/bills/:id', async (req: AuthedRequest, res) => {
  const status = z.enum(['paid', 'unpaid', 'overdue']).catch('paid').parse(req.body?.status);
  await query(`UPDATE bills SET status=$1 WHERE id=$2 AND household_id=$3`, [status, req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/bills/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM bills WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- MEMBERS ----------------
dataRouter.post('/members', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1), role: z.string().optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a name' });
  const palette = ['#7A5CFF', '#16C098', '#FF6B5C', '#FFB020', '#3B5BFF', '#FF5C8A'];
  const count = num((await query(`SELECT COUNT(*) FROM members WHERE household_id=$1`, [hh(req)])).rows[0].count);
  await query(
    `INSERT INTO members (household_id, name, role, initial, color, is_you, sort) VALUES ($1,$2,$3,$4,$5,false,${nextSort('members')})`,
    [hh(req), b.data.name, b.data.role || 'Family', b.data.name.charAt(0).toUpperCase(), palette[count % palette.length]]
  );
  await sendState(req, res);
});
dataRouter.delete('/members/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM members WHERE id=$1 AND household_id=$2 AND is_you=false`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- NOTIFICATIONS / NUDGE ----------------
dataRouter.post('/notifications/read-all', async (req: AuthedRequest, res) => {
  await query(`UPDATE notifications SET unread=false WHERE household_id=$1`, [hh(req)]);
  await sendState(req, res);
});
dataRouter.post('/nudge', async (req: AuthedRequest, res) => {
  const name = String(req.body?.name || 'the family');
  await query(
    `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
     VALUES ($1,'bell','#FF5C8A',$2,$3,'just now',true)`,
    [hh(req), `Reminder for ${name}`, 'A nudge was sent — don’t forget!']
  );
  await sendState(req, res);
});

// ---------------- SETTLE ----------------
dataRouter.patch('/settle/:id', async (req: AuthedRequest, res) => {
  await query(`UPDATE settle SET settled=true WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- SETTINGS / HOUSEHOLD ----------------
dataRouter.patch('/settings', async (req: AuthedRequest, res) => {
  const key = String(req.body?.key || '');
  const value = req.body?.value;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  await query(
    `UPDATE households SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), $2, $3::jsonb, true) WHERE id=$1`,
    [hh(req), `{${key}}`, JSON.stringify(value)]
  );
  await sendState(req, res);
});
dataRouter.patch('/household', async (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim();
  if (name) await query(`UPDATE households SET name=$1 WHERE id=$2`, [name, hh(req)]);
  await sendState(req, res);
});
