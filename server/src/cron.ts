import { Router, type Request } from 'express';
import { query } from './db.js';
import { sendEmail, emailLayout } from './mailer.js';

export const cronRouter = Router();
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'https://croftapp.vercel.app';

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
// Also accept ?key= for manual runs.
function authorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  if (req.headers.authorization === `Bearer ${CRON_SECRET}`) return true;
  if (req.query.key === CRON_SECRET) return true;
  return false;
}

/** Daily digest: email each household's members a summary of what's outstanding.
 *  Skips households with nothing to report and those with email turned off. */
cronRouter.get('/digest', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const users = (
    await query<{ id: string; email: string; name: string; household_id: string; hh_name: string; settings: any }>(
      `SELECT u.id, u.email, u.name, u.household_id, h.name AS hh_name, h.settings
         FROM users u JOIN households h ON h.id = u.household_id
        WHERE u.email IS NOT NULL AND u.household_id IS NOT NULL`
    )
  ).rows;

  const byHh = new Map<string, { name: string; users: typeof users }>();
  for (const u of users) {
    if (u.settings && u.settings.email === false) continue;
    if (!byHh.has(u.household_id)) byHh.set(u.household_id, { name: u.hh_name, users: [] });
    byHh.get(u.household_id)!.users.push(u);
  }

  let emailsSent = 0;
  for (const [hhId, info] of byHh) {
    const openTasks = Number(
      (await query(`SELECT COUNT(*) FROM tasks WHERE household_id=$1 AND done=false`, [hhId])).rows[0].count
    );
    const bills = (
      await query<{ name: string; amount: number; due: string }>(
        `SELECT name, amount, due FROM bills WHERE household_id=$1 AND status IN ('unpaid','overdue') ORDER BY sort`,
        [hhId]
      )
    ).rows;
    if (openTasks === 0 && bills.length === 0) continue;

    const billsHtml = bills.length
      ? '<ul style="padding-left:18px;margin:12px 0 0">' +
        bills
          .map((b) => `<li>${b.name} — R${Number(b.amount).toLocaleString('en-ZA')}${b.due ? ` (due ${b.due})` : ''}</li>`)
          .join('') +
        '</ul>'
      : '';
    const body = `You have <strong>${openTasks}</strong> open to-do${openTasks === 1 ? '' : 's'} and <strong>${bills.length}</strong> unpaid bill${bills.length === 1 ? '' : 's'} in ${info.name}.${billsHtml}`;

    for (const u of info.users) {
      const ok = await sendEmail({
        to: u.email,
        subject: `Your ${info.name} daily summary`,
        html: emailLayout(`Good morning${u.name ? `, ${u.name.split(' ')[0]}` : ''}`, body, { label: 'Open Croft', url: APP_URL }),
        text: `${info.name}: ${openTasks} open to-dos, ${bills.length} unpaid bills. ${APP_URL}`,
      });
      if (ok) emailsSent++;
    }
  }

  res.json({ ok: true, households: byHh.size, emailsSent });
});
