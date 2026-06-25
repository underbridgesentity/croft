# Hearth — Family Hub 🏡

> One calm home for your whole family — shared dates, reminders, lists, goals and money, off your group chats.

Hearth is a **mobile-first web app (PWA)** with a real **Node API + Postgres (Neon)** backend. It implements the Hearth design end-to-end: account creation (email + Google), a seeded family household, and fully working Calendar, Plans (to-dos / lists / goals), Money, and Family screens — all persisted to the database and synced across reloads/devices.

This was implemented from the Claude Design handoff bundle (the original prototype lives in [`project/`](project/)).

---

## What works end-to-end

- **Auth** — email sign-up & login (bcrypt-hashed passwords, JWT session cookie) and **Google sign-in** (real OAuth when configured; the button is present either way). _Apple sign-in was intentionally left out for now._
- **Onboarding** — welcome → 3-step intro → create account → set up your home → enable notifications.
- **Persistence** — every action writes to Postgres. A fresh account is seeded with warm starter content so all screens are populated.
- **Home** — time-aware greeting, live quick-stats, today's agenda, family activity feed, goal highlight.
- **Calendar** — real current-month grid with today highlighted and colour-coded dots; important-dates list; add events.
- **Plans** — to-dos (add / complete / nudge / delete + empty state), shared shopping list (add / check / delete), family & personal goals (log progress / remove).
- **Money** — outstanding/paid totals, bills (mark paid / add / delete), monthly budget bars, who-owes-who with settle-up, savings goals.
- **Family** — members (invite / remove), notification & calendar toggles, account & security toggles, sign out.
- **Notifications** — in-app notification centre (mark all read), nudges create real notifications, and the onboarding "Turn on notifications" step requests the real **Web Notifications** permission.
- **PWA** — installable to the iPhone/iPad/Android home screen, custom icon, offline app shell, standalone display.

---

## Tech stack

| Layer    | Choice                                                            |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite, `vite-plugin-pwa` (Workbox)         |
| Backend  | Node + Express + TypeScript                                        |
| Database | PostgreSQL — **Neon** in production (`pg` driver, standard protocol) |
| Auth     | bcrypt + JWT (httpOnly cookie); Google OAuth 2.0                  |

The repo is an npm-workspaces monorepo: [`web/`](web/) (PWA) and [`server/`](server/) (API).

---

## Quick start (local)

**Prerequisites:** Node 20+ and a Postgres database (local, or a free Neon database).

```bash
# 1. Install everything
npm install

# 2. Configure the server
cp server/.env.example server/.env
#    then edit server/.env and set DATABASE_URL (+ JWT_SECRET)

# 3. Create the tables
npm run db:setup

# 4. Run API (:3001) + web (:5173) together
npm run dev
```

Open **http://localhost:5173** and create an account.

> The Vite dev server proxies `/api` → `http://localhost:3001`, so the frontend and backend share an origin (cookies just work).

### Using Neon

1. Create a project at [neon.tech](https://neon.tech) and copy the connection string.
2. Put it in `server/.env`:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxxx.region.aws.neon.tech/hearth?sslmode=require
   ```
   SSL is enabled automatically when the host is `neon.tech` (or `sslmode=require` is present).
3. `npm run db:setup` then `npm run dev`.

### Enabling Google sign-in

Email auth works out of the box. To turn on the Google button:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client (Web)**.
2. Add the redirect URI: `http://localhost:3001/api/auth/google/callback` (and your production `SERVER_URL` equivalent).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env`.

Until configured, tapping "Continue with Google" shows a friendly "not set up yet" message.

---

## Production build & deploy

```bash
npm run build      # builds web/dist, compiles server to server/dist
NODE_ENV=production npm start
```

In production the API **also serves the built PWA** (`web/dist`) and handles SPA routing, so the whole app deploys as a **single Node service** (Render, Railway, Fly.io, a VM, etc.). Set these env vars in your host:

```
DATABASE_URL=<neon connection string>
JWT_SECRET=<long random string>
APP_URL=https://your-domain
SERVER_URL=https://your-domain
GOOGLE_CLIENT_ID=...        # optional
GOOGLE_CLIENT_SECRET=...    # optional
NODE_ENV=production
```

---

## Installing on a phone (PWA)

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**. It launches full-screen with the Hearth icon (no browser chrome).
- **Android:** Chrome shows an **Install app** prompt, or use the ⋮ menu → **Install app**.

### Path to the App Store / Google Play

The same codebase ships to the stores by wrapping the PWA:

- **iOS App Store** — wrap with a `WKWebView` shell or a tool like **PWABuilder** / **Capacitor**. (Apple requires a thin native wrapper; Capacitor is the smoothest path and lets you add native push later.)
- **Google Play** — Google's **PWABuilder → Trusted Web Activity (TWA)** produces a Play-ready Android package directly from the deployed PWA.

For true native push notifications in the store builds, add Capacitor's push plugin (Apple Push / Firebase Cloud Messaging) on top of this same web app.

---

## Project layout

```
web/                 React PWA
  src/screens/       Onboarding, Home, Calendar, Plans, Money, Family, Sheets
  src/components/    Icon (duotone glyphs), Art (line-art illustrations)
  src/store.tsx      Auth + app-state context
  src/lib/api.ts     Typed API client
  public/            manifest, generated icons, illustrations
server/
  src/db.ts          Pool + schema (CREATE TABLE IF NOT EXISTS)
  src/auth.ts        Email + Google auth, JWT middleware
  src/data.ts        State assembler + all CRUD endpoints
  src/seed.ts        Starter content for new households
project/             Original Claude Design prototype (reference)
```

## Honest notes

- **Apple/Google Calendar sync, email reminders, and iPhone Reminders** are presented as real, toggleable settings, but the outbound integrations themselves are not yet wired to external services — that's the next backend milestone. Everything else performs real reads/writes.
- The seeded "Mokoena-style" family/bills/dates are sample content on each new household so the app feels alive; all of it is editable and deletable.
