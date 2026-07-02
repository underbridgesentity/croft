import type { TxClient } from './db.js';

/**
 * Set up a brand-new household: create the signing-up user as the "You" member
 * and apply clean default settings. New households start EMPTY - every screen
 * has a first-run empty state, and real content is added by the user (and the
 * family they invite), not pre-populated with sample data.
 */
export async function seedHousehold(
  c: TxClient,
  householdId: string,
  userName: string,
  userId?: string
) {
  const youName = (userName || 'You').trim() || 'You';
  const youInitial = youName.charAt(0).toUpperCase() || 'Y';

  // Link the founder's member to their user row (user_id), the same way invited
  // members are linked - occupancy checks rely on it.
  const r = await c.query(
    `INSERT INTO members (household_id, name, role, initial, color, is_you, user_id, sort)
     VALUES ($1,$2,$3,$4,$5,true,$6,0) RETURNING id`,
    [householdId, youName, '', youInitial, '#3B5BFF', userId || null]
  );
  const youMemberId = r.rows[0].id as string;

  await c.query(`UPDATE households SET settings = $2 WHERE id = $1`, [
    householdId,
    JSON.stringify({
      push: true,
      email: true,
      // Integrations below aren't wired yet - default them off so the toggles
      // reflect reality.
      appleCal: false,
      googleCal: false,
      iphoneReminders: false,
      faceId: false,
      backup: true,
    }),
  ]);

  return { youMemberId, memberIds: { you: youMemberId } };
}
