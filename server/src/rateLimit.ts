import type { Request, Response, NextFunction } from 'express';
import { query } from './db.js';

/** Best-effort client IP. On Vercel the real client is the first x-forwarded-for hop. */
function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0]!.trim();
  if (Array.isArray(xff) && xff.length) return xff[0]!.split(',')[0]!.trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window rate limiter backed by the shared `rate_limits` table, so the
 * limit holds across all serverless instances. Keyed by `${prefix}:<ip>`.
 *
 * The upsert is atomic: it increments within the current window, or resets the
 * window if it has elapsed — in a single statement, so concurrent requests can't
 * race past the limit.
 */
export function rateLimit(prefix: string, max: number, windowSec: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const bucket = `${prefix}:${clientIp(req)}`;
    let count: number;
    let resetAt: Date;
    try {
      const r = await query<{ count: number; reset_at: Date }>(
        `INSERT INTO rate_limits (bucket, count, reset_at)
           VALUES ($1, 1, now() + ($2 || ' seconds')::interval)
         ON CONFLICT (bucket) DO UPDATE SET
           count    = CASE WHEN rate_limits.reset_at < now() THEN 1
                           ELSE rate_limits.count + 1 END,
           reset_at = CASE WHEN rate_limits.reset_at < now()
                           THEN now() + ($2 || ' seconds')::interval
                           ELSE rate_limits.reset_at END
         RETURNING count, reset_at`,
        [bucket, String(windowSec)]
      );
      count = r.rows[0]!.count;
      resetAt = new Date(r.rows[0]!.reset_at);
    } catch {
      // Fail open: a limiter outage must not take down auth.
      return next();
    }
    if (count > max) {
      const retry = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Too many attempts. Please try again in a little while.' });
    }
    next();
  };
}
