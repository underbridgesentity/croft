import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, tx } from './db.js';
import { seedHousehold } from './seed.js';
import { rateLimit } from './rateLimit.js';
import { sendEmail } from './mailer.js';
import { welcomeEmail, passwordResetEmail, passwordChangedEmail, memberJoinedEmail } from './emailTemplates.js';
import type { TxClient } from './db.js';

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
  memberId?: string;
}

// Set the web session cookie AND return the token. The web app uses the
// httpOnly cookie (unchanged); the native app (bundled, cross-origin to the API)
// stores the returned token and sends it as `Authorization: Bearer`.
// Each token carries the user's current token_version (`v`); bumping the
// version in the DB revokes every session minted before the bump.
async function issueSession(res: Response, userId: string): Promise<string> {
  const row = (await query(`SELECT token_version FROM users WHERE id=$1`, [userId])).rows[0];
  const token = jwt.sign({ uid: userId, v: row?.token_version ?? 0 }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
}

/** Read a bearer token from the Authorization header (native clients). */
function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

/** The session token for this request: header first (native), then cookie (web). */
function sessionToken(req: AuthedRequest): string | null {
  return bearerToken(req) || req.cookies?.[COOKIE] || null;
}

async function loadUser(userId: string) {
  const r = await query(
    `SELECT u.id, u.email, u.name, u.household_id, u.member_id, u.onboarded, u.token_version, u.email_cadence,
            (u.lock_pin IS NOT NULL) AS locked, h.name AS household_name
       FROM users u LEFT JOIN households h ON h.id = u.household_id
      WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

/** True when the token was minted before the user's sessions were revoked
 * (password change/reset bumps token_version). Legacy tokens carry no `v`,
 * which counts as version 0. */
function sessionRevoked(payload: { v?: number }, user: { token_version?: number }): boolean {
  return (payload.v ?? 0) !== (user.token_version ?? 0);
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string; v?: number };
    const user = await loadUser(payload.uid);
    if (!user) return res.status(401).json({ error: 'Session expired' });
    if (sessionRevoked(payload, user)) return res.status(401).json({ error: 'Session expired' });
    // A session with no household must not reach data routes (every query is
    // scoped by household_id; a null id silently matches nothing or FK-throws).
    if (!user.household_id) {
      return res.status(403).json({ error: 'Your household setup is incomplete. Please sign up again.' });
    }
    req.userId = user.id;
    req.householdId = user.household_id;
    req.memberId = user.member_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

/** Create a household + members + starter data and link it to the user, using an
 * existing transaction client so callers can compose it atomically. */
async function provisionHousehold(
  c: TxClient,
  userId: string,
  userName: string,
  householdName?: string
) {
  const hh = await c.query(
    `INSERT INTO households (name) VALUES ($1) RETURNING id`,
    [householdName?.trim() || `${(userName || 'My').split(' ')[0]}'s Home`]
  );
  const householdId = hh.rows[0].id;
  const { youMemberId } = await seedHousehold(c, householdId, userName, userId);
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

interface Invite {
  id: string;
  household_id: string;
  member_id: string | null;
  role: string;
  created_by: string | null;
}

/** Thrown when a single-use invite is claimed by a concurrent request first. */
class InviteTakenError extends Error {
  constructor() {
    super('invite_taken');
    this.name = 'InviteTakenError';
  }
}

/** Return the invite if it exists, is unaccepted and unexpired; else null. */
async function loadValidInvite(token: string): Promise<Invite | null> {
  if (!token) return null;
  const r = await query(
    `SELECT id, household_id, member_id, role, created_by, expires_at, accepted_at
       FROM invites WHERE token = $1`,
    [token],
    { scoped: false } // invite token is the capability - looked up before any household context
  );
  const inv = r.rows[0];
  if (!inv || inv.accepted_at) return null;
  if (new Date(inv.expires_at).getTime() < Date.now()) return null;
  return inv;
}

const MEMBER_PALETTE = ['#7A5CFF', '#16C098', '#FF6B5C', '#FFB020', '#3B5BFF', '#FF5C8A'];

/** Link a user to an invited household inside a transaction: claim the targeted
 * placeholder member (or create a fresh member), point the user at it, and mark
 * the invite accepted. */
async function joinHousehold(c: TxClient, invite: Invite, userId: string, userName: string) {
  // Atomically claim the single-use invite FIRST. `loadValidInvite` is a
  // non-transactional read, so two concurrent accepts can both pass it; this
  // guard ensures only one wins (the other rolls the whole tx back) and a single
  // invite can never onboard two users.
  const claim = await c.query(
    `UPDATE invites SET accepted_at=now(), accepted_by=$1 WHERE id=$2 AND accepted_at IS NULL RETURNING id`,
    [userId, invite.id],
    { scoped: false } // claimed by invite id (already validated), pre-membership
  );
  if (!claim.rows.length) throw new InviteTakenError();
  let memberId: string | null = invite.member_id;
  if (memberId) {
    const upd = await c.query(
      `UPDATE members SET user_id=$1, name=$2 WHERE id=$3 AND household_id=$4 AND user_id IS NULL RETURNING id`,
      [userId, userName, memberId, invite.household_id]
    );
    if (!upd.rows.length) memberId = null; // already claimed/removed → create fresh
  }
  if (!memberId) {
    const cnt = Number(
      (await c.query(`SELECT COUNT(*) FROM members WHERE household_id=$1`, [invite.household_id])).rows[0].count
    );
    const ins = await c.query(
      `INSERT INTO members (household_id, name, role, initial, color, is_you, user_id, sort)
       VALUES ($1,$2,$3,$4,$5,false,$6,$7) RETURNING id`,
      [invite.household_id, userName, invite.role || 'Family', (userName || '?').charAt(0).toUpperCase(), MEMBER_PALETTE[cnt % MEMBER_PALETTE.length], userId, cnt]
    );
    memberId = ins.rows[0].id;
  }
  await c.query(`UPDATE users SET household_id=$1, member_id=$2 WHERE id=$3`, [invite.household_id, memberId, userId]);
  await c.query(
    `INSERT INTO feed (household_id, who, color, initial, txt, time_label)
     VALUES ($1,$2,'#3B5BFF',$3,'joined the household','just now')`,
    [invite.household_id, userName, (userName || '?').charAt(0).toUpperCase()]
  );
  // Ring the in-app bell for the rest of the household too.
  await c.query(
    `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
     VALUES ($1,'bell','#16C098',$2,$3,'just now',true)`,
    [invite.household_id, 'New family member', `${userName} joined the household`]
  );
  return memberId;
}

/** Best-effort: email the person who created the invite that someone joined. */
async function notifyInviterOfJoin(invite: Invite, joinerName: string) {
  if (!invite.created_by) return;
  const r = await query(
    `SELECT u.email, h.name AS hh FROM users u JOIN households h ON h.id = $2 WHERE u.id = $1`,
    [invite.created_by, invite.household_id]
  );
  const row = r.rows[0];
  if (row?.email) {
    await sendEmail({ to: row.email, ...memberJoinedEmail({ joinerName, householdName: row.hh }) }).catch(() => {});
  }
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
  sendEmail({ to: email.toLowerCase(), ...welcomeEmail(name) }).catch(() => {});
  const token = await issueSession(res, userId);
  res.json({ user: await loadUser(userId), token });
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
  const token = await issueSession(res, row.id);
  res.json({ user: await loadUser(row.id), token });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', async (req: AuthedRequest, res) => {
  const token = sessionToken(req);
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string; v?: number };
    const user = await loadUser(payload.uid);
    if (user && sessionRevoked(payload, user)) return res.json({ user: null });
    res.json({ user: user || null });
  } catch {
    res.json({ user: null });
  }
});

