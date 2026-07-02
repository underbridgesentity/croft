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

  const byHh = new Map<string, { name: string; users: typeof users; emailOff: boolean }>();
  for (const u of users) {
    if (!byHh.has(u.household_id)) {
      byHh.set(u.household_id, { name: u.hh_name, users: [], emailOff: u.settings?.email === false });
    }
    byHh.get(u.household_id)!.users.push(u);
  }

  let emailsSent = 0;
  let pushesSent = 0;

  for (const [hhId, info] of byHh) {
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

    // Email summary (respect the email-off setting).
    const hasContent = openTasks || billsDue.length || eventsToday.length || eventsTom.length || soonCount;
    if (!info.emailOff && hasContent) {
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
