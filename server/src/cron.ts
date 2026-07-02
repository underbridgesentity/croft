import { Router, type Request } from 'express';
import { query } from './db.js';
import { sendEmail, emailLayout } from './mailer.js';
import { pushToHousehold } from './push.js';
import { sastToday, sastPlus } from './dates.js';

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

    const eventsToday = (await query<{ title: string; event_time: string }>(
      `SELECT title, event_time FROM events WHERE household_id=$1 AND event_date=$2 ORDER BY event_time NULLS LAST`, [hhId, today]
    )).rows;
    const eventsTom = (await query<{ title: string; event_time: string }>(
      `SELECT title, event_time FROM events WHERE household_id=$1 AND event_date=$2 ORDER BY event_time NULLS LAST`, [hhId, tomorrow]
    )).rows;
    const billsDue = (await query<{ name: string; amount: number; status: string }>(
      `SELECT name, amount, status FROM bills WHERE household_id=$1 AND status IN ('unpaid','overdue') AND due_date IS NOT NULL AND due_date <= $2 ORDER BY due_date`, [hhId, today]
    )).rows;
    const openTasks = Number(
      (await query(`SELECT COUNT(*) FROM tasks WHERE household_id=$1 AND done=false`, [hhId])).rows[0].count
    );

    // Morning push + in-app notification for anything happening today.
    if (eventsToday.length || billsDue.length) {
      const bits: string[] = [];
      if (eventsToday.length) bits.push(`${eventsToday.length} event${rand(eventsToday.length)}`);
      if (billsDue.length) bits.push(`${billsDue.length} bill${rand(billsDue.length)} due`);
      const title = `Today in ${info.name}`;
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
    const hasContent = openTasks || billsDue.length || eventsToday.length || eventsTom.length;
    if (!info.emailOff && hasContent) {
      const sections =
        (eventsToday.length ? `<p style="margin:16px 0 2px;font-weight:700">Today</p>${ul(eventsToday.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${e.title}`))}` : '') +
        (eventsTom.length ? `<p style="margin:16px 0 2px;font-weight:700">Tomorrow</p>${ul(eventsTom.map((e) => `${e.event_time ? e.event_time + ' - ' : ''}${e.title}`))}` : '') +
        (billsDue.length ? `<p style="margin:16px 0 2px;font-weight:700">Bills due</p>${ul(billsDue.map((b) => `${b.name} - R${Number(b.amount).toLocaleString('en-ZA')} (${b.status === 'overdue' ? 'overdue' : 'due today'})`))}` : '');
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

  res.json({ ok: true, households: byHh.size, emailsSent, pushesSent });
});
