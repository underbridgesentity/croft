// Vercel serverless entry — routes every /api/* request to the Express app.
// Imports the compiled server (built by `npm run build` during the Vercel build).
import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../server/dist/app.js';
import { initSchema } from '../server/dist/db.js';

// Ensure the database schema exists once per warm instance (idempotent,
// CREATE TABLE IF NOT EXISTS), then delegate to Express.
let ready: Promise<void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!ready) ready = initSchema().catch((e) => { ready = null; throw e; });
  await ready;
  (app as unknown as (rq: IncomingMessage, rs: ServerResponse) => void)(req, res);
}
