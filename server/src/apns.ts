// Native iOS push via Apple Push Notification service (APNs), token-based auth.
// Dependency-free: an ES256 JWT (signed with the .p8 key) over HTTP/2, matching
// how the rest of the server avoids heavyweight SDKs.
//
// Env (set on Vercel): APNS_KEY (the .p8 PEM contents), APNS_KEY_ID, APNS_TEAM_ID,
// APNS_BUNDLE_ID (defaults to the app id), APNS_PRODUCTION ('false' for sandbox).
import http2 from 'node:http2';
import crypto from 'node:crypto';

const KEY = (process.env.APNS_KEY || '').replace(/\\n/g, '\n'); // env may escape newlines
const KEY_ID = process.env.APNS_KEY_ID || '';
const TEAM_ID = process.env.APNS_TEAM_ID || '';
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'za.co.underbridges.croft';
// App Store + TestFlight builds get production APNs tokens; only a Debug build
// run from Xcode uses the sandbox. Default to production.
const HOST = process.env.APNS_PRODUCTION === 'false' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

export const apnsEnabled = Boolean(KEY && KEY_ID && TEAM_ID);

// The provider JWT is valid up to 1 hour; Apple wants it refreshed no more than
// once every 20 min. Cache and reuse for ~50 min.
let cachedJwt = '';
let cachedAt = 0;
function providerJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedAt < 3000) return cachedJwt;
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: TEAM_ID, iat: now })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  cachedJwt = `${header}.${payload}.${sig}`;
  cachedAt = now;
  return cachedJwt;
}

export interface ApnsPayload { title: string; body?: string; url?: string }

/** Deliver an alert to the given device tokens. Returns the tokens APNs reports
 * as dead (Unregistered / BadDeviceToken) so the caller can prune them. */
export async function sendApns(tokens: string[], payload: ApnsPayload): Promise<string[]> {
  if (!apnsEnabled || !tokens.length) return [];
  const jwt = providerJwt();
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body || '' }, sound: 'default' },
    url: payload.url || '/',
  });
  const dead: string[] = [];
  const client = http2.connect(HOST);
  client.on('error', () => { /* connection errors resolve per-request below */ });
  await Promise.all(
    tokens.map(
      (token) =>
        new Promise<void>((resolve) => {
          const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            authorization: `bearer ${jwt}`,
            'apns-topic': BUNDLE_ID,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'content-type': 'application/json',
          });
          let status = 0;
          let data = '';
          req.on('response', (h) => { status = Number(h[':status']) || 0; });
          req.setEncoding('utf8');
          req.on('data', (d) => { data += d; });
          req.on('end', () => {
            if (status === 410 || (status === 400 && /BadDeviceToken/.test(data))) dead.push(token);
            resolve();
          });
          req.on('error', () => resolve());
          req.setTimeout(10000, () => { try { req.close(); } catch { /* noop */ } resolve(); });
          req.end(body);
        })
    )
  );
  try { client.close(); } catch { /* noop */ }
  return dead;
}
