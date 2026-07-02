import { Router } from 'express';
import { query } from './db.js';
import { recurToRRule } from './recur.js';

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
    await query<{ id: string; title: string; loc: string; event_time: string; event_date: string; updated_at: string; recur: string }>(
      `SELECT id, title, loc, event_time, to_char(event_date,'YYYYMMDD') AS event_date, updated_at, recur
         FROM events WHERE household_id=$1 AND event_date IS NOT NULL AND source_id IS NULL ORDER BY event_date`,
      [hh.id]
    )
  ).rows;

  const utcStamp = (dt: Date) =>
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
  const stamp = utcStamp(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Croft//Family Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(hh.name)} · Croft`),
    'X-WR-TIMEZONE:Africa/Johannesburg',
    'X-PUBLISHED-TTL:PT1H',
    // SAST is a fixed UTC+2 with no DST, so a single STANDARD rule is exact.
    'BEGIN:VTIMEZONE',
    'TZID:Africa/Johannesburg',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0200',
    'TZNAME:SAST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const e of events) {
    const d = e.event_date; // YYYYMMDD
    // SEQUENCE must climb when the event changes so clients re-render edits;
    // epoch-seconds of updated_at is monotonic per event.
    const modified = e.updated_at ? new Date(e.updated_at) : new Date();
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@croftapp.co.za`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`LAST-MODIFIED:${utcStamp(modified)}`);
    lines.push(`SEQUENCE:${Math.floor(modified.getTime() / 1000)}`);
    const tm = parseTime(e.event_time);
    if (tm) {
      // Anchor timed events to SAST so they land at the right wall-clock time in
      // any viewer's calendar, instead of "floating" to the viewer's zone.
      lines.push(`DTSTART;TZID=Africa/Johannesburg:${d}T${pad(tm.h)}${pad(tm.m)}00`);
      const endH = (tm.h + 1) % 24;
      lines.push(`DTEND;TZID=Africa/Johannesburg:${d}T${pad(endH)}${pad(tm.m)}00`);
    } else {
      // all-day: DTEND is exclusive next day
      const y = Number(d.slice(0, 4)), mo = Number(d.slice(4, 6)), da = Number(d.slice(6, 8));
      const next = new Date(Date.UTC(y, mo - 1, da + 1));
      const nd = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      lines.push(`DTEND;VALUE=DATE:${nd}`);
    }
    // Recurring events emit a single VEVENT + RRULE so the subscriber's calendar
    // expands every occurrence (instead of only the anchor date).
    const rrule = recurToRRule(e.recur);
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push(fold(`SUMMARY:${esc(e.title)}`));
    if (e.loc) lines.push(fold(`LOCATION:${esc(e.loc)}`));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  // Short cache so an edit/delete is visible as soon as the client next refreshes
  // (down from 1h). The subscriber's own refresh interval is the real limit.
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(lines.join('\r\n') + '\r\n');
});
