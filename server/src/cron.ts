import { Router, type Request } from 'express';
import { query } from './db.js';
import { sendEmail, emailLayout } from './mailer.js';
import { pushToHousehold } from './push.js';
import { sastToday, sastPlus } from './dates.js';
import { occursOn } from './recur.js';
import { syncSource } from './importCalendar.js';

export const cronRouter = Router();
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'https://www.croftapp.co.za';

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
// Also accept ?key= for manual runs.
function authorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  if (req.headers.authorization === `Bearer ${CRON_SECRET}`) return true;
  if (req.query.key === CRON_SECRET) return true;
  return false;
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

/** Daily run: mark overdue bills, push a morning reminder for what's happening
 * today, and email each household a summary (today's events, tomorrow's events,
 * bills due/overdue, open to-dos). Skips households with nothing to report. */
cronRouter.get('/digest', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const today = sastToday();
  const tomorrow = sastPlus(1);

  const users = (
    await query<{ id: string; email: string; name: string; household_id: string; hh_name: string; settings: any }>(
      `SELECT u.id, u.email, u.name, u.household_id, h.name AS hh_name, h.settings
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
    // Keep bill statuses honest.
    await query(
      `UPDATE bills SET status='overdue' WHERE household_id=$1 AND status='unpaid' AND due_date IS NOT NULL AND due_date < $2`,
      [hhId, today]
    );

    // All dated events (native + imported instances). Occurrences are computed in
    // JS via occursOn so a recurring event reminds on every occurrence, not only
    // its anchor date. (Imported events are recur='none' → exact-date match.)
    const dated = (await query<{ title: string; event_time: string; event_date: string; recur: string; remind_days: number }>(
      `SELECT title, event_time, to_char(event_date,'YYYY-MM-DD') AS event_date, recur, remind_days
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL`, [hhId]
    )).rows;
    const byTime = (a: { event_time: string }, b: { event_time: string }) => (a.event_time || '').localeCompare(b.event_time || '');
    const eventsToday = dated.filter((e) => occursOn(e.event_date, e.recur, today)).sort(byTime);
    const eventsTom = dated.filter((e) => occursOn(e.event_date, e.recur, tomorrow)).sort(byTime);
    const billsDue = (await query<{ name: string; amount: number; status: string }>(
      `SELECT name, amount, status FROM bills WHERE household_id=$1 AND status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date <= $2 ORDER BY due_date`, [hhId, today]
    )).rows;
    const openTasks = Number(
      (await query(`SELECT COUNT(*) FROM tasks WHERE household_id=$1 AND done=false`, [hhId])).rows[0].count
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

    // Morning push + in-app notification for anything happening today or with a
    // lead-time reminder landing today.
    const soonCount = eventsSoon.length + billsSoon.length;
    if (eventsToday.length || billsDue.length || soonCount) {
      const bits: string[] = [];
      if (eventsToday.length) bits.push(`${eventsToday.length} event${rand(eventsToday.length)}`);
      if (billsDue.length) bits.push(`${billsDue.length} bill${rand(billsDue.length)} due`);
      if (soonCount) bits.push(`${soonCount} coming up`);
      const title = (eventsToday.length || billsDue.length) ? `Today in ${info.name}` : `Coming up in ${info.name}`;
      const body = bits.join(' · ');
      // In-app bell entry - guarded so a re-run of the cron doesn't duplicate it.
      await query(
        `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
         SELECT $1,'calendar','#3B5BFF',$2,$3,'just now',true
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications WHERE household_id=$1 AND title=$2 AND created_at::date = CURRENT_DATE
          )`,
        [hhId, title, body]
      );
      try {
        await pushToHousehold(hhId, { title, body, url: '/' });
        pushesSent++;
      } catch { /* ignore */ }
    }

    // Email summary (only households whose cadence includes the daily digest).
    const hasContent = openTasks || billsDue.length || eventsToday.length || eventsTom.length || soonCount;
    if ((info.cadence === 'daily' || info.cadence === 'both') && hasContent) {
      const sections =
        (eventsToday.length ? `<p style="margin:16px 0 2px;font-weight:700">Today</p>${ul(eventsToday.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${e.title}`))}` : '') +
        (eventsTom.length ? `<p style="margin:16px 0 2px;font-weight:700">Tomorrow</p>${ul(eventsTom.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${e.title}`))}` : '') +
        (billsDue.length ? `<p style="margin:16px 0 2px;font-weight:700">Bills due</p>${ul(billsDue.map((b) => `${b.name} - R${Number(b.amount).toLocaleString('en-ZA')} (${b.status === 'overdue' ? 'overdue' : 'due today'})`))}` : '') +
        (soonCount ? `<p style="margin:16px 0 2px;font-weight:700">Coming up</p>${ul([...eventsSoon.map((e) => `${e.title} - ${inDays(e.days_away)}`), ...billsSoon.map((b) => `${b.name} R${Number(b.amount).toLocaleString('en-ZA')} - ${inDays(b.days_away)}`)])}` : '');
      const head = `You have <strong>${openTasks}</strong> open to-do${rand(openTasks)} in ${info.name}.`;
      for (const u of info.users) {
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
    await query<{ id: string; email: string; name: string; household_id: string; hh_name: string; settings: any }>(
      `SELECT u.id, u.email, u.name, u.household_id, h.name AS hh_name, h.settings
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
    if (info.cadence !== 'weekly' && info.cadence !== 'both') continue;

    // Events across the next 7 days (recurrence-aware, so repeats show).
    const dated = (await query<{ title: string; event_time: string; event_date: string; recur: string }>(
      `SELECT title, event_time, to_char(event_date,'YYYY-MM-DD') AS event_date, recur
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL`, [hhId]
    )).rows;
    const weekEvents: { date: string; title: string; time: string }[] = [];
    for (const d of weekDates) for (const e of dated) if (occursOn(e.event_date, e.recur, d)) weekEvents.push({ date: d, title: e.title, time: e.event_time });
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
      (weekEvents.length ? heading('This week') + ul(weekEvents.map((e) => `${fmtDay(e.date)}${e.time ? ' · ' + e.time : ''} — ${e.title.trim()}`)) : '') +
      (billsWeek.length || billsNoDate.length
        ? heading('Bills') + ul([
            ...billsWeek.map((b) => `${b.name.trim()} — ${rands(b.amount)} · ${b.due < today ? 'overdue' : 'due ' + fmtDay(b.due)}`),
            ...billsNoDate.map((b) => `${b.name.trim()} — ${rands(b.amount)} · unpaid (no due date set)`),
          ])
        : '') +
      (spentTotal > 0 || limitTotal > 0
        ? heading('Budget this month') +
          `<div style="font-size:15px">Spent <strong>${rands(spentTotal)}</strong>${limitTotal > 0 ? ` of ${rands(limitTotal)} budgeted` : ''}.</div>` +
          (overBudget.length ? ul(overBudget.map((b) => `${b.name.trim()} is over budget — ${rands(b.spent)} / ${rands(b.budget_limit)}`)) : '')
        : '') +
      (settle.length ? heading('Who owes who') + ul(settle.map((s) => `${nameOf.get(s.from_member)} owes ${nameOf.get(s.to_member)} ${s.amount}`)) : '') +
      (savings.length ? heading('Savings goals') + ul(savings.map((v) => `${v.name.trim()} — ${rands(v.saved)} / ${rands(v.target)}`)) : '') +
      (openCount ? heading(`To-dos (${openCount} open)`) + ul(openTasks.map((t) => t.title.trim())) : '');

    const head = `Here's the week ahead in <strong>${info.name}</strong>.`;
    for (const u of info.users) {
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
