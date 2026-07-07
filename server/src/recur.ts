// Server-side recurrence. Events store an anchor date + a compact rule token;
// this answers the questions the reminder cron and the ICS export need:
//   - does an occurrence land on a given date?  (occursOn)
//   - what's the next occurrence after a date?   (advanceIso, for bill spawning)
//   - what iCal RRULE represents the rule?        (recurToRRule)
//
// Tokens: none | daily|weekly|monthly|yearly | int/<unit>/<n> | pos/<ord>/<wd>
// (ord = 1..4 or L for last; wd = 0..6 Sun..Sat).

const SIMPLE_UNIT: Record<string, 'day' | 'week' | 'month' | 'year'> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

type Parsed =
  | { kind: 'none' }
  | { kind: 'int'; unit: 'day' | 'week' | 'month' | 'year'; n: number }
  | { kind: 'pos'; ord: number; wd: number }; // ord: 1..4 or -1 (last)

export function parseRecur(recur?: string | null): Parsed {
  if (!recur || recur === 'none') return { kind: 'none' };
  if (SIMPLE_UNIT[recur]) return { kind: 'int', unit: SIMPLE_UNIT[recur], n: 1 };
  if (recur.startsWith('int/')) {
    const [, unit, n] = recur.split('/');
    if (unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year') return { kind: 'int', unit, n: Math.max(1, parseInt(n) || 1) };
  }
  if (recur.startsWith('pos/')) {
    const [, ord, wd] = recur.split('/');
    return { kind: 'pos', ord: ord === 'L' ? -1 : Math.min(4, Math.max(1, parseInt(ord) || 1)), wd: Math.min(6, Math.max(0, parseInt(wd) || 0)) };
  }
  return { kind: 'none' };
}

/** ms of the ord-th weekday `wd` of a month, or null if it doesn't exist. */
export function nthWeekdayUTC(year: number, month: number, ord: number, wd: number): number | null {
  if (ord === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month + 1, 0 - ((last.getUTCDay() - wd + 7) % 7));
  }
  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((wd - first.getUTCDay() + 7) % 7) + (ord - 1) * 7;
  return day > new Date(Date.UTC(year, month + 1, 0)).getUTCDate() ? null : Date.UTC(year, month, day);
}

const toUTC = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const monthsBetween = (a: Date, b: Date) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** The day-of-month for a monthly/yearly occurrence in (y, m), anchored on
 * `anchorDay` but clamped to that month's length so a 31st becomes the 28th in
 * February and never rolls over into the next month. */
const clampDay = (y: number, m: number, anchorDay: number) => Math.min(anchorDay, daysInMonth(y, m));

/** The next occurrence ISO date strictly after `iso`. null = no repeat. */
export function advanceIso(iso: string, recur: string): string | null {
  const r = parseRecur(recur);
  const [Y, M, D] = iso.split('-').map(Number);
  const cur = Date.UTC(Y, M - 1, D);
  if (r.kind === 'int') {
    if (r.unit === 'day' || r.unit === 'week') {
      const dt = new Date(cur);
      dt.setUTCDate(dt.getUTCDate() + (r.unit === 'week' ? 7 : 1) * r.n);
      return dt.toISOString().slice(0, 10);
    }
    // month/year: step whole months and clamp, so Jan 31 + 1 month = Feb 28
    // (not Mar 3), and Feb 29 + 1 year = Feb 28 in a non-leap year.
    const idx = Y * 12 + (M - 1) + (r.unit === 'year' ? 12 * r.n : r.n);
    const ty = Math.floor(idx / 12), tm = idx % 12;
    return new Date(Date.UTC(ty, tm, clampDay(ty, tm, D))).toISOString().slice(0, 10);
  }
  if (r.kind === 'pos') {
    let y = Y, mo = M - 1, guard = 0;
    while (guard < 48) { const occ = nthWeekdayUTC(y, mo, r.ord, r.wd); if (occ !== null && occ > cur) return new Date(occ).toISOString().slice(0, 10); mo++; if (mo > 11) { mo = 0; y++; } guard++; }
  }
  return null;
}

/** Does an occurrence of (anchor, recur) fall exactly on targetIso? */
export function occursOn(anchorIso: string, recur: string | null | undefined, targetIso: string): boolean {
  if (!anchorIso) return false;
  const r = parseRecur(recur);
  if (r.kind === 'none') return anchorIso === targetIso;
  const anchor = toUTC(anchorIso), target = toUTC(targetIso);
  if (target < anchor) return false;
  if (r.kind === 'int') {
    const days = (target - anchor) / 86400000;
    if (r.unit === 'day') return days % r.n === 0;
    if (r.unit === 'week') return days % (7 * r.n) === 0;
    const a = new Date(anchor), t = new Date(target);
    const ty = t.getUTCFullYear(), tm = t.getUTCMonth();
    // Day must match the anchor day clamped to the target month, so a 31st anchor
    // does land on Feb 28 / Apr 30 rather than skipping those months entirely.
    if (r.unit === 'month') return t.getUTCDate() === clampDay(ty, tm, a.getUTCDate()) && monthsBetween(a, t) % r.n === 0;
    return tm === a.getUTCMonth() && t.getUTCDate() === clampDay(ty, tm, a.getUTCDate()) && (ty - a.getUTCFullYear()) % r.n === 0;
  }
  const t = new Date(target);
  return nthWeekdayUTC(t.getUTCFullYear(), t.getUTCMonth(), r.ord, r.wd) === target;
}

/** iCal RRULE body for a recur token (no "RRULE:" prefix), or null. */
export function recurToRRule(recur: string | null | undefined): string | null {
  const r = parseRecur(recur);
  if (r.kind === 'none') return null;
  if (r.kind === 'int') {
    const FREQ = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[r.unit];
    return `FREQ=${FREQ}` + (r.n > 1 ? `;INTERVAL=${r.n}` : '');
  }
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return `FREQ=MONTHLY;BYDAY=${r.ord}${DAYS[r.wd]}`;
}
