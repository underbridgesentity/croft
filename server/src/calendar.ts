import { Router } from 'express';
import { query } from './db.js';

export const calendarRouter = Router();

// RFC 5545 text escaping.
function esc(s: string): string {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// Fold long content lines to <=75 octets (CRLF + space continuation).
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 73));
  s = s.slice(73);
  while (s.length) { parts.push(' ' + s.slice(0, 72)); s = s.slice(72); }
  return parts.join('\r\n');
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Parse a free-text event_time into a valid {h,m} or null (→ all-day). Guards
 * against malformed input (e.g. "25:00", "9:3020") producing an invalid ICS. */
function parseTime(s: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** GET /api/calendar/:token.ics - public, capability-URL protected. */
calendarRouter.get('/:token.ics', async (req, res) => {
  const token = String((req.params as any).token || '');
  if (!token) return res.status(404).send('Not found');
  const hh = (await query(`SELECT id, name FROM households WHERE calendar_token=$1`, [token])).rows[0];
  if (!hh) return res.status(404).send('Not found');

  const events = (
    await query<{ id: string; title: string; loc: string; event_time: string; event_date: string }>(
      `SELECT id, title, loc, event_time, to_char(event_date,'YYYYMMDD') AS event_date
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL ORDER BY event_date`,
      [hh.id]
    )
  ).rows;

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Croft//Family Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(hh.name)} · Croft`),
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const e of events) {
    const d = e.event_date; // YYYYMMDD
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@croftapp.co.za`);
    lines.push(`DTSTAMP:${stamp}`);
    const tm = parseTime(e.event_time);
    if (tm) {
      lines.push(`DTSTART:${d}T${pad(tm.h)}${pad(tm.m)}00`);
      // +1h end
      const endH = (tm.h + 1) % 24;
      lines.push(`DTEND:${d}T${pad(endH)}${pad(tm.m)}00`);
    } else {
      // all-day: DTEND is exclusive next day
      const y = Number(d.slice(0, 4)), mo = Number(d.slice(4, 6)), da = Number(d.slice(6, 8));
      const next = new Date(Date.UTC(y, mo - 1, da + 1));
      const nd = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      lines.push(`DTEND;VALUE=DATE:${nd}`);
    }
    lines.push(fold(`SUMMARY:${esc(e.title)}`));
    if (e.loc) lines.push(fold(`LOCATION:${esc(e.loc)}`));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\r\n') + '\r\n');
});
