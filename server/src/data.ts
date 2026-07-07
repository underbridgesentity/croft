import { Router, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';
import { rateLimit } from './rateLimit.js';
import { vapidPublicKey, saveSubscription, removeSubscription, pushToHousehold, pushToSub } from './push.js';
import { sastToday, formatDateLabel, relativeTime, isoRe } from './dates.js';
import { advanceIso } from './recur.js';
import { sendEmail } from './mailer.js';
import { inviteEmail } from './emailTemplates.js';
import { syncSource } from './importCalendar.js';

const APP_URL = process.env.APP_URL || 'https://www.croftapp.co.za';

export const dataRouter = Router();
dataRouter.use(requireAuth);

// Throttle the authenticated write surface (a stolen cookie or a runaway client
// could otherwise hammer DB writes). GET /state is read frequently and left
// unthrottled; only mutating verbs are limited. Generous for a family app.
const writeLimit = rateLimit('data', 240, 300); // 240 writes / 5 min per IP
dataRouter.use((req, res, next) => (req.method === 'GET' ? next() : writeLimit(req, res, next)));

const num = (v: any) => (v == null ? 0 : Number(v));

/** Assemble the whole app state for a household (raw rows; client formats).
 * `meMemberId` marks which member is "you" for the requesting user. */
async function assembleState(householdId: string, meMemberId?: string) {
  const [
    hh, members, events, tasks, shopping, goals, bills, budget, savings, settle, notifications, feed, budgetMonths, calSources, budgetSpendsRows, mealsRows, infoRows,
  ] = await Promise.all([
    query(`SELECT name, settings FROM households WHERE id = $1`, [householdId]),
    query(`SELECT id, name, role, initial, color, is_you, sort FROM members WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, title, time, ampm, day, date_label, loc, color, illo, to_char(event_date,'YYYY-MM-DD') AS event_date, event_time, assignee_ids, source_id, recur, remind_days FROM events WHERE household_id=$1 ORDER BY event_date NULLS LAST, sort, created_at`, [householdId]),
    query(`SELECT id, title, from_name, from_color, due, due_key, done, type, assignee_ids, recur FROM tasks WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, name, by_member, got FROM shopping WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, kind, tag, title, sub, pct, color, target FROM goals WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
    query(`SELECT id, name, cat, amount, due, status, payer, color, illo, to_char(due_date,'YYYY-MM-DD') AS due_date, assignee_ids, recur, remind_days FROM bills WHERE household_id=$1 ORDER BY due_date NULLS LAST, sort, created_at`, [householdId]),
    // Spend totals are derived from the budget_spends ledger per SAST month, so
    // "this month" resets itself and past months stay browsable.
    query(
      `SELECT b.id, b.name, b.budget_limit, b.color,
              COALESCE((SELECT SUM(s.amount) FROM budget_spends s
                         WHERE s.budget_id = b.id
                           AND to_char(s.created_at + interval '2 hours','YYYY-MM') = $2), 0) AS spent
         FROM budget b WHERE b.household_id=$1 ORDER BY b.sort`,
      [householdId, sastToday().slice(0, 7)]
    ),
    query(`SELECT id, name, saved, target, color FROM savings WHERE household_id=$1 ORDER BY sort`, [householdId]),
    query(`SELECT id, txt, detail, amount, dir, who, settled, member_id, from_member, to_member FROM settle WHERE household_id=$1 ORDER BY sort`, [householdId]),
    query(`SELECT id, illo, color, title, body, time_label, unread, created_at FROM notifications WHERE household_id=$1 ORDER BY created_at DESC`, [householdId]),
    query(`SELECT id, who, color, initial, txt, time_label, created_at FROM feed WHERE household_id=$1 ORDER BY created_at DESC LIMIT 30`, [householdId]),
    // Per-month spend totals per category (SAST months) for the month navigator.
    query(
      `SELECT budget_id, to_char(created_at + interval '2 hours','YYYY-MM') AS month, SUM(amount) AS total
         FROM budget_spends WHERE household_id=$1 GROUP BY budget_id, month`,
      [householdId]
    ),
    query(
      `SELECT s.id, s.name, s.color, s.last_synced_at, s.last_error,
              (SELECT COUNT(*) FROM events e WHERE e.source_id = s.id) AS event_count
         FROM calendar_sources s WHERE s.household_id=$1 ORDER BY s.created_at`,
      [householdId]
    ),
    // Individual budget spends (the ledger behind each category's total), newest
    // first, so the app can show the full breakdown and let a mistake be removed.
    // SAST date + month so the client groups them by the same month as the totals.
    query(
      `SELECT id, budget_id, amount, note,
              to_char(created_at + interval '2 hours','YYYY-MM-DD') AS date,
              to_char(created_at + interval '2 hours','YYYY-MM') AS month
         FROM budget_spends WHERE household_id=$1 ORDER BY created_at DESC`,
      [householdId]
    ),
    query(`SELECT id, to_char(date,'YYYY-MM-DD') AS date, title FROM meals WHERE household_id=$1 ORDER BY date, created_at`, [householdId]),
    query(`SELECT id, category, label, value FROM household_info WHERE household_id=$1 ORDER BY sort, created_at`, [householdId]),
  ]);

  const household = hh.rows[0] || { name: 'My Home', settings: {} };
  const today = sastToday();
  // Who-owes-who is stored absolutely (from_member = debtor, to_member = creditor)
  // so the SAME row reads correctly for every member. Re-word it from the current
  // viewer's angle; `mine` marks the IOUs the viewer is actually part of (only
  // those count toward their personal balance — a debt between two other members
  // is shown neutrally). Rows predating the absolute columns fall back to their
  // stored (creator-perspective) text.
  const nameOf = new Map<string, string>(members.rows.map((m) => [m.id, m.name]));
  const settleView = settle.rows.map((s) => {
    const debtor = s.from_member as string | null;
    const creditor = s.to_member as string | null;
    if (debtor && creditor && nameOf.has(debtor) && nameOf.has(creditor)) {
      const dn = nameOf.get(debtor)!, cn = nameOf.get(creditor)!;
      const base = { id: s.id, detail: s.detail, amount: s.amount, settled: s.settled };
      if (meMemberId && meMemberId === creditor)
        return { ...base, dir: 'in', who: dn, member_id: debtor, txt: `${dn} owes you`, mine: true };
      if (meMemberId && meMemberId === debtor)
        return { ...base, dir: 'out', who: cn, member_id: creditor, txt: `You owe ${cn}`, mine: true };
      return { ...base, dir: 'in', who: dn, member_id: debtor, txt: `${dn} owes ${cn}`, mine: false };
    }
    // Legacy row (no absolute parties): keep what was stored.
    return { id: s.id, detail: s.detail, amount: s.amount, settled: s.settled, dir: s.dir, who: s.who, member_id: s.member_id, txt: s.txt, mine: true };
  });
  return {
    household: { name: household.name, settings: household.settings || {} },
    members: members.rows.map((m) => ({
      id: m.id, name: m.name, role: m.role, initial: m.initial, color: m.color,
      you: meMemberId ? m.id === meMemberId : m.is_you,
    })),
    // Labels + "today"/"overdue" are derived from the real dates so they never go
    // stale (a "Today" event stays correct only for the actual day).
    events: events.rows.map((e) => ({
      ...e,
      date_label: e.event_date ? formatDateLabel(e.event_date) : e.date_label,
      day: e.event_date ? (e.event_date === today ? 'today' : '') : e.day,
      time: e.event_time || e.time,
      external: !!e.source_id, // imported from a linked calendar → read-only
    })),
    tasks: tasks.rows,
    shopping: shopping.rows.map((s) => ({ id: s.id, name: s.name, by: s.by_member, got: s.got })),
    goals: goals.rows.map((g) => ({ ...g, pct: num(g.pct), target: num(g.target) })),
    bills: bills.rows.map((b) => ({
      ...b,
      amount: num(b.amount),
      due: b.due_date ? formatDateLabel(b.due_date) : b.due,
      status: b.due_date && b.due_date < today && b.status === 'unpaid' ? 'overdue' : b.status,
    })),
    budget: budget.rows.map((c) => ({ id: c.id, name: c.name, spent: num(c.spent), limit: num(c.budget_limit), color: c.color })),
    budgetMonths: budgetMonths.rows.map((r) => ({ budget_id: r.budget_id, month: r.month, total: num(r.total) })),
    budgetSpends: budgetSpendsRows.rows.map((r) => ({ id: r.id, budget_id: r.budget_id, amount: num(r.amount), note: r.note, date: r.date, month: r.month })),
    meals: mealsRows.rows,
    householdInfo: infoRows.rows,
    savings: savings.rows.map((v) => ({ ...v, saved: num(v.saved), target: num(v.target) })),
    settle: settleView,
    // time_label is derived live from created_at so items never freeze at "just now".
    notifications: notifications.rows.map((n) => ({ ...n, time_label: relativeTime(n.created_at) })),
    feed: feed.rows.map((f) => ({ ...f, time_label: relativeTime(f.created_at) })),
    calendarSources: calSources.rows.map((s) => ({
      id: s.id, name: s.name, color: s.color, count: num(s.event_count),
      last_synced: s.last_synced_at ? relativeTime(s.last_synced_at) : null,
      error: s.last_error || null,
    })),
  };
}

/** Return fresh state - every mutation ends with this. */
async function sendState(req: AuthedRequest, res: Response) {
  res.json(await assembleState(req.householdId!, req.memberId));
}

const hh = (req: AuthedRequest) => req.householdId!;
const nextSort = (table: string) =>
  `(SELECT COALESCE(MAX(sort),0)+1 FROM ${table} WHERE household_id=$1)`;

dataRouter.get('/state', async (req: AuthedRequest, res) => {
  res.json(await assembleState(hh(req), req.memberId));
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
// Resolve the acting member for the current request. Prefer the requester's own
// member_id (correct for every user in a multi-user household); fall back to the
// household's "you" only if that is missing.
async function meMember(householdId: string, memberId?: string) {
  if (memberId) {
    const r = await query(`SELECT name, color, initial FROM members WHERE id=$1 AND household_id=$2`, [memberId, householdId]);
    if (r.rows[0]) return r.rows[0];
  }
  const r = await query(`SELECT name, color, initial FROM members WHERE household_id=$1 AND is_you=true LIMIT 1`, [householdId]);
  return r.rows[0] || { name: 'You', color: '#3B5BFF', initial: 'Y' };
}

// Accept a single id or an array of ids from the client; normalize to string[].
const idsSchema = z.union([z.string(), z.array(z.string())]).optional();
const toIds = (v: string | string[] | undefined) => ([] as string[]).concat(v || []).filter(Boolean);

/** Resolve member ids to household-scoped members, preserving the given order.
 * Unknown/foreign ids are silently dropped (scoping guard). */
async function membersByIds(householdId: string, ids: string[]) {
  if (!ids.length) return [] as { id: string; name: string; color: string }[];
  const r = await query<{ id: string; name: string; color: string }>(
    `SELECT id, name, color FROM members WHERE household_id=$1 AND id = ANY($2::uuid[])`,
    [householdId, ids]
  );
  return ids.map((id) => r.rows.find((m) => m.id === id)).filter(Boolean) as typeof r.rows;
}

/** "A" / "A & B" / "A, B & C" */
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

/** Derive the denormalized event/bill fields from a date + assignees. */
function dateBits(date?: string, time?: string) {
  const iso = date && isoRe.test(date) ? date : null;
  const timeStr = (time || '').trim();
  return {
    iso,
    timeStr,
    label: iso ? formatDateLabel(iso) : 'Upcoming',
    displayTime: timeStr || 'All',
    ampm: timeStr ? '' : 'day',
    dayFlag: iso && iso === sastToday() ? 'today' : '',
  };
}

// Recurrence tokens: none | daily|weekly|monthly|yearly | int/<unit>/<n> |
// pos/<ord>/<wd> (ord = 1..4 or L for last, wd = 0..6 Sun..Sat). Occurrence /
// next-date / RRULE logic lives in ./recur (shared with cron + ICS export).
const recurSchema = z.string().regex(/^(none|daily|weekly|monthly|yearly|int\/(day|week|month|year)\/\d{1,3}|pos\/(L|[1-4])\/[0-6])$/).optional();

const remindSchema = z.coerce.number().int().min(0).max(60).optional();

// ---------------- EVENTS ----------------
const eventSchema = z.object({ title: z.string().min(1), date: z.string().optional(), time: z.string().optional(), who: idsSchema, recur: recurSchema, remindDays: remindSchema });

dataRouter.post('/events', async (req: AuthedRequest, res) => {
  const b = eventSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a title first' });
  const ms = await membersByIds(hh(req), toIds(b.data.who));
  const d = dateBits(b.data.date, b.data.time);
  await query(
    `INSERT INTO events (household_id, title, time, ampm, day, date_label, event_date, event_time, loc, color, illo, assignee_ids, recur, remind_days, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'calendar',$11,$12,$13,${nextSort('events')})`,
    [hh(req), b.data.title, d.displayTime, d.ampm, d.dayFlag, d.label, d.iso, d.timeStr,
     'For ' + (ms.length ? joinNames(ms.map((m) => m.name)) : 'the family'),
     ms[0]?.color || '#3B5BFF', JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none', b.data.remindDays ?? 0]
  );
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `added "${b.data.title}" to the calendar`);
  await sendState(req, res);
});
dataRouter.patch('/events/:id', async (req: AuthedRequest, res) => {
  const b = eventSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a title first' });
  const ms = await membersByIds(hh(req), toIds(b.data.who));
  const d = dateBits(b.data.date, b.data.time);
  await query(
    `UPDATE events SET title=$1, time=$2, ampm=$3, day=$4, date_label=$5, event_date=$6, event_time=$7, loc=$8, color=$9, assignee_ids=$10, recur=$11, remind_days=$12, updated_at=now()
      WHERE id=$13 AND household_id=$14 AND source_id IS NULL`,
    [b.data.title, d.displayTime, d.ampm, d.dayFlag, d.label, d.iso, d.timeStr,
     'For ' + (ms.length ? joinNames(ms.map((m) => m.name)) : 'the family'),
     ms[0]?.color || '#3B5BFF', JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none', b.data.remindDays ?? 0, req.params.id, hh(req)]
  );
  await sendState(req, res);
});
dataRouter.delete('/events/:id', async (req: AuthedRequest, res) => {
  // Imported events are removed by unlinking their calendar, not one-by-one.
  await query(`DELETE FROM events WHERE id=$1 AND household_id=$2 AND source_id IS NULL`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- TASKS ----------------
dataRouter.post('/tasks', async (req: AuthedRequest, res) => {
  const b = z.object({ title: z.string().min(1), type: z.string().optional(), assignees: idsSchema, recur: recurSchema }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Type a to-do' });
  const me = await meMember(hh(req), req.memberId);
  const ms = await membersByIds(hh(req), toIds(b.data.assignees));
  await query(
    `INSERT INTO tasks (household_id, title, from_name, from_color, due, due_key, done, type, assignee_ids, recur, sort)
     VALUES ($1,$2,$3,$4,'Today','today',false,$5,$6,$7,${nextSort('tasks')})`,
    [hh(req), b.data.title, me.name, me.color, b.data.type || 'Task', JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none']
  );
  await addFeed(hh(req), me.name, me.color, me.initial, `added a ${b.data.type === 'Reminder' ? 'reminder' : 'to-do'}: "${b.data.title}"`);
  await sendState(req, res);
});
// One PATCH, two shapes: `{done}` toggles completion (checkboxes); a body with
// `title` edits the task's fields.
dataRouter.patch('/tasks/:id', async (req: AuthedRequest, res) => {
  if (typeof req.body?.title === 'string') {
    const b = z.object({ title: z.string().min(1), type: z.string().optional(), assignees: idsSchema, recur: recurSchema }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Type a to-do' });
    const ms = await membersByIds(hh(req), toIds(b.data.assignees));
    await query(
      `UPDATE tasks SET title=$1, type=COALESCE($2, type), assignee_ids=$3, recur=$4 WHERE id=$5 AND household_id=$6`,
      [b.data.title, b.data.type || null, JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none', req.params.id, hh(req)]
    );
    return sendState(req, res);
  }
  const done = !!req.body?.done;
  // Read the task first so a recurring chore, when completed, re-opens for next
  // time (a fresh not-done copy) and never falls off the list. Only spawn on the
  // not-done → done transition so toggling can't pile up duplicates.
  const before = (await query(`SELECT title, from_name, from_color, type, assignee_ids, recur, done FROM tasks WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)])).rows[0];
  await query(`UPDATE tasks SET done=$1 WHERE id=$2 AND household_id=$3`, [done, req.params.id, hh(req)]);
  if (done && before) {
    const me = await meMember(hh(req), req.memberId);
    await addFeed(hh(req), me.name, me.color, me.initial, `completed "${before.title}"`);
    if (before.recur && before.recur !== 'none' && !before.done) {
      await query(
        `INSERT INTO tasks (household_id, title, from_name, from_color, due, due_key, done, type, assignee_ids, recur, sort)
         VALUES ($1,$2,$3,$4,'Today','today',false,$5,$6,$7,${nextSort('tasks')})`,
        [hh(req), before.title, before.from_name, before.from_color, before.type, JSON.stringify(before.assignee_ids || []), before.recur]
      );
    }
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
  const me = await meMember(hh(req), req.memberId);
  // Store the acting member's id so the client resolves the right avatar/colour
  // (colorFor/initialFor match on member id); fall back to 'you' if unknown.
  await query(
    `INSERT INTO shopping (household_id, name, by_member, got, sort) VALUES ($1,$2,$3,false,${nextSort('shopping')})`,
    [hh(req), b.data.name, req.memberId || 'you']
  );
  await addFeed(hh(req), me.name, me.color, me.initial, `added ${b.data.name} to the shopping list`);
  await sendState(req, res);
});
// `{}` toggles bought; `{name}` renames the item.
dataRouter.patch('/shopping/:id', async (req: AuthedRequest, res) => {
  if (typeof req.body?.name === 'string') {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Type an item' });
    await query(`UPDATE shopping SET name=$1 WHERE id=$2 AND household_id=$3`, [name, req.params.id, hh(req)]);
    return sendState(req, res);
  }
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
  const me = await meMember(hh(req), req.memberId);
  const kind = fam ? 'Family' : me.name;
  const sub = target ? `R0 of R${target.toLocaleString('en-ZA')}` : 'Just getting started';
  await query(
    `INSERT INTO goals (household_id, kind, tag, title, sub, pct, color, target, sort)
     VALUES ($1,$2,$3,$4,$5,0,'#3B5BFF',$6,${nextSort('goals')})`,
    [hh(req), kind, fam ? 'Goal' : 'Personal', b.data.title, sub, target]
  );
  await addFeed(hh(req), me.name, me.color, me.initial, `set a ${fam ? 'family ' : ''}goal: "${b.data.title}"`);
  await sendState(req, res);
});
// One PATCH, two shapes: `{}` logs a quick progress nudge; a body with `title`
// edits the goal (and can add a rand amount via `addAmount`). Both recompute
// `sub` so the "R.. of R.." text never disagrees with the bar.
const goalSub = (pct: number, target: number) =>
  target > 0
    ? `R${Math.round((target * pct) / 100).toLocaleString('en-ZA')} of R${target.toLocaleString('en-ZA')}`
    : pct >= 100 ? 'Done!' : pct > 0 ? 'Making progress' : 'Just getting started';

