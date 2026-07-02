// Expand a recurring event's anchor date into the actual occurrence dates that
// fall inside a window. Events are stored once (anchor + rule) and expanded for
// display, so a "weekly" swim lesson paints every week without extra rows.

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcToIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Occurrence ISO dates (YYYY-MM-DD) of an event within [startIso, endIso]
 * inclusive. Occurrences never precede the anchor. A 'none'/empty rule yields
 * just the anchor when it's in range. Bounded so a bad rule can't loop forever.
 */
export function occurrencesInRange(
  anchorIso: string | null | undefined,
  recur: string | undefined,
  startIso: string,
  endIso: string,
): string[] {
  if (!anchorIso) return [];
  if (!recur || recur === 'none') {
    return anchorIso >= startIso && anchorIso <= endIso ? [anchorIso] : [];
  }
  const start = isoToUTC(startIso);
  const end = isoToUTC(endIso);
  const anchor = isoToUTC(anchorIso);
  if (end < anchor) return [];

  const step = (d: Date) => {
    if (recur === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (recur === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (recur === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (recur === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCDate(d.getUTCDate() + 1); // unknown rule: don't spin forever
  };

  const out: string[] = [];
  const cur = new Date(anchor);
  let guard = 0;
  // Fast-forward to the window (never before the anchor).
  while (cur.getTime() < start && guard < 6000) { step(cur); guard++; }
  while (cur.getTime() <= end && guard < 6000) {
    if (cur.getTime() >= anchor) out.push(utcToIso(cur.getTime()));
    step(cur);
    guard++;
  }
  return out;
}

/** The first occurrence on or after `fromIso` (searches ~2 years ahead). */
export function nextOccurrence(anchorIso: string | null | undefined, recur: string | undefined, fromIso: string): string | null {
  if (!anchorIso) return null;
  const from = new Date(isoToUTC(fromIso));
  from.setUTCFullYear(from.getUTCFullYear() + 2);
  const far = from.toISOString().slice(0, 10);
  return occurrencesInRange(anchorIso, recur, fromIso, far)[0] || null;
}