// ---- Invites (join an existing household) ----
authRouter.get('/invite/:token', async (req, res) => {
  const invite = await loadValidInvite(req.params.token);
  if (!invite) return res.status(410).json({ error: 'This invite is invalid or has expired.' });
  const hhName = (await query(`SELECT name FROM households WHERE id=$1`, [invite.household_id])).rows[0]?.name || 'a household';
  const inviter = invite.created_by
    ? (await query(`SELECT name FROM users WHERE id=$1`, [invite.created_by])).rows[0]?.name || null
    : null;
  res.json({ household_name: hhName, inviter_name: inviter, role: invite.role || null });
});

const acceptSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
});

authRouter.post('/invite/:token/accept', rateLimit('signup', 10, 3600), async (req, res) => {
  const invite = await loadValidInvite(req.params.token);
  if (!invite) return res.status(410).json({ error: 'This invite is invalid or has expired.' });
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid details' });
  const { name, email, password } = parsed.data;
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'That email already has an account. Log in first, then open the invite link.' });
  }
  const hash = await bcrypt.hash(password, 10);
  let userId: string;
  try {
    userId = await tx(async (c) => {
      const ins = await c.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
        [email.toLowerCase(), hash, name]
      );
      const uid = ins.rows[0].id as string;
      await joinHousehold(c, invite, uid, name);
      return uid;
    });
  } catch (e) {
    if (e instanceof InviteTakenError) {
      return res.status(410).json({ error: 'This invite has already been used.' });
    }
    throw e;
  }
  sendEmail({ to: email.toLowerCase(), ...welcomeEmail(name) }).catch(() => {});
  notifyInviterOfJoin(invite, name).catch(() => {});
  const token = await issueSession(res, userId);
  res.json({ user: await loadUser(userId), token });
});

