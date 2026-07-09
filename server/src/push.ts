import webpush from 'web-push';
import { query } from './db.js';
import { sendApns, apnsEnabled } from './apns.js';

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

// ---- Native (iOS/APNs) device tokens ----
export async function saveNativeToken(householdId: string, userId: string | undefined, token: string, platform = 'ios') {
  await query(
    `INSERT INTO native_push_tokens (household_id, user_id, token, platform)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (token) DO UPDATE SET household_id=$1, user_id=$2, platform=$4`,
    [householdId, userId || null, token, platform]
  );
}

export async function removeNativeToken(token: string) {
  await query(`DELETE FROM native_push_tokens WHERE token=$1`, [token], { scoped: false }); // token is a device secret
}

/** One-off native push (e.g. the confirmation right after a device registers). */
export async function pushToNativeToken(token: string, payload: PushPayload) {
  await sendApns([token], payload).catch(() => []);
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
  const notMe = exceptUserId ? 'AND (user_id IS NULL OR user_id <> $2)' : '';
  const params = exceptUserId ? [householdId, exceptUserId] : [householdId];

  // Channel 1: Web Push (browsers + installed PWAs).
  if (pushEnabled) {
    const rows = (
      await query<{ endpoint: string; p256dh: string; auth: string }>(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE household_id=$1 ${notMe}`,
        params
      )
    ).rows;
    await Promise.all(
      rows.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [s.endpoint], { scoped: false }).catch(() => {}); // prune dead sub
          }
        }
      })
    );
  }

  // Channel 2: Native APNs (the iOS app, which can't receive Web Push).
  if (apnsEnabled) {
    const tokens = (
      await query<{ token: string }>(`SELECT token FROM native_push_tokens WHERE household_id=$1 ${notMe}`, params)
    ).rows.map((r) => r.token);
    const dead = await sendApns(tokens, payload).catch(() => [] as string[]);
    for (const t of dead) {
      await query(`DELETE FROM native_push_tokens WHERE token=$1`, [t], { scoped: false }).catch(() => {}); // prune dead token
    }
  }
}

/** Deliver a push to specific MEMBERS of a household (resolved to their linked
 * user accounts' devices). Members without a linked account are skipped; an
 * empty member list falls back to the whole household so "unassigned" items
 * still reach everyone. */
export async function pushToMembers(householdId: string, memberIds: string[], payload: PushPayload, exceptUserId?: string) {
  const ids = (memberIds || []).filter(Boolean);
  if (!ids.length) return pushToHousehold(householdId, payload, exceptUserId);
  const users = (
    await query<{ user_id: string }>(
      `SELECT user_id FROM members WHERE household_id=$1 AND id = ANY($2::uuid[]) AND user_id IS NOT NULL`,
      [householdId, ids]
    )
  ).rows.map((r) => r.user_id).filter((u) => u !== exceptUserId);
  if (!users.length) return;

  if (pushEnabled) {
    const rows = (
      await query<{ endpoint: string; p256dh: string; auth: string }>(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE household_id=$1 AND user_id = ANY($2::uuid[])`,
        [householdId, users]
      )
    ).rows;
    await Promise.all(
      rows.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [s.endpoint], { scoped: false }).catch(() => {});
          }
        }
      })
    );
  }
  if (apnsEnabled) {
    const tokens = (
      await query<{ token: string }>(
        `SELECT token FROM native_push_tokens WHERE household_id=$1 AND user_id = ANY($2::uuid[])`,
        [householdId, users]
      )
    ).rows.map((r) => r.token);
    const dead = await sendApns(tokens, payload).catch(() => [] as string[]);
    for (const t of dead) {
      await query(`DELETE FROM native_push_tokens WHERE token=$1`, [t], { scoped: false }).catch(() => {});
    }
  }
}
