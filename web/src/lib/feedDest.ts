// Map a Family-activity entry to the screen it happened on. Feed rows carry
// only free text (no entity ids), but every server template follows a known
// phrasing - so a keyword route gets each row a sensible landing place,
// including all the rows written before this existed. Order matters: most
// specific phrases first.
export function feedDest(txt: string): { tab: string; plan?: string } | null {
  const t = txt.toLowerCase();
  if (t.includes('shopping list')) return { tab: 'tasks', plan: 'lists' };
  if (/planned .+ for /.test(t)) return { tab: 'tasks', plan: 'meals' };
  if (/to-do|reminder|completed/.test(t)) return { tab: 'tasks', plan: 'todos' };
  if (t.includes('goal')) return { tab: 'tasks', plan: 'goals' };
  if (/bill|paid|budget|savings|iou|owes|spent/.test(t)) return { tab: 'money' };
  if (/event|calendar/.test(t)) return { tab: 'calendar' };
  if (/family|household|joined/.test(t)) return { tab: 'family' };
  if (/added r\d/.test(t)) return { tab: 'tasks', plan: 'goals' }; // goal progress ("added R500 to ...")
  return null;
}
