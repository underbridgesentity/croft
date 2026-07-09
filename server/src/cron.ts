import { Router, type Request } from 'express';
import { query, tx } from './db.js';
import { sendEmail, emailLayout, esc } from './mailer.js';
import { pushToHousehold, pushToMembers } from './push.js';
import { sastToday, sastPlus, formatDateLabel } from './dates.js';
import { occursOn, advanceIso } from './recur.js';
import { syncSource } from './importCalendar.js';

export const cronRouter = Router();
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'https://www.croftapp.co.za';

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set. Header only - a ?key= query param would leak the secret into request
// logs. (Manual runs: curl -H "Authorization: Bearer $CRON_SECRET" ...)
function authorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

const ul = (items: string[]) =>
  items.length ? `<ul style="padding-left:18px;margin:6px 0 0">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
const rand = (n: number) => (n === 1 ? '' : 's');
const rands = (n: number) => 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA'); // whole rands for summaries

// Email cadence lives in household settings. Legacy rows only had a boolean
// `email` (true = daily digest, false = none); those map to 'both'/'off' so the
// new weekly digest reaches existing active households too.
type Cadence = 'off' | 'daily' | 'weekly' | 'both';
function cadenceOf(settings: any): Cadence {
  const c = settings?.emailCadence;
  if (c === 'off' || c === 'daily' || c === 'weekly' || c === 'both') return c;
  return settings?.email === false ? 'off' : 'both';
}
/** A user's own cadence wins; NULL falls back to the household default. */
function userCadence(u: { email_cadence?: string | null }, householdDefault: Cadence): Cadence {
  const c = u.email_cadence;
  if (c === 'off' || c === 'daily' || c === 'weekly' || c === 'both') return c;
  return householdDefault;
}

/** Daily run: mark overdue bills, push a morning reminder for what's happening
 * today, and email each household a summary (today's events, tomorrow's events,
 * bills due/overdue, open to-dos). Skips households with nothing to report. */
cronRouter.get('/digest', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const today = sastToday();
  const tomorrow = sastPlus(1);

  const users = (
    await query<{ id: string; email: string; name: string; email_cadence: string | null; household_id: string; hh_name: string; settings: any }>(
      `SELECT u.id, u.email, u.name, u.email_cadence, u.household_id, h.name AS hh_name, h.settings
         FROM users u JOIN households h ON h.id = u.household_id
        WHERE u.email IS NOT NULL AND u.household_id IS NOT NULL`
    )
  ).rows;

  const byHh = new Map<string, { name: string; users: typeof users; cadence: Cadence }>();
  for (const u of users) {
    if (!byHh.has(u.household_id)) {
      byHh.set(u.household_id, { name: u.hh_name, users: [], cadence: cadenceOf(u.settings) });
    }
    byHh.get(u.household_id)!.users.push(u);
  }

  let emailsSent = 0;
  let pushesSent = 0;

  for (const [hhId, info] of byHh) {
    // One household's bad data or a transient error must never abort the digest
    // for every household after it in the loop.
    try {
    // Autopay bills settle themselves on their due date (they're paid by the
    // bank, not by a person) - mark paid and spawn the next occurrence, exactly
    // like a manual "Mark paid" would.
    const autoDue = (await query<{ id: string; name: string; cat: string; amount: number; due_date: string; payer: string; color: string; illo: string; assignee_ids: string[]; recur: string; remind_days: number }>(
      `SELECT id, name, cat, amount, to_char(due_date,'YYYY-MM-DD') AS due_date, payer, color, illo, assignee_ids, recur, remind_days
         FROM bills WHERE household_id=$1 AND autopay=true AND status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date <= $2`,
      [hhId, today]
    )).rows;
    for (const ab of autoDue) {
      // Mark-paid + spawn + feed are ONE transaction per bill: a crash between
      // them must not leave a paid bill with no successor (which would silently
      // end the recurring chain - re-runs skip already-paid bills).
      await tx(async (c) => {
        const paid = await c.query(
          `UPDATE bills SET status='paid' WHERE id=$1 AND household_id=$2 AND status IN ('unpaid','overdue') RETURNING id`,
          [ab.id, hhId]
        );
        if (!paid.rows.length) return; // someone paid it meanwhile
        if (ab.recur && ab.recur !== 'none') {
          const nextIso = advanceIso(ab.due_date, ab.recur);
          if (nextIso) {
            // Plain SELECT (no aggregate) so WHERE NOT EXISTS actually
            // suppresses the row - MAX() would emit one row regardless.
            await c.query(
              `INSERT INTO bills (household_id, name, cat, amount, due, due_date, status, payer, color, illo, assignee_ids, recur, remind_days, autopay, sort)
               SELECT $1,$2,$3,$4,$5,$6,'unpaid',$7,$8,$9,$10,$11,$12,true,
                      (SELECT COALESCE(MAX(sort),0)+1 FROM bills WHERE household_id=$1)
                WHERE NOT EXISTS (SELECT 1 FROM bills WHERE household_id=$1 AND name=$2 AND status<>'paid' AND due_date=$6::date)`,
              [hhId, ab.name, ab.cat, ab.amount, formatDateLabel(nextIso), nextIso, ab.payer, ab.color, ab.illo, JSON.stringify(ab.assignee_ids || []), ab.recur, ab.remind_days ?? 0]
            );
          }
        }
        await c.query(
          `INSERT INTO feed (household_id, who, color, initial, txt) VALUES ($1,'Croft','#3B5BFF','C',$2)`,
          [hhId, `auto-paid ${ab.name} (R${Number(ab.amount).toLocaleString('en-ZA')})`]
        );
      });
    }

    // Keep bill statuses honest.
    await query(
      `UPDATE bills SET status='overdue' WHERE household_id=$1 AND status='unpaid' AND due_date IS NOT NULL AND due_date < $2`,
      [hhId, today]
    );

    // All dated events (native + imported instances). Occurrences are computed in
    // JS via occursOn so a recurring event reminds on every occurrence, not only
    // its anchor date. (Imported events are recur='none' → exact-date match.)
    const dated = (await query<{ title: string; event_time: string; event_date: string; end_date: string | null; recur: string; remind_days: number }>(
      `SELECT title, event_time, to_char(event_date,'YYYY-MM-DD') AS event_date, to_char(end_date,'YYYY-MM-DD') AS end_date, recur, remind_days
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL`, [hhId]
    )).rows;
    const byTime = (a: { event_time: string }, b: { event_time: string }) => (a.event_time || '').localeCompare(b.event_time || '');
    const onDay = (e: { event_date: string; end_date: string | null; recur: string }, day: string) =>
      occursOn(e.event_date, e.recur, day) || !!(e.end_date && e.event_date <= day && day <= e.end_date);
    const eventsToday = dated.filter((e) => onDay(e, today)).sort(byTime);
    const eventsTom = dated.filter((e) => onDay(e, tomorrow) && !onDay(e, today)).sort(byTime);
    const billsDue = (await query<{ name: string; amount: number; status: string }>(
      `SELECT name, amount, status FROM bills WHERE household_id=$1 AND status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date <= $2 ORDER BY due_date`, [hhId, today]
    )).rows;
    const openTasks = Number(
      (await query(`SELECT COUNT(*) FROM tasks WHERE household_id=$1 AND done=false`, [hhId])).rows[0].count
    );
    // To-dos/reminders with a real due date participate like events: due-today
    // items appear in the morning push + email, overdue ones get flagged.
    const tasksToday = (await query<{ title: string; type: string }>(
      `SELECT title, type FROM tasks WHERE household_id=$1 AND done=false AND due_date=$2 ORDER BY due_time NULLS LAST, sort`, [hhId, today]
    )).rows;
    const tasksOver = Number(
      (await query(`SELECT COUNT(*) FROM tasks WHERE household_id=$1 AND done=false AND due_date < $2`, [hhId, today])).rows[0].count
    );
    // Lead-time reminders: items whose "remind me N days before" lands today.
    const eventsSoon = dated
      .filter((e) => e.remind_days > 0 && occursOn(e.event_date, e.recur, sastPlus(e.remind_days)))
      .map((e) => ({ title: e.title, days_away: e.remind_days }));
    const billsSoon = (await query<{ name: string; amount: number; days_away: number }>(
      `SELECT name, amount, (due_date - $2::date) AS days_away FROM bills
        WHERE household_id=$1 AND status IN ('unpaid','overdue') AND remind_days > 0 AND due_date = ($2::date + remind_days) ORDER BY due_date`, [hhId, today]
    )).rows;
    const inDays = (n: number) => (n === 1 ? 'tomorrow' : `in ${n} days`);
    // Tonight's planned dinner rides along in the digest (never a trigger on
    // its own - meal plans shouldn't ping quiet households).
    const tonight = (await query<{ title: string }>(
      `SELECT title FROM meals WHERE household_id=$1 AND date=$2 ORDER BY created_at LIMIT 1`, [hhId, today]
    )).rows[0];

    // Morning push + in-app notification for anything happening today or with a
    // lead-time reminder landing today.
    const soonCount = eventsSoon.length + billsSoon.length;
    if (eventsToday.length || billsDue.length || soonCount || tasksToday.length || tasksOver) {
      const bits: string[] = [];
      if (eventsToday.length) bits.push(`${eventsToday.length} event${rand(eventsToday.length)}`);
      if (tasksToday.length) bits.push(`${tasksToday.length} to-do${rand(tasksToday.length)} due`);
      if (tasksOver) bits.push(`${tasksOver} overdue`);
      if (billsDue.length) bits.push(`${billsDue.length} bill${rand(billsDue.length)} due`);
      if (soonCount) bits.push(`${soonCount} coming up`);
      if (tonight) bits.push(`Tonight: ${tonight.title}`);
      // Undated to-dos ride along as a count only (they don't trigger a push on
      // their own, or every household with a standing list would ping daily).
      if (!tasksToday.length && !tasksOver && openTasks) bits.push(`${openTasks} to-do${rand(openTasks)} open`);
      const title = (eventsToday.length || billsDue.length || tasksToday.length) ? `Today in ${info.name}` : `Coming up in ${info.name}`;
      const body = bits.join(' · ');
      // In-app bell entry - guarded so a re-run of the cron doesn't duplicate it.
      // The guard compares SAST calendar days (created_at is UTC).
      await query(
        `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
         SELECT $1,'calendar','#3B5BFF',$2,$3,'just now',true
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications WHERE household_id=$1 AND title=$2 AND (created_at + interval '2 hours')::date = $4::date
          )`,
        [hhId, title, body, today]
      );
      try {
        await pushToHousehold(hhId, { title, body, url: '/' });
        pushesSent++;
      } catch { /* ignore */ }
    }

    // Email summary - each member's own cadence decides (household = default).
    const hasContent = openTasks || billsDue.length || eventsToday.length || eventsTom.length || soonCount || tasksToday.length || tasksOver;
    const dailyUsers = info.users.filter((u) => ['daily', 'both'].includes(userCadence(u, info.cadence)));
    if (dailyUsers.length && hasContent) {
      const sections =
        (eventsToday.length || tasksToday.length || tonight
          ? `<p style="margin:16px 0 2px;font-weight:700">Today</p>${ul([
              ...eventsToday.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${esc(e.title)}`),
              ...tasksToday.map((t) => `${esc(t.title)} (${t.type === 'Reminder' ? 'reminder' : 'to-do'} due)`),
              ...(tonight ? [`Tonight: ${esc(tonight.title)}`] : []),
            ])}`
          : '') +
        (eventsTom.length ? `<p style="margin:16px 0 2px;font-weight:700">Tomorrow</p>${ul(eventsTom.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${esc(e.title)}`))}` : '') +
        (billsDue.length ? `<p style="margin:16px 0 2px;font-weight:700">Bills due</p>${ul(billsDue.map((b) => `${esc(b.name)} - R${Number(b.amount).toLocaleString('en-ZA')} (${b.status === 'overdue' ? 'overdue' : 'due today'})`))}` : '') +
        (soonCount ? `<p style="margin:16px 0 2px;font-weight:700">Coming up</p>${ul([...eventsSoon.map((e) => `${esc(e.title)} - ${inDays(e.days_away)}`), ...billsSoon.map((b) => `${esc(b.name)} R${Number(b.amount).toLocaleString('en-ZA')} - ${inDays(b.days_away)}`)])}` : '');
      const head = `You have <strong>${openTasks}</strong> open to-do${rand(openTasks)} in ${esc(info.name)}.`;
      for (const u of dailyUsers) {
        const ok = await sendEmail({
          to: u.email,
          subject: `Your ${info.name} summary`,
          html: emailLayout(`Good morning${u.name ? `, ${u.name.split(' ')[0]}` : ''}`, head + sections, { label: 'Open Croft', url: APP_URL }),
          text: `${info.name}: ${openTasks} open to-dos, ${eventsToday.length} events today, ${billsDue.length} bills due. ${APP_URL}`,
        });
        if (ok) emailsSent++;
      }
    }
    } catch (e: any) {
      console.error('[croft] digest: skipped household', hhId, e?.message || e);
    }
  }

  // Refresh linked external calendars (best-effort; one bad URL never blocks
  // the rest, and a failure is recorded on the source for the user to see).
  let calsSynced = 0;
  const sources = (await query<{ id: string; household_id: string; url: string; name: string }>(
    `SELECT id, household_id, url, name FROM calendar_sources`,
    [],
    { scoped: false } // system cron: every household's sources, each synced with its own household_id
  )).rows;
  for (const s of sources) {
    try { await syncSource(s); calsSynced++; }
    catch (e: any) {
      await query(`UPDATE calendar_sources SET last_error=$1 WHERE id=$2 AND household_id=$3`,
        [String(e?.message || 'sync failed').slice(0, 200), s.id, s.household_id]).catch(() => {});
    }
  }

  res.json({ ok: true, households: byHh.size, emailsSent, pushesSent, calsSynced });
});

/** Every 15 minutes: a heads-up push ~an hour before each timed event today.
 * The morning digest tells you what the day holds; this one makes sure the
 * moment itself isn't missed. Window logic: with a 15-minute cadence, sending
 * when the event starts in (45, 60] minutes fires exactly once per event, and
 * the in-app notification guard keeps a cron retry from double-pushing. */
cronRouter.get('/event-reminders', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const today = sastToday();
  const sastNow = new Date(Date.now() + 2 * 3600 * 1000); // SAST = UTC+2, no DST
  const nowMin = sastNow.getUTCHours() * 60 + sastNow.getUTCMinutes();

  // All timed events across households (system cron); recurrence resolved in JS.
  const rows = (await query<{ household_id: string; title: string; event_time: string; event_date: string; recur: string; assignee_ids: string[] | null }>(
    `SELECT household_id, title, event_time, to_char(event_date,'YYYY-MM-DD') AS event_date, recur, assignee_ids
       FROM events WHERE event_date IS NOT NULL AND event_time IS NOT NULL AND event_time <> ''`,
    [],
    { scoped: false } // every household's events; each push goes to its own household
  )).rows;
  // Timed to-dos/reminders due today get the same heads-up (their whole point).
  const taskRows = (await query<{ household_id: string; title: string; due_time: string; type: string; assignee_ids: string[] | null }>(
    `SELECT household_id, title, due_time, type, assignee_ids
       FROM tasks WHERE done=false AND due_date=$1 AND due_time IS NOT NULL AND due_time <> ''`,
    [today],
    { scoped: false }
  )).rows;

  // dayOffset 0 = happening today, 1 = tomorrow (so a 00:30 event still gets
  // its hour-before reminder at ~23:30 the night before).
  const inWindow = (hhmm: string, dayOffset = 0) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return false;
    const until = dayOffset * 1440 + Number(m[1]) * 60 + Number(m[2]) - nowMin;
    return until > 45 && until <= 60;
  };
  // Bell entry doubles as the exactly-once guard (same pattern as the digest);
  // SAST-day comparison so the window doesn't shift 2h against UTC.
  const remindOnce = async (householdId: string, title: string, body: string, assigneeIds: string[] | null) => {
    const ins = await query(
      `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
       SELECT $1,'calendar','#FFB020',$2,$3,'just now',true
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications WHERE household_id=$1 AND title=$2 AND (created_at + interval '2 hours')::date = $4::date
        ) RETURNING id`,
      [householdId, title, body, today]
    );
    if (!ins.rows.length) return false; // already reminded (retry or duplicate row)
    // Assigned items ping the assignees' devices; unassigned = whole household.
    await pushToMembers(householdId, assigneeIds || [], { title, body, url: '/' });
    return true;
  };

  let sent = 0;
  for (const e of rows) {
    try {
      const dueNow = (occursOn(e.event_date, e.recur, today) && inWindow(e.event_time))
        || (occursOn(e.event_date, e.recur, sastPlus(1)) && inWindow(e.event_time, 1));
      if (!dueNow) continue;
      if (await remindOnce(e.household_id, `${e.title.trim()} at ${e.event_time}`, 'Coming up in about an hour', e.assignee_ids)) sent++;
    } catch (err: any) {
      console.error('[croft] event-reminders: skipped event', e.title, err?.message || err);
    }
  }
  for (const t of taskRows) {
    try {
      if (!inWindow(t.due_time)) continue;
      const noun = t.type === 'Reminder' ? 'Reminder' : 'To-do';
      if (await remindOnce(t.household_id, `${noun}: ${t.title.trim()} at ${t.due_time}`, 'Due in about an hour', t.assignee_ids)) sent++;
    } catch (err: any) {
      console.error('[croft] event-reminders: skipped task', t.title, err?.message || err);
    }
  }

  res.json({ ok: true, checked: rows.length + taskRows.length, sent });
});

/** Weekly run (Sunday evening): a calm "week ahead" overview - the next 7 days
 * of events, bills due this week + overdue + still-unpaid, a money snapshot
 * (budget, savings, who-owes-who) and open to-dos. Purely read-only: unlike the
 * daily digest it never marks bills overdue, writes notifications, or pushes -
 * it only emails households whose cadence includes the weekly summary. */
cronRouter.get('/weekly', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const today = sastToday();
  const weekEnd = sastPlus(6);
  const weekDates = Array.from({ length: 7 }, (_, i) => sastPlus(i));
  const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const users = (
    await query<{ id: string; email: string; name: string; email_cadence: string | null; household_id: string; hh_name: string; settings: any }>(
      `SELECT u.id, u.email, u.name, u.email_cadence, u.household_id, h.name AS hh_name, h.settings
         FROM users u JOIN households h ON h.id = u.household_id
        WHERE u.email IS NOT NULL AND u.household_id IS NOT NULL`
    )
  ).rows;

  const byHh = new Map<string, { name: string; users: typeof users; cadence: Cadence }>();
  for (const u of users) {
    if (!byHh.has(u.household_id)) byHh.set(u.household_id, { name: u.hh_name, users: [], cadence: cadenceOf(u.settings) });
    byHh.get(u.household_id)!.users.push(u);
  }

  let emailsSent = 0;
  for (const [hhId, info] of byHh) {
    try {
    const weeklyUsers = info.users.filter((u) => ['weekly', 'both'].includes(userCadence(u, info.cadence)));
    if (!weeklyUsers.length) continue;

    // Events across the next 7 days (recurrence-aware, so repeats show).
    const dated = (await query<{ title: string; event_time: string; event_date: string; end_date: string | null; recur: string }>(
      `SELECT title, event_time, to_char(event_date,'YYYY-MM-DD') AS event_date, to_char(end_date,'YYYY-MM-DD') AS end_date, recur
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL`, [hhId]
    )).rows;
    const weekEvents: { date: string; title: string; time: string }[] = [];
    // Multi-day events appear on every covered day of the week, not just day 1.
    const coversDay = (e: (typeof dated)[number], d: string) =>
      occursOn(e.event_date, e.recur, d) || !!(e.end_date && e.event_date <= d && d <= e.end_date);
    for (const d of weekDates) for (const e of dated) if (coversDay(e, d)) weekEvents.push({ date: d, title: e.title, time: e.event_time });
    weekEvents.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

    // Bills: overdue + due within the week, plus still-unpaid ones with no date
    // (which the daily digest never surfaces, so they'd otherwise be forgotten).
    const billsWeek = (await query<{ name: string; amount: number; due: string; status: string }>(
      `SELECT name, amount, to_char(due_date,'YYYY-MM-DD') AS due, status FROM bills
        WHERE household_id=$1 AND status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date <= $2 ORDER BY due_date`, [hhId, weekEnd]
    )).rows;
    const billsNoDate = (await query<{ name: string; amount: number }>(
      `SELECT name, amount FROM bills WHERE household_id=$1 AND status='unpaid' AND due_date IS NULL ORDER BY sort`, [hhId]
    )).rows;

    // Money snapshot: this SAST month's budget, savings, and who-owes-who.
    const month = today.slice(0, 7);
    const budget = (await query<{ name: string; budget_limit: number; spent: number }>(
      `SELECT b.name, b.budget_limit,
              COALESCE((SELECT SUM(s.amount) FROM budget_spends s WHERE s.budget_id=b.id
                         AND to_char(s.created_at + interval '2 hours','YYYY-MM')=$2),0) AS spent
         FROM budget b WHERE b.household_id=$1 ORDER BY b.sort`, [hhId, month]
    )).rows;
    const savings = (await query<{ name: string; saved: number; target: number }>(
      `SELECT name, saved, target FROM savings WHERE household_id=$1 ORDER BY sort`, [hhId]
    )).rows;
    // Family goals with a target date - a weekly nudge on how the countdown
    // stands. Personal goals are private and stay out of shared email.
    const goalsDue = (await query<{ title: string; pct: number; deadline: string }>(
      `SELECT title, pct, to_char(deadline,'YYYY-MM-DD') AS deadline FROM goals
        WHERE household_id=$1 AND member_id IS NULL AND deadline IS NOT NULL AND pct < 100 ORDER BY deadline LIMIT 6`, [hhId]
    )).rows;
    const members = (await query<{ id: string; name: string }>(`SELECT id, name FROM members WHERE household_id=$1`, [hhId])).rows;
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const settle = (await query<{ amount: string; from_member: string; to_member: string }>(
      `SELECT amount, from_member, to_member FROM settle WHERE household_id=$1 AND settled=false`, [hhId]
    )).rows.filter((s) => s.from_member && s.to_member && nameOf.has(s.from_member) && nameOf.has(s.to_member));
    const openCount = Number((await query(`SELECT COUNT(*) AS c FROM tasks WHERE household_id=$1 AND done=false`, [hhId])).rows[0].c);
    const openTasks = (await query<{ title: string }>(`SELECT title FROM tasks WHERE household_id=$1 AND done=false ORDER BY sort, created_at LIMIT 8`, [hhId])).rows;

    const spentTotal = budget.reduce((a, b) => a + Number(b.spent), 0);
    const limitTotal = budget.reduce((a, b) => a + Number(b.budget_limit), 0);
    const hasContent = weekEvents.length || billsWeek.length || billsNoDate.length || savings.length || settle.length || openCount || spentTotal > 0;
    if (!hasContent) continue;

    const overBudget = budget.filter((b) => Number(b.budget_limit) > 0 && Number(b.spent) > Number(b.budget_limit));
    const heading = (t: string) => `<p style="margin:18px 0 2px;font-weight:700">${t}</p>`;
    const sections =
      (weekEvents.length ? heading('This week') + ul(weekEvents.map((e) => `${fmtDay(e.date)}${e.time ? ' · ' + e.time : ''} — ${esc(e.title.trim())}`)) : '') +
      (billsWeek.length || billsNoDate.length
        ? heading('Bills') + ul([
            ...billsWeek.map((b) => `${esc(b.name.trim())} — ${rands(b.amount)} · ${b.due < today ? 'overdue' : 'due ' + fmtDay(b.due)}`),
            ...billsNoDate.map((b) => `${esc(b.name.trim())} — ${rands(b.amount)} · unpaid (no due date set)`),
          ])
        : '') +
      (spentTotal > 0 || limitTotal > 0
        ? heading('Budget this month') +
          `<div style="font-size:15px">Spent <strong>${rands(spentTotal)}</strong>${limitTotal > 0 ? ` of ${rands(limitTotal)} budgeted` : ''}.</div>` +
          (overBudget.length ? ul(overBudget.map((b) => `${esc(b.name.trim())} is over budget — ${rands(b.spent)} / ${rands(b.budget_limit)}`)) : '')
        : '') +
      (settle.length ? heading('Who owes who') + ul(settle.map((s) => `${esc(nameOf.get(s.from_member))} owes ${esc(nameOf.get(s.to_member))} ${esc(s.amount)}`)) : '') +
      (savings.length ? heading('Savings goals') + ul(savings.map((v) => `${esc(v.name.trim())} — ${rands(v.saved)} / ${rands(v.target)}`)) : '') +
      (goalsDue.length ? heading('Family goals') + ul(goalsDue.map((g) => `${esc(g.title.trim())} — ${Number(g.pct)}% · target ${fmtDay(g.deadline)}${g.deadline < today ? ' (passed)' : ''}`)) : '') +
      (openCount ? heading(`To-dos (${openCount} open)`) + ul(openTasks.map((t) => esc(t.title.trim()))) : '');

    const head = `Here's the week ahead in <strong>${esc(info.name)}</strong>.`;
    for (const u of weeklyUsers) {
      const ok = await sendEmail({
        to: u.email,
        subject: `The week ahead in ${info.name}`,
        html: emailLayout(`Your week ahead${u.name ? `, ${u.name.split(' ')[0]}` : ''}`, head + sections, { label: 'Open Croft', url: APP_URL }),
        text: `The week ahead in ${info.name}: ${weekEvents.length} event${rand(weekEvents.length)}, ${billsWeek.length + billsNoDate.length} bill${rand(billsWeek.length + billsNoDate.length)}, ${openCount} open to-do${rand(openCount)}. ${APP_URL}`,
      });
      if (ok) emailsSent++;
    }
    } catch (e: any) {
      console.error('[croft] weekly: skipped household', hhId, e?.message || e);
    }
  }

  res.json({ ok: true, households: byHh.size, emailsSent });
});
