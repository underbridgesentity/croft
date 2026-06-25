import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema } from './db.js';
import { authRouter, googleConfigured } from './auth.js';
import { dataRouter } from './data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: isProd ? true : APP_URL,
    credentials: true,
  })
);

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, google: googleConfigured })
);
app.use('/api/auth', authRouter);
app.use('/api', dataRouter);

// In production, serve the built PWA and let the SPA handle routing.
if (isProd) {
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

async function main() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`[hearth] API listening on http://localhost:${PORT}`);
    console.log(`[hearth] Google sign-in: ${googleConfigured ? 'configured' : 'not configured (email works)'}`);
  });
}

main().catch((e) => {
  console.error('[hearth] failed to start', e);
  process.exit(1);
});