// An EXISTING, signed-in account accepts an invite - previously the most
// common second-user path (partner already tried the app solo) dead-ended.
// Solo founders move across and their starter household is deleted; members
// of a real multi-user household must leave it first.
authRouter.post('/invite/:token/accept-existing', rateLimit('signup', 10, 3600), async (req: AuthedRequest, res) => {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let u: Awaited<ReturnType<typeof loadUser>>;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string; v?: number };
    u = await loadUser(payload.uid);
    if (!u || sessionRevoked(payload, u)) return res.status(401).json({ error: 'Session expired' });
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const invite = await loadValidInvite(req.params.token);
  if (!invite) return res.status(410).json({ error: 'This invite is invalid or has expired.' });
  if (u.household_id === invite.household_id) {
    return res.status(409).json({ error: "You're already a member of this household." });
  }
  if (u.household_id) {
    const others = await query(`SELECT COUNT(*) FROM users WHERE household_id=$1 AND id<>$2`, [u.household_id, u.id]);
    if (Number(others.rows[0].count) > 0) {
      return res.status(409).json({
        error: "You're already in a household with other members. Remove yourself there first, then open this invite again.",
      });
    }
  }
  try {
    const userId = u.id;
    const oldHousehold = u.household_id;
    await tx(async (c) => {
      // A solo starter household holds only this user's seed data - deleting it
      // cascades everything so no orphaned household lingers. The occupancy
      // re-check runs INSIDE the tx: someone may have accepted an invite into
      // this household since the pre-check, and deleting it then would destroy
      // THEIR data. In that case leave the household standing and just remove
      // this user's member row from it.
      if (oldHousehold) {
        const del = await c.query(
          `DELETE FROM households WHERE id=$1
            AND NOT EXISTS (SELECT 1 FROM users WHERE household_id=$1 AND id<>$2)`,
          [oldHousehold, userId]
        );
        if (!del.rowCount) await c.query(`DELETE FROM members WHERE household_id=$1 AND user_id=$2`, [oldHousehold, userId]);
      }
      await joinHousehold(c, invite, userId, u!.name);
    });
  } catch (e) {
    if (e instanceof InviteTakenError) {
      return res.status(410).json({ error: 'This invite has already been used.' });
    }
    throw e;
  }
  notifyInviterOfJoin(invite, u.name).catch(() => {});
  res.json({ user: await loadUser(u.id) });
});