dataRouter.patch('/goals/:id', async (req: AuthedRequest, res) => {
  const g = (await query(`SELECT pct, target FROM goals WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)])).rows[0];
  if (!g) return res.status(404).json({ error: 'Goal not found' });
  if (typeof req.body?.title === 'string') {
    const b = z.object({
      title: z.string().min(1),
      kind: z.string().optional(),
      target: z.union([z.string(), z.number()]).optional(),
      addAmount: z.union([z.string(), z.number()]).optional(),
    }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Add a goal title' });
    const target = Number(b.data.target) || 0;
    // Carry the saved-so-far amount across a target change, then add new progress.
    const savedSoFar = Math.round((num(g.target) * num(g.pct)) / 100) + (Number(b.data.addAmount) || 0);
    const pct = target > 0 ? Math.min(100, Math.round((savedSoFar / target) * 100)) : num(g.pct);
    const fam = b.data.kind !== 'personal';
    const me = await meMember(hh(req), req.memberId);
    await query(
      `UPDATE goals SET title=$1, kind=$2, tag=$3, target=$4, pct=$5, sub=$6 WHERE id=$7 AND household_id=$8`,
      [b.data.title, fam ? 'Family' : me.name, fam ? 'Goal' : 'Personal', target, pct, goalSub(pct, target), req.params.id, hh(req)]
    );
    const added = Number(b.data.addAmount) || 0;
    if (added > 0) {
      await addFeed(hh(req), me.name, me.color, me.initial, `added R${added.toLocaleString('en-ZA')} to "${b.data.title}"`);
    }
    return sendState(req, res);
  }
  const pct = Math.min(100, num(g.pct) + 8);
  await query(`UPDATE goals SET pct=$1, sub=$2 WHERE id=$3 AND household_id=$4`, [pct, goalSub(pct, num(g.target)), req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/goals/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM goals WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- BILLS ----------------
const billSchema = z.object({ name: z.string().min(1), amount: z.union([z.string(), z.number()]).optional(), due: z.string().optional(), payer: idsSchema, recur: recurSchema, remindDays: remindSchema });

dataRouter.post('/bills', async (req: AuthedRequest, res) => {
  const b = billSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a bill name' });
  const ms = await membersByIds(hh(req), toIds(b.data.payer));
  const iso = b.data.due && isoRe.test(b.data.due) ? b.data.due : null;
  const dueLabel = iso ? formatDateLabel(iso) : (String(b.data.due || '').trim() || 'This month');
  const status = iso && iso < sastToday() ? 'overdue' : 'unpaid';
  await query(
    `INSERT INTO bills (household_id, name, cat, amount, due, due_date, status, payer, color, illo, assignee_ids, recur, remind_days, sort)
     VALUES ($1,$2,'Other',$3,$4,$5,$6,$7,$8,'wallet',$9,$10,$11,${nextSort('bills')})`,
    [hh(req), b.data.name, Number(b.data.amount) || 0, dueLabel, iso, status,
     ms.length ? joinNames(ms.map((m) => m.name)) : 'Shared',
     ms[0]?.color || '#3B5BFF', JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none', b.data.remindDays ?? 0]
  );
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `added the bill "${b.data.name}"`);
  await sendState(req, res);
});
// One PATCH, two shapes: `{status}` marks paid/unpaid (and the cron's overdue
// sweep); a body with `name` edits the bill's fields.
dataRouter.patch('/bills/:id', async (req: AuthedRequest, res) => {
  if (typeof req.body?.name === 'string') {
    const b = billSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Add a bill name' });
    const ms = await membersByIds(hh(req), toIds(b.data.payer));
    const iso = b.data.due && isoRe.test(b.data.due) ? b.data.due : null;
    const dueLabel = iso ? formatDateLabel(iso) : (String(b.data.due || '').trim() || 'This month');
    await query(
      `UPDATE bills SET name=$1, amount=$2, due=$3, due_date=$4, payer=$5, color=$6, assignee_ids=$7, recur=$8, remind_days=$9,
              status = CASE WHEN status='paid' THEN 'paid' WHEN $4::date IS NOT NULL AND $4::date < $10::date THEN 'overdue' ELSE 'unpaid' END
        WHERE id=$11 AND household_id=$12`,
      [b.data.name, Number(b.data.amount) || 0, dueLabel, iso,
       ms.length ? joinNames(ms.map((m) => m.name)) : 'Shared',
       ms[0]?.color || '#3B5BFF', JSON.stringify(ms.map((m) => m.id)), b.data.recur || 'none', b.data.remindDays ?? 0, sastToday(), req.params.id, hh(req)]
    );
    return sendState(req, res);
  }
  const parsed = z.enum(['paid', 'unpaid', 'overdue']).safeParse(req.body?.status);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bill status' });
  // Read the bill first so a recurring bill, when paid, can spawn the next
  // period's bill (fresh + unpaid) - each month tracked on its own row.
  const before = (await query(
    `SELECT name, cat, amount, due, to_char(due_date,'YYYY-MM-DD') AS due_date, payer, color, illo, assignee_ids, recur, status
       FROM bills WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)])).rows[0];
  await query(`UPDATE bills SET status=$1 WHERE id=$2 AND household_id=$3`, [parsed.data, req.params.id, hh(req)]);
  if (parsed.data === 'paid' && before) {
    const me = await meMember(hh(req), req.memberId);
    await addFeed(hh(req), me.name, me.color, me.initial, `marked "${before.name}" as paid`);
    // Only on the unpaid → paid transition, and only if the next occurrence
    // doesn't already exist (idempotent against re-marking paid).
    if (before.recur && before.recur !== 'none' && before.due_date && before.status !== 'paid') {
      const nextIso = advanceIso(before.due_date, before.recur);
      if (nextIso) {
        const dup = await query(`SELECT 1 FROM bills WHERE household_id=$1 AND name=$2 AND due_date=$3 LIMIT 1`, [hh(req), before.name, nextIso]);
        if (!dup.rows.length) {
          const nStatus = nextIso < sastToday() ? 'overdue' : 'unpaid';
          await query(
            `INSERT INTO bills (household_id, name, cat, amount, due, due_date, status, payer, color, illo, assignee_ids, recur, sort)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,${nextSort('bills')})`,
            [hh(req), before.name, before.cat, before.amount, formatDateLabel(nextIso), nextIso, nStatus, before.payer, before.color, before.illo, JSON.stringify(before.assignee_ids || []), before.recur]
          );
        }
      }
    }
  }
  await sendState(req, res);
});
dataRouter.delete('/bills/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM bills WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- BUDGET CATEGORIES ----------------
const PALETTE = ['#3B5BFF', '#16C098', '#FFB020', '#FF6B5C', '#7A5CFF', '#FF5C8A'];
const rNum = z.union([z.string(), z.number()]).optional();

dataRouter.post('/budget', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1).max(60), limit: rNum }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a category name' });
  const count = num((await query(`SELECT COUNT(*) FROM budget WHERE household_id=$1`, [hh(req)])).rows[0].count);
  await query(
    `INSERT INTO budget (household_id, name, spent, budget_limit, color, sort) VALUES ($1,$2,0,$3,$4,${nextSort('budget')})`,
    [hh(req), b.data.name, Number(b.data.limit) || 0, PALETTE[count % PALETTE.length]]
  );
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `added a budget for ${b.data.name}`);
  await sendState(req, res);
});
// Edit name/limit, and optionally log a spend into the ledger. Spends tally up;
// negative amounts are allowed as corrections.
dataRouter.patch('/budget/:id', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1).max(60), limit: rNum, addSpend: rNum, note: z.string().max(120).optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a category name' });
  const upd = await query(
    `UPDATE budget SET name=$1, budget_limit=$2 WHERE id=$3 AND household_id=$4 RETURNING id`,
    [b.data.name, Number(b.data.limit) || 0, req.params.id, hh(req)]
  );
  const spend = Number(b.data.addSpend) || 0;
  if (upd.rows.length && spend !== 0) {
    await query(
      `INSERT INTO budget_spends (household_id, budget_id, amount, note) VALUES ($1,$2,$3,$4)`,
      [hh(req), req.params.id, spend, (b.data.note || '').trim()]
    );
    const me = await meMember(hh(req), req.memberId);
    const noteBit = (b.data.note || '').trim();
    const rands = 'R' + Math.abs(spend).toLocaleString('en-ZA');
    await addFeed(hh(req), me.name, me.color, me.initial,
      spend > 0
        ? `spent ${rands} on ${b.data.name}${noteBit ? ` (${noteBit})` : ''}`
        : `corrected ${b.data.name} spending down by ${rands}`);
  }
  await sendState(req, res);
});
// Remove a single logged spend (fix a mis-entry). Distinct two-segment path so it
// never collides with DELETE /budget/:id (one segment).
dataRouter.delete('/budget/spend/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM budget_spends WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/budget/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM budget WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- SAVINGS GOALS ----------------
dataRouter.post('/savings', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1).max(60), target: rNum, saved: rNum }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a savings goal name' });
  const count = num((await query(`SELECT COUNT(*) FROM savings WHERE household_id=$1`, [hh(req)])).rows[0].count);
  await query(
    `INSERT INTO savings (household_id, name, saved, target, color, sort) VALUES ($1,$2,$3,$4,$5,${nextSort('savings')})`,
    [hh(req), b.data.name, Number(b.data.saved) || 0, Number(b.data.target) || 0, PALETTE[(count + 1) % PALETTE.length]]
  );
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `started saving for "${b.data.name}"`);
  await sendState(req, res);
});
// Edit name/target, and add an amount to the pot (tallies up; negatives allowed
// as corrections). `saved` still accepts a direct total for fixing mistakes.
dataRouter.patch('/savings/:id', async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().min(1).max(60), target: rNum, saved: rNum, addAmount: rNum }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a savings goal name' });
  const add = Number(b.data.addAmount) || 0;
  await query(
    `UPDATE savings SET name=$1, saved=$2::numeric + $6::numeric, target=$3 WHERE id=$4 AND household_id=$5`,
    [b.data.name, Number(b.data.saved) || 0, Number(b.data.target) || 0, req.params.id, hh(req), add]
  );
  if (add > 0) {
    const me = await meMember(hh(req), req.memberId);
    await addFeed(hh(req), me.name, me.color, me.initial, `added R${add.toLocaleString('en-ZA')} to "${b.data.name}" savings`);
  }
  await sendState(req, res);
});
dataRouter.delete('/savings/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM savings WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- SETTLE UP (who owes who) ----------------
const settleSchema = z.object({
  memberId: z.string().min(1),
  dir: z.enum(['in', 'out']), // in = they owe you, out = you owe them
  amount: z.union([z.string(), z.number()]),
  note: z.string().max(120).optional(),
});

/** Validate the settle payload against the household; null if invalid.
 * `actingId` is the member recording the IOU ("you" in their view) — combined
 * with the picked counterparty + direction it yields the absolute debtor
 * (from_member) / creditor (to_member) so the row reads right for everyone. */
async function settleFields(householdId: string, actingId: string | undefined, d: z.infer<typeof settleSchema>) {
  const m = (await query(`SELECT id, name FROM members WHERE id=$1 AND household_id=$2`, [d.memberId, householdId])).rows[0];
  if (!m) return null;
  const amt = Math.abs(Number(d.amount) || 0);
  if (!amt) return null;
  // in = the counterparty owes me → they are the debtor; out = I owe them.
  const fromMember = d.dir === 'in' ? m.id : (actingId || m.id); // debtor
  const toMember = d.dir === 'in' ? (actingId || m.id) : m.id;   // creditor
  return {
    memberId: m.id as string,
    fromMember: fromMember as string,
    toMember: toMember as string,
    txt: d.dir === 'in' ? `${m.name} owes you` : `You owe ${m.name}`,
    detail: (d.note || '').trim(),
    amount: 'R' + amt.toLocaleString('en-ZA'),
    dir: d.dir,
    who: m.name as string,
  };
}

dataRouter.post('/settle', async (req: AuthedRequest, res) => {
  const b = settleSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Pick a person and an amount' });
  const f = await settleFields(hh(req), req.memberId, b.data);
  if (!f) return res.status(400).json({ error: 'Pick a family member and an amount' });
  await query(
    `INSERT INTO settle (household_id, txt, detail, amount, dir, who, member_id, from_member, to_member, settled, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,${nextSort('settle')})`,
    [hh(req), f.txt, f.detail, f.amount, f.dir, f.who, f.memberId, f.fromMember, f.toMember]
  );
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `updated who owes who`);
  await sendState(req, res);
});
dataRouter.delete('/settle/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM settle WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
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
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `added ${b.data.name} to the family`);
  await sendState(req, res);
});
// Edit a member's name / role / colour. Display text snapshotted on old events
// and bills keeps the old name (matches how the feed works); new items pick up
// the new name.
dataRouter.patch('/members/:id', async (req: AuthedRequest, res) => {
  const b = z.object({
    name: z.string().min(1).max(80).optional(),
    role: z.string().max(40).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Invalid details' });
  const name = b.data.name?.trim();
  await query(
    `UPDATE members SET
       name = COALESCE($1, name),
       initial = COALESCE($2, initial),
       role = COALESCE($3, role),
       color = COALESCE($4, color)
     WHERE id=$5 AND household_id=$6`,
    [name || null, name ? name.charAt(0).toUpperCase() : null, b.data.role ?? null, b.data.color || null, req.params.id, hh(req)]
  );
  await sendState(req, res);
});

dataRouter.delete('/members/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM members WHERE id=$1 AND household_id=$2 AND is_you=false`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- INVITES ----------------
// Create a shareable invite for this household. Optionally targets an existing
// placeholder member so the invitee "claims" that member. Returns a token the
// client turns into a /join/<token> link.
dataRouter.post('/invites', async (req: AuthedRequest, res) => {
  const b = z.object({
    memberId: z.string().uuid().optional(),
    role: z.string().max(40).optional(),
    email: z.string().email().max(160).optional(),
  }).safeParse(req.body || {});
  if (!b.success) return res.status(400).json({ error: 'Invalid invite' });
  if (b.data.memberId) {
    const m = (await query(`SELECT id, user_id FROM members WHERE id=$1 AND household_id=$2`, [b.data.memberId, hh(req)])).rows[0];
    if (!m) return res.status(404).json({ error: 'Member not found' });
    if (m.user_id) return res.status(409).json({ error: 'That member has already joined.' });
  }
  const token = crypto.randomBytes(24).toString('base64url');
  await query(
    `INSERT INTO invites (household_id, token, member_id, role, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + interval '14 days')`,
    [hh(req), token, b.data.memberId || null, b.data.role || '', req.userId]
  );

  // Optionally email the invite straight to the person.
  let emailed = false;
  if (b.data.email) {
    const hhRow = (await query(`SELECT name FROM households WHERE id=$1`, [hh(req)])).rows[0];
    const inviter = (await query(`SELECT name FROM users WHERE id=$1`, [req.userId])).rows[0];
    emailed = await sendEmail({
      to: b.data.email,
      ...inviteEmail({ inviterName: inviter?.name, householdName: hhRow?.name || 'a household', joinUrl: `${APP_URL}/join/${token}` }),
    });
  }
  res.json({ token, emailed });
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
    [hh(req), `Reminder for ${name}`, 'A nudge was sent - don’t forget!']
  );
  // Fire a real push to the rest of the household (best-effort; never blocks).
  pushToHousehold(hh(req), { title: `Reminder for ${name}`, body: 'A nudge was sent - don’t forget!', url: '/' }, req.userId).catch(() => {});
  await sendState(req, res);
});

// ---------------- PUSH SUBSCRIPTIONS ----------------
dataRouter.get('/push/key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey });
});
dataRouter.post('/push/subscribe', async (req: AuthedRequest, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  await saveSubscription(hh(req), req.userId, sub);
  // Immediate confirmation so the user sees push working right away.
  pushToSub(sub, { title: 'Croft notifications are on', body: 'Reminders and nudges will appear here.', url: '/' }).catch(() => {});
  res.json({ ok: true });
});
dataRouter.post('/push/unsubscribe', async (req: AuthedRequest, res) => {
  if (req.body?.endpoint) await removeSubscription(String(req.body.endpoint));
  res.json({ ok: true });
});

// ---------------- SETTLE ----------------
// One PATCH, two shapes: `{}` marks the IOU as settled; a body with `memberId`
// edits the row (person / direction / amount / note).
dataRouter.patch('/settle/:id', async (req: AuthedRequest, res) => {
  if (typeof req.body?.memberId === 'string') {
    const b = settleSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Pick a person and an amount' });
    const f = await settleFields(hh(req), req.memberId, b.data);
    if (!f) return res.status(400).json({ error: 'Pick a family member and an amount' });
    // If the editor isn't a party to this IOU (they're viewing a debt between two
    // other members), keep the original debtor/creditor - otherwise recomputing
    // from the editor's perspective would silently reassign the debt to them.
    const existing = (await query(`SELECT from_member, to_member FROM settle WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)])).rows[0];
    let fromMember = f.fromMember, toMember = f.toMember;
    if (existing?.from_member && existing?.to_member &&
        req.memberId !== existing.from_member && req.memberId !== existing.to_member) {
      fromMember = existing.from_member; toMember = existing.to_member;
    }
    await query(
      `UPDATE settle SET detail=$1, amount=$2, member_id=$3, from_member=$4, to_member=$5 WHERE id=$6 AND household_id=$7`,
      [f.detail, f.amount, f.memberId, fromMember, toMember, req.params.id, hh(req)]
    );
    return sendState(req, res);
  }
  await query(`UPDATE settle SET settled=true WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- MEAL PLANNER ----------------
const mealSchema = z.object({ date: z.string().regex(isoRe), title: z.string().min(1).max(80) });
dataRouter.post('/meals', async (req: AuthedRequest, res) => {
  const b = mealSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a meal' });
  await query(`INSERT INTO meals (household_id, date, title) VALUES ($1,$2,$3)`, [hh(req), b.data.date, b.data.title.trim()]);
  await sendState(req, res);
});
dataRouter.patch('/meals/:id', async (req: AuthedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Add a meal' });
  await query(`UPDATE meals SET title=$1 WHERE id=$2 AND household_id=$3`, [title.slice(0, 80), req.params.id, hh(req)]);
  await sendState(req, res);
});
dataRouter.delete('/meals/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM meals WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});

// ---------------- HOUSEHOLD INFO BOARD ----------------
const infoSchema = z.object({ category: z.string().max(40).optional(), label: z.string().min(1).max(80), value: z.string().max(600).optional() });
dataRouter.post('/household-info', async (req: AuthedRequest, res) => {
  const b = infoSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a label' });
  await query(
    `INSERT INTO household_info (household_id, category, label, value, sort) VALUES ($1,$2,$3,$4,${nextSort('household_info')})`,
    [hh(req), (b.data.category || 'General').trim(), b.data.label.trim(), (b.data.value || '').trim()]
  );
  await sendState(req, res);
});
dataRouter.patch('/household-info/:id', async (req: AuthedRequest, res) => {
  const b = infoSchema.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Add a label' });
  await query(
    `UPDATE household_info SET category=$1, label=$2, value=$3 WHERE id=$4 AND household_id=$5`,
    [(b.data.category || 'General').trim(), b.data.label.trim(), (b.data.value || '').trim(), req.params.id, hh(req)]
  );
  await sendState(req, res);
});
dataRouter.delete('/household-info/:id', async (req: AuthedRequest, res) => {
  await query(`DELETE FROM household_info WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
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

// Subscribable calendar (ICS) feed URL for this household - creates the token
// on first use. Add it in Apple Calendar (webcal) or Google Calendar (from URL).
dataRouter.get('/calendar-feed', async (req: AuthedRequest, res) => {
  const row = (await query(`SELECT calendar_token FROM households WHERE id=$1`, [hh(req)])).rows[0];
  let token = row?.calendar_token as string | undefined;
  if (!token) {
    token = crypto.randomBytes(18).toString('base64url');
    await query(`UPDATE households SET calendar_token=$1 WHERE id=$2`, [token, hh(req)]);
  }
  const url = `${APP_URL}/api/calendar/${token}.ics`;
  res.json({ url, webcal: url.replace(/^https?:\/\//, 'webcal://') });
});

// ---------------- IMPORTED CALENDARS (inbound) ----------------
dataRouter.post('/calendar-sources', async (req: AuthedRequest, res) => {
  const b = z.object({ url: z.string().min(6).max(2000), name: z.string().max(60).optional() }).safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'Paste your calendar link.' });
  // Cap how many calendars a household can link.
  const count = num((await query(`SELECT COUNT(*) FROM calendar_sources WHERE household_id=$1`, [hh(req)])).rows[0].count);
  if (count >= 5) return res.status(400).json({ error: 'You can link up to 5 calendars.' });
  const name = (b.data.name || 'Imported calendar').trim() || 'Imported calendar';
  const src = (await query(
    `INSERT INTO calendar_sources (household_id, url, name) VALUES ($1,$2,$3) RETURNING id`,
    [hh(req), b.data.url.trim(), name]
  )).rows[0];
  try {
    await syncSource({ id: src.id, household_id: hh(req), url: b.data.url.trim(), name });
  } catch (e: any) {
    // Roll back the broken source so the user just sees the error and can retry.
    await query(`DELETE FROM calendar_sources WHERE id=$1 AND household_id=$2`, [src.id, hh(req)]);
    return res.status(400).json({ error: e?.message || 'Could not import that calendar.' });
  }
  const me = await meMember(hh(req), req.memberId);
  await addFeed(hh(req), me.name, me.color, me.initial, `linked the calendar "${name}"`);
  await sendState(req, res);
});
dataRouter.post('/calendar-sources/:id/refresh', async (req: AuthedRequest, res) => {
  const s = (await query(`SELECT id, url, name FROM calendar_sources WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)])).rows[0];
  if (!s) return res.status(404).json({ error: 'Calendar not found' });
  try {
    await syncSource({ id: s.id, household_id: hh(req), url: s.url, name: s.name });
  } catch (e: any) {
    await query(`UPDATE calendar_sources SET last_error=$1 WHERE id=$2 AND household_id=$3`, [String(e?.message || 'sync failed').slice(0, 200), s.id, hh(req)]);
    return res.status(400).json({ error: e?.message || 'Could not refresh that calendar.' });
  }
  await sendState(req, res);
});
dataRouter.delete('/calendar-sources/:id', async (req: AuthedRequest, res) => {
  // Imported events cascade-delete via the FK.
  await query(`DELETE FROM calendar_sources WHERE id=$1 AND household_id=$2`, [req.params.id, hh(req)]);
  await sendState(req, res);
});
