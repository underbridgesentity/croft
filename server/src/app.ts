import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { authRouter, googleConfigured } from './auth.js';
import { dataRouter } from './data.js';
import { cronRouter } from './cron.js';
import { calendarRouter } from './calendar.js';

// The configured Express app, with NO listen / static / schema work.
// Used both by the local server (index.ts) and the Vercel function (api/).
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

// Express 4 does NOT forward errors thrown from async route handlers - a rejected
// promise leaves the request hanging and can crash the process / fail the
// serverless invocation. Wrap every handler on a router so a rejection is routed
// to the terminal error middleware below instead.
function wrapAsyncRoutes(router: { stack?: any[] }) {
  for (const layer of router.stack || []) {
    const route = layer.route;
    if (!route) continue;
    for (const s of route.stack || []) {
      if (typeof s.handle === 'function' && s.handle.length < 4) {
        const orig = s.handle;
        s.handle = (req: Request, res: Response, next: NextFunction) =>
          Promise.resolve(orig(req, res, next)).catch(next);
      }
    }
  }
}
wrapAsyncRoutes(authRouter as unknown as { stack?: any[] });
wrapAsyncRoutes(dataRouter as unknown as { stack?: any[] });
wrapAsyncRoutes(cronRouter as unknown as { stack?: any[] });
wrapAsyncRoutes(calendarRouter as unknown as { stack?: any[] });

export const app = express();
app.disable('x-powered-by'); // don't advertise the framework/version

app.use(express.json());
app.use(cookieParser());
// Same-origin in production (one domain serves app + /api), so reflecting the
// origin with credentials is safe; in dev we allow the Vite origin explicitly.
app.use(cors({ origin: isProd ? true : APP_URL, credentials: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true, google: googleConfigured }));
app.use('/api/auth', authRouter);
app.use('/api/cron', cronRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api', dataRouter);

// Terminal error handler - keeps the API returning clean JSON on any failure
// (e.g. a transient Neon error) instead of hanging the request.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.code === '23505') {
    // Postgres unique-violation → friendly conflict (e.g. duplicate email).
    return res.status(409).json({ error: 'That already exists.' });
  }
  console.error('[croft] unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export { googleConfigured };
export default app;
