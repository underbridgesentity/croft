import ical from 'node-ical';
import { query, tx } from './db.js';
import { formatDateLabel } from './dates.js';

// South African Standard Time (UTC+2, no DST) - imported times are shown in SAST.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

export interface CalSource {
  id: string;
  household_id: string;
  url: string;
  name: string;
}

export interface Instance {
  external_uid: string;
  title: string;
  date: string; // YYYY-MM-DD (SAST)
  time: string; // HH:MM (SAST) or '' for all-day
  loc: string;
}

/** Block private / loopback / link-local / cloud-metadata hosts (SSRF guard). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return (
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)
  );
}

/** Fetch an ICS document with SSRF guards, a timeout and a size cap. */
export async function fetchIcs(rawUrl: string): Promise<string> {
  const url = rawUrl.trim().replace(/^webcal:\/\//i, 'https://');
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('That doesn’t look like a valid calendar link.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Use an http(s) or webcal calendar link.');
  if (isBlockedHost(u.hostname)) throw new Error('That address isn’t allowed.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain, */*', 'User-Agent': 'Croft/1.0 (+https://www.croftapp.co.za)' },
    });
    if (!res.ok) throw new Error(`Could not read that calendar (${res.status}).`);
    const text = await res.text();
    if (text.length > 4_000_000) throw new Error('That calendar is too large to import.');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link isn’t an iCal calendar.');
    return text;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('That calendar took too long to respond.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function sastParts(d: Date, allDay: boolean): { date: string; time: string } {
  if (allDay) {
    // node-ical builds VALUE=DATE events at local midnight; local parts give the
    // intended calendar day regardless of the server's timezone.
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '' };
  }
  const s = new Date(d.getTime() + SAST_OFFSET_MS);
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`,
  };
}

/** Parse ICS text into a bounded list of event instances (pure - no network/DB).
 *  Recurring events are expanded from 1 month back to 12 months ahead. */
export function parseInstances(text: string, now = new Date()): Instance[] {
  const data = ical.parseICS(text);
  const windowStart = new Date(now.getTime() - 31 * 86_400_000);
  const windowEnd = new Date(now.getTime() + 365 * 86_400_000);
  const out: Instance[] = [];
  const MAX = 800;

  for (const key of Object.keys(data)) {
    const ev: any = data[key];
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    const allDay = ev.datetype === 'date';
    const title = String(ev.summary || 'Untitled').slice(0, 200);
    const loc = String(ev.location || '').slice(0, 200);
    const uid = String(ev.uid || key);

    if (ev.rrule) {
      const exdates = new Set<number>(Object.values(ev.exdate || {}).map((d: any) => new Date(d).setHours(0, 0, 0, 0)));
      let occ: Date[] = [];
      try { occ = ev.rrule.between(windowStart, windowEnd, true); } catch { occ = []; }
      for (const d of occ) {
        if (out.length >= MAX) break;
        if (exdates.has(new Date(d).setHours(0, 0, 0, 0))) continue;
        const p = sastParts(d, allDay);
        // A modified occurrence (override) replaces the generated one.
        const ov = ev.recurrences?.[p.date];
        out.push({
          external_uid: `${uid}::${p.date}`,
          title: ov?.summary ? String(ov.summary).slice(0, 200) : title,
          date: p.date,
          time: p.time,
          loc: ov?.location ? String(ov.location).slice(0, 200) : loc,
        });
      }
    } else {
      const start = new Date(ev.start);
      if (start < windowStart || start > windowEnd) continue;
      const p = sastParts(start, allDay);
      out.push({ external_uid: uid, title, date: p.date, time: p.time, loc });
    }
    if (out.length >= MAX) break;
  }
  return out;
}

/** Fetch + parse a source and reconcile its events in the DB (upsert + prune).
 *  Returns the number of events now imported for the source. */
export async function syncSource(source: CalSource): Promise<number> {
  const text = await fetchIcs(source.url);
  const instances = parseInstances(text);

  await tx(async (c) => {
    for (const it of instances) {
      const label = formatDateLabel(it.date);
      await c.query(
        `INSERT INTO events (household_id, title, time, ampm, day, date_label, event_date, event_time, loc, color, illo, source_id, external_uid, updated_at)
         VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,'calendar',$10,$11, now())
         ON CONFLICT (household_id, external_uid) WHERE external_uid IS NOT NULL
         DO UPDATE SET title=EXCLUDED.title, time=EXCLUDED.time, ampm=EXCLUDED.ampm,
           date_label=EXCLUDED.date_label, event_date=EXCLUDED.event_date,
           event_time=EXCLUDED.event_time, loc=EXCLUDED.loc, updated_at=now()`,
        [
          source.household_id, it.title, it.time || 'All', it.time ? '' : 'day', label,
          it.date, it.time, it.loc, '#8C7CFF', source.id, it.external_uid,
        ]
      );
    }
    // Prune instances that no longer exist upstream (or fell out of the window).
    const keep = instances.map((i) => i.external_uid);
    if (keep.length) {
      await c.query(
        `DELETE FROM events WHERE source_id=$1 AND household_id=$2 AND external_uid <> ALL($3::text[])`,
        [source.id, source.household_id, keep]
      );
    } else {
      await c.query(`DELETE FROM events WHERE source_id=$1 AND household_id=$2`, [source.id, source.household_id]);
    }
  });

  await query(`UPDATE calendar_sources SET last_synced_at=now(), last_error=NULL WHERE id=$1 AND household_id=$2`,
    [source.id, source.household_id]);
  return instances.length;
}
