import webpush from 'web-push';
import { query } from './db.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@croftapp.co.za';

export const pushEnabled = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
export const vapidPublicKey = VAPID_PUBLIC || '';

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

export interface BrowserSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(householdId: string, userId: string | undefined, sub: BrowserSub) {
  await query(
    `INSERT INTO push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET household_id=$1, user_id=$2, p256dh=$4, auth=$5`,
    [householdId, userId || null, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removeSubscription(endpoint: string) {
  await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [endpoint], { scoped: false }); // endpoint is a device secret
}

/** Send to a single subscription (e.g. a confirmation right after subscribing). */
export async function pushToSub(sub: BrowserSub, payload: PushPayload) {
  if (!pushEnabled) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export interface PushPayload { title: string; body?: string; url?: string }

/** Deliver a push to every subscription in a household (optionally excluding one
 * user - e.g. the person who triggered it). Dead subscriptions are pruned. */
export async function pushToHousehold(householdId: string, payload: PushPayload, exceptUserId?: string) {
  if (!pushEnabled) return;
  const rows = (
    await query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions
        WHERE household_id=$1 ${exceptUserId ? 'AND (user_id IS NULL OR user_id <> $2)' : ''}`,
      exceptUserId ? [householdId, exceptUserId] : [householdId]
    )
  ).rows;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [s.endpoint], { scoped: false }).catch(() => {}); // prune dead sub by endpoint
        }
      }
    })
  );
}