// ---- Password reset (email) ----
authRouter.post('/forgot', rateLimit('forgot', 10, 900), async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  // Always respond ok - never reveal whether an account exists.
  if (email) {
    // Also send to Google-only accounts (no password_hash yet): the link lets
    // them SET a password so they can sign in by email - the only option in the
    // iOS app, where Google sign-in isn't offered.
    const u = (await query(`SELECT id, name, password_hash FROM users WHERE email=$1`, [email])).rows[0];
    if (u) {
      const token = crypto.randomBytes(32).toString('base64url');
      await query(
        `INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
        [token, u.id]
      );
      const link = `${APP_URL}/reset/${token}`;
      await sendEmail({ to: email, ...passwordResetEmail({ name: u.name, resetUrl: link, setup: !u.password_hash }) });
    }
  }
  res.json({ ok: true });
});

const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(200) });
authRouter.post('/reset', rateLimit('forgot', 10, 900), async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a new password (at least 8 characters).' });
  const r = (await query(`SELECT user_id, expires_at, used FROM password_resets WHERE token=$1`, [parsed.data.token])).rows[0];
  if (!r || r.used || new Date(r.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This reset link is invalid or has expired.' });
  }
  const hash = await bcrypt.hash(parsed.data.password, 10);
  await tx(async (c) => {
    // token_version bump revokes every existing session (this device gets a
    // fresh, current-version token from issueSession below).
    await c.query(`UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2`, [hash, r.user_id]);
    await c.query(`UPDATE password_resets SET used=true WHERE token=$1`, [parsed.data.token]);
  });
  const u = await loadUser(r.user_id);
  if (u?.email) sendEmail({ to: u.email, ...passwordChangedEmail({ name: u.name }) }).catch(() => {});
  const token = await issueSession(res, r.user_id);
  res.json({ user: u, token });
});

// ---- Account management (authenticated) ----
const changePwSchema = z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).max(200) });
authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const u = (await query(`SELECT password_hash FROM users WHERE id=$1`, [req.userId])).rows[0];
  // Password accounts must confirm the current password; Google-only accounts
  // (no hash yet) are allowed to set one.
  if (u?.password_hash) {
    const ok = parsed.data.currentPassword && (await bcrypt.compare(parsed.data.currentPassword, u.password_hash));
    if (!ok) return res.status(401).json({ error: 'Your current password is incorrect.' });
  }
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  // Bump token_version to revoke all other sessions (a password change is the
  // "kick out whoever has my account" action), then re-issue THIS session so
  // the device making the change stays signed in.
  await query(`UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2`, [hash, req.userId]);
  const token = await issueSession(res, req.userId!);
  const who = await loadUser(req.userId!);
  if (who?.email) sendEmail({ to: who.email, ...passwordChangedEmail({ name: who.name }) }).catch(() => {});
  res.json({ ok: true, token });
});

// Deleting an account must work even for a user whose household is already
// gone, so verify the session directly instead of using requireAuth (which
// rejects household-less sessions).
authRouter.post('/delete-account', async (req: AuthedRequest, res) => {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  let userId: string;
  try {
    userId = (jwt.verify(token, JWT_SECRET) as { uid: string }).uid;
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const user = await loadUser(userId);
  if (!user) return res.status(401).json({ error: 'Session expired' });

  await tx(async (c) => {
    if (user.household_id) {
      // Remove this user's membership (by link and by their member_id).
      await c.query(`DELETE FROM members WHERE household_id=$1 AND user_id=$2`, [user.household_id, userId]);
      if (user.member_id) await c.query(`DELETE FROM members WHERE id=$1`, [user.member_id], { scoped: false }); // deleting caller's own member
      // The unambiguous occupancy measure is the users table: is any OTHER
      // account still attached to this household? (Members can lag the user
      // link, so counting members risks deleting a household still in use.)
      const remaining = Number(
        (await c.query(
          `SELECT COUNT(*) FROM users WHERE household_id=$1 AND id <> $2`,
          [user.household_id, userId]
        )).rows[0].count
      );
      if (remaining === 0) await c.query(`DELETE FROM households WHERE id=$1`, [user.household_id]);
    }
    await c.query(`DELETE FROM users WHERE id=$1`, [userId]);
  });
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// ---- App lock (per-user passcode) ----
// NOTE: this is a client-side privacy convenience, NOT a security boundary. The
// passcode gates the UI on the device (so a grabbed, unlocked phone doesn't show
// family data); the real boundary remains the httpOnly session cookie. Anyone
// holding a live session could still call the API directly, so /lock/verify only
// confirms the pin - it deliberately does not mint an "unlocked" credential.
const pinSchema = z.object({ pin: z.string().regex(/^\d{4,8}$/) });

authRouter.post('/lock/set', requireAuth, async (req: AuthedRequest, res) => {
  const p = pinSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Passcode must be 4-8 digits.' });
  const hash = await bcrypt.hash(p.data.pin, 10);
  await query(`UPDATE users SET lock_pin=$1 WHERE id=$2`, [hash, req.userId]);
  res.json({ ok: true });
});

authRouter.post('/lock/verify', rateLimit('lockpin', 10, 900), requireAuth, async (req: AuthedRequest, res) => {
  const p = pinSchema.safeParse(req.body);
  if (!p.success) return res.json({ ok: false });
  const row = (await query(`SELECT lock_pin FROM users WHERE id=$1`, [req.userId])).rows[0];
  if (!row?.lock_pin) return res.json({ ok: true });
  res.json({ ok: await bcrypt.compare(p.data.pin, row.lock_pin) });
});

authRouter.post('/lock/disable', rateLimit('lockpin', 10, 900), requireAuth, async (req: AuthedRequest, res) => {
  const p = pinSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Enter your passcode.' });
  const row = (await query(`SELECT lock_pin FROM users WHERE id=$1`, [req.userId])).rows[0];
  if (row?.lock_pin && !(await bcrypt.compare(p.data.pin, row.lock_pin))) {
    return res.status(401).json({ error: 'Incorrect passcode.' });
  }
  await query(`UPDATE users SET lock_pin=NULL WHERE id=$1`, [req.userId]);
  res.json({ ok: true });
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

authRouter.get('/google', rateLimit('google', 30, 900), (req, res) => {
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
  // Carry an invite token through the OAuth round-trip so a Google sign-in from a
  // /join link joins that household instead of creating a new one.
  const invite = String((req.query.invite as string) || '');
  if (invite) res.cookie('g_invite', invite, OAUTH_COOKIE);
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
  const inviteToken = req.cookies?.g_invite as string | undefined;
  // One-time cookies - clear regardless of outcome.
  res.clearCookie('g_state', { path: '/api/auth' });
  res.clearCookie('g_verifier', { path: '/api/auth' });
  res.clearCookie('g_invite', { path: '/api/auth' });
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
    const googleId = prof.id ? String(prof.id) : null;
    // Only trust the email if Google says it is verified - otherwise an
    // attacker-controlled Google account with a victim's address could be
    // auto-linked to the victim's existing password account.
    const emailVerified = prof.verified_email === true || prof.email_verified === true;
    if (!email || !emailVerified) return res.redirect(`${APP_URL}/?auth=google_error`);

    let r = await query(`SELECT id, household_id FROM users WHERE email = $1 OR google_id = $2`, [
      email,
      googleId,
    ]);
    let userId: string;
    let joinedViaInvite = false;
    // If arriving from a valid invite link, join that household; else create one.
    // If the invite was claimed by a concurrent request, fall back to a solo
    // household so the sign-in still succeeds.
    const invite = inviteToken ? await loadValidInvite(inviteToken) : null;
    const provision = async (uid: string) => {
      if (!invite) return createHouseholdFor(uid, name);
      try {
        await tx((c) => joinHousehold(c, invite, uid, name));
        joinedViaInvite = true;
      } catch (e) {
        if (!(e instanceof InviteTakenError)) throw e;
        await createHouseholdFor(uid, name);
      }
    };
    if (r.rows.length) {
      userId = r.rows[0].id;
      // COALESCE so a missing id never nulls out an existing google link.
      await query(`UPDATE users SET google_id = COALESCE($1, google_id) WHERE id = $2`, [googleId, userId]);
      if (!r.rows[0].household_id) await provision(userId);
    } else {
      const ins = await query(
        `INSERT INTO users (email, name, google_id) VALUES ($1,$2,$3) RETURNING id`,
        [email, name, googleId]
      );
      userId = ins.rows[0].id;
      await provision(userId);
      sendEmail({ to: email, ...welcomeEmail(name) }).catch(() => {});
    }
    if (joinedViaInvite && invite) notifyInviterOfJoin(invite, name).catch(() => {});
    await issueSession(res, userId); // web OAuth redirect → cookie only
    res.redirect(`${APP_URL}/?auth=google_ok`);
  } catch (e) {
    console.error('google callback error', e);
    res.redirect(`${APP_URL}/?auth=google_error`);
  }
});
