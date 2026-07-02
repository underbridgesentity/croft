// Recurrence engine. Events are stored once (an anchor date + a rule) and
// expanded into occurrences for display, so a repeating event fills the calendar
// without extra rows.
//
// Rule tokens (stored in the `recur` text column, backward compatible):
//   none
//   daily | weekly | monthly | yearly            → every 1 unit, by date
//   int/<unit>/<n>   unit = day|week|month|year   → every N units (e.g. int/week/2)
//   pos/<ord>/<wd>   ord = 1..4 or L (last)       → monthly on the ord-th weekday
//                    wd  = 0..6 (Sun..Sat)          (e.g. pos/L/5 = last Friday)

export type Unit = 'day' | 'week' | 'month' | 'year';
export type Rule =
  | { kind: 'none' }
  | { kind: 'int'; unit: Unit; n: number }
  | { kind: 'pos'; ord: number; wd: number }; // ord: 1..4 or -1 (last)

const SIMPLE: Record<string, Unit> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ORDINALS: [number, string][] = [[1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [-1, 'Last']];

export function parseRecur(recur?: string | null): Rule {
  if (!recur || recur === 'none') return { kind: 'none' };
  if (SIMPLE[recur]) return { kind: 'int', unit: SIMPLE[recur], n: 1 };
  if (recur.startsWith('int/')) {
    const [, unit, n] = recur.split('/');
    if (['day', 'week', 'month', 'year'].includes(unit)) return { kind: 'int', unit: unit as Unit, n: Math.max(1, parseInt(n) || 1) };
  }
  if (recur.startsWith('pos/')) {
    const [, ord, wd] = recur.split('/');
    return { kind: 'pos', ord: ord === 'L' ? -1 : Math.min(4, Math.max(1, parseInt(ord) || 1)), wd: Math.min(6, Math.max(0, parseInt(wd) || 0)) };
  }
  return { kind: 'none' };
}

/** Build a token from parts (interval-1 collapses to the simple word). */
export function buildInterval(unit: Unit, n: number): string {
  const simple = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[unit];
  return n <= 1 ? simple : `int/${unit}/${n}`;
}
export function buildPos(ord: number, wd: number): string {
  return `pos/${ord === -1 ? 'L' : ord}/${wd}`;
}

/** Human label, e.g. "Weekly", "Every 2 weeks", "First Monday", "Last Friday". */
export function recurLabel(recur?: string | null): string {
  const r = parseRecur(recur);
  if (r.kind === 'none') return '';
  if (r.kind === 'pos') { const o = ORDINALS.find(([v]) => v === r.ord); return `${o ? o[1] : ''} ${WEEKDAYS[r.wd]}`.trim(); }
  if (r.n === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.unit];
  return `Every ${r.n} ${r.unit}s`;
}

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcToIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** The ord-th weekday `wd` of a month (UTC ms), or null if it doesn't exist
 * (e.g. a 5th Monday). ord = 1..4, or -1 for the last one. */
export function nthWeekdayUTC(year: number, month: number, ord: number, wd: number): number | null {
  if (ord === -1) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const back = (lastDay.getUTCDay() - wd + 7) % 7;
    return Date.UTC(year, month + 1, 0 - back);
  }
  const first = new Date(Date.UTC(year, month, 1));
  const fwd = (wd - first.getUTCDay() + 7) % 7;
  const day = 1 + fwd + (ord - 1) * 7;
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day > dim ? null : Date.UTC(year, month, day);
}

function stepInt(t: number, unit: Unit, n: number): number {
  const d = new Date(t);
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.getTime();
}

/** Occurrence ISO dates within [startIso, endIso] inclusive, never before the
 * anchor. Bounded so a bad rule can't loop forever. */
export function occurrencesInRange(anchorIso: string | null | undefined, recur: string | undefined | null, startIso: string, endIso: string): string[] {
  if (!anchorIso) return [];
  const rule = parseRecur(recur);
  const start = isoToUTC(startIso), end = isoToUTC(endIso), anchor = isoToUTC(anchorIso);
  if (end < anchor) return [];
  if (rule.kind === 'none') return anchorIso >= startIso && anchorIso <= endIso ? [anchorIso] : [];

  const out: string[] = [];
  let guard = 0;
  if (rule.kind === 'int') {
    let t = anchor;
    while (t < start && guard < 6000) { t = stepInt(t, rule.unit, rule.n); guard++; }
    while (t <= end && guard < 6000) { if (t >= anchor) out.push(utcToIso(t)); t = stepInt(t, rule.unit, rule.n); guard++; }
    return out;
  }
  // positional monthly
  let y = new Date(anchor).getUTCFullYear();
  let m = new Date(anchor).getUTCMonth();
  while (Date.UTC(y, m, 1) <= end && guard < 800) {
    const occ = nthWeekdayUTC(y, m, rule.ord, rule.wd);
    if (occ !== null && occ >= anchor && occ >= start && occ <= end) out.push(utcToIso(occ));
    m++; if (m > 11) { m = 0; y++; }
    guard++;
  }
  return out;
}

/** The first occurrence on or after `fromIso` (searches ~2 years ahead). */
export function nextOccurrence(anchorIso: string | null | undefined, recur: string | undefined | null, fromIso: string): string | null {
  if (!anchorIso) return null;
  const from = new Date(isoToUTC(fromIso));
  from.setUTCFullYear(from.getUTCFullYear() + 2);
  return occurrencesInRange(anchorIso, recur, fromIso, from.toISOString().slice(0, 10))[0] || null;
}
