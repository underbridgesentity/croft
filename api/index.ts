// Vercel serverless entry — routes every /api/* request to the Express app.
//
// The compiled server bundle is loaded via dynamic import() inside the handler
// rather than a top-level static import. A top-level
// `import app from '../server/dist/app.js'` fails to initialize on Vercel
// (FUNCTION_INVOCATION_FAILED); deferring the import to invocation time resolves
// it. The app and the idempotent schema init are cached across warm invocations.
import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressHandler = (rq: IncomingMessage, rs: ServerResponse) => void;

let appPromise: Promise<ExpressHandler> | null = null;

function loadApp(): Promise<ExpressHandler> {
  if (!appPromise) {
    appPromise = (async () => {
      const { default: app } = await import('../server/dist/app.js');
      const { initSchema } = await import('../server/dist/db.js');
      await initSchema(); // idempotent: CREATE TABLE IF NOT EXISTS
      return app as unknown as ExpressHandler;
    })().catch((e) => {
      appPromise = null; // allow retry on the next invocation
      throw e;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await loadApp();
  app(req, res);
}
