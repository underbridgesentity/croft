import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, tx } from './db.js';
import { seedHousehold } from './seed.js';
import { rateLimit } from './rateLimit.js';
import type { PoolClient } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const COOKIE = 'croft_token';
const isProd = process.env.NODE_ENV === 'production';

// Fail fast rather than silently signing sessions with a public, hardcoded
// secret if the env var is ever missing in production.
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('[croft] JWT_SECRET must be set in production.');
}

export interface AuthedRequest extends Request {
  userId?: string;
  householdId?: string;
}

function setAuthCookie(res: Response, userId: string) {
  const token = jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

async function loadUser(userId: string) {
  const r = await query(
    `SELECT u.id, u.email, u.name, u.household_id, u.member_id, h.name AS household_name
       FROM users u LEFT JOIN households h ON h.id = u.household_id
      WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
    const user = await loadUser(payload.uid);
    if (!user) return res.status(401).json({ error: 'Session expired' });
    // A session with no household must not reach data routes (every query is
    // scoped by household_id; a null id silently matches nothing or FK-throws).
    if (!user.household_id) {
      return res.status(403).json({ error: 'Your household setup is incomplete. Please sign up again.' });
    }
    req.userId = user.id;
    req.householdId = user.household_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

/** Create a household + members + starter data and link it to the user, using an
 *  existing transaction client so callers can compose it atomically. */
async function provisionHousehold(
  c: PoolClient,
  userId: string,
  userName: string,
  householdName?: string
) {
  const hh = await c.query(
    `INSERT INTO households (name) VALUES ($1) RETURNING id`,
    [householdName?.trim() || `${(userName || 'My').split(' ')[0]}'s Home`]
  );
  const householdId = hh.rows[0].id;
  const { youMemberId } = await seedHousehold(c, householdId, userName);
  await c.query(`UPDATE users SET household_id = $1, member_id = $2 WHERE id = $3`, [
    householdId,
    youMemberId,
    userId,
  ]);
  return householdId;
}

/** Stand-alone household creation (its own transaction) for existing users. */
async function createHouseholdFor(userId: string, userName: string, householdName?: string) {
  return tx((c) => provisionHousehold(c, userId, userName, householdName));
}

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
  household: z.string().max(80).optional(),
});

// Per-IP throttles (shared store) to blunt credential-stuffing and spam signups.
authRouter.post('/signup', rateLimit('signup', 10, 3600), async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid details' });
  }
  const { name, email, password, household } = parsed.data;
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'That email already has an account. Try logging in.' });
  }
  const hash = await bcrypt.hash(password, 10);
  // One transaction: a failure during seeding must not leave an orphaned,
  // loginable user with no household.
  const userId = await tx(async (c) => {
    const ins = await c.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
      [email.toLowerCase(), hash, name]
    );
    const uid = ins.rows[0].id as string;
    await provisionHousehold(c, uid, name, household);
    return uid;
  });
  setAuthCookie(res, userId);
  res.json({ user: await loadUser(userId) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', rateLimit('login', 20, 900), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password' });
  const { email, password } = parsed.data;
  const r = await query(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  const row = r.rows[0];
  if (!row || !row.password_hash) {
    return res.status(401).json({ error: 'No account with those details' });
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
  setAuthCookie(res, row.id);
  res.json({ user: await loadUser(row.id) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', async (req: AuthedRequest, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
    const user = await loadUser(payload.uid);
    res.json({ user: user || null });
  } catch {
    res.json({ user: null });
  }
});

// ---- Google OAuth (real when env is configured) ----
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const GOOGLE_REDIRECT = `${SERVER_URL}/api/auth/google/callback`;

export const googleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// Short-lived, httpOnly cookies that bind the OAuth round-trip to the browser
// that started it (anti-CSRF state + PKCE verifier). Scoped to /api/auth so they
// are sent on the callback. SameSite=Lax still rides the top-level GET back from
// Google.
const OAUTH_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  maxAge: 10 * 60 * 1000,
  path: '/api/auth',
};
const b64url = (buf: Buffer) => buf.toString('base64url');

authRouter.get('/google', rateLimit('google', 30, 900), (_req, res) => {
  if (!googleConfigured) {
    return res.status(501).json({
      error: 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  res.cookie('g_state', state, OAUTH_COOKIE);
  res.cookie('g_verifier', codeVerifier, OAUTH_COOKIE);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res) => {
  if (!googleConfigured) return res.redirect(`${APP_URL}/?auth=google_unconfigured`);
  const code = String(req.query.code || '');
  const returnedState = String(req.query.state || '');
  const savedState = req.cookies?.g_state;
  const codeVerifier = req.cookies?.g_verifier;
  // One-time cookies — clear regardless of outcome.
  res.clearCookie('g_state', { path: '/api/auth' });
  res.clearCookie('g_verifier', { path: '/api/auth' });
  // Anti-CSRF: the callback must carry the same state we issued to this browser.
  if (!code || !returnedState || !savedState || returnedState !== savedState) {
    return res.redirect(`${APP_URL}/?auth=google_error`);
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT,
        grant_type: 'authorization_code',
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });
    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) return res.redirect(`${APP_URL}/?auth=google_error`);

    const profRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const prof: any = await profRes.json();
    const email = String(prof.email || '').toLowerCase();
    const name = prof.name || email.split('@')[0];
    const googleId = String(prof.id || '');
    // Only trust the email if Google says it is verified — otherwise an
    // attacker-controlled Google account with a victim's address could be
    // auto-linked to the victim's existing password account.
    const emailVerified = prof.verified_email === true || prof.email_verified === true;
    if (!email || !emailVerified) return res.redirect(`${APP_URL}/?auth=google_error`);

    let r = await query(`SELECT id, household_id FROM users WHERE email = $1 OR google_id = $2`, [
      email,
      googleId,
    ]);
    let userId: string;
    if (r.rows.length) {
      userId = r.rows[0].id;
      await query(`UPDATE users SET google_id = $1 WHERE id = $2`, [googleId, userId]);
      if (!r.rows[0].household_id) await createHouseholdFor(userId, name);
    } else {
      const ins = await query(
        `INSERT INTO users (email, name, google_id) VALUES ($1,$2,$3) RETURNING id`,
        [email, name, googleId]
      );
      userId = ins.rows[0].id;
      await createHouseholdFor(userId, name);
    }
    setAuthCookie(res, userId);
    res.redirect(`${APP_URL}/?auth=google_ok`);
  } catch (e) {
    console.error('google callback error', e);
    res.redirect(`${APP_URL}/?auth=google_error`);
  }
});
