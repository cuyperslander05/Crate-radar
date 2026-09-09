# Crate — real-time social music

Listen together in sync, vote on the room queue, and track your sound identity.

- **Frontend** — React 19 + Vite + Tailwind 4
- **Backend** — Express + Socket.io (single process, Vite in middleware mode during development)
- **Database** — PostgreSQL via Drizzle ORM (works against Neon or any managed provider)
- **Auth** — Firebase Authentication (Google sign-in), verified server-side with the Admin SDK
- **Playback** — Spotify Web Playback SDK (requires a Spotify Premium account)

## Prerequisites

- Node.js 20.11 or newer
- A PostgreSQL database
- A Firebase project with Google sign-in enabled
- A Spotify application (https://developer.spotify.com/dashboard)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Then fill in `.env`:

**Server**

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default `3000`) |
| `APP_URL` | Public origin of the app. Used for OAuth redirects and CORS. |
| `ALLOWED_ORIGINS` | Optional comma-separated origin allowlist. Defaults to `APP_URL`. |
| `APP_SECRET` | **Required.** 32-byte secret that encrypts Spotify tokens at rest and signs OAuth state. |

Generate `APP_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Database**

`SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`.

TLS certificate verification is on by default. Set `SQL_SSL_STRICT=false` only for a local
server with a self-signed certificate, and `SQL_SSL=false` only for a plaintext local socket.

**Firebase Admin (backend)**

`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — from
Project Settings → Service accounts → *Generate new private key*. Keep the private key
on one line with literal `\n` escapes, wrapped in double quotes.

Without these, ID-token verification still works but every privileged Admin SDK call
(`getUser`, `setCustomUserClaims`, `revokeRefreshTokens`) fails off-GCP.

**Firebase Web (frontend)**

`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` —
from Project Settings → General → *Your apps* → Web app SDK config.

`VITE_FIREBASE_AUTH_DOMAIN` must be the real `*.firebaseapp.com` domain (never `localhost`)
and must be listed under Authentication → Authorized domains.

**Spotify**

`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

Spotify does **not** accept `localhost` in a redirect URI — it requires the loopback IP
literal (`127.0.0.1`) or https. For local development, register exactly:

```
http://127.0.0.1:3000/api/spotify/callback
```

That is the default whenever `APP_URL` points at `localhost`, so `SPOTIFY_REDIRECT_URI`
only needs setting for a deployed environment. The server prints the exact URI it will
send on startup — copy that string into the dashboard verbatim, since Spotify compares it
byte for byte.

`APP_URL` stays on `localhost` because that is the host Firebase Auth authorises by
default; only the Spotify hop uses `127.0.0.1`.

### 3. Run the migrations

```bash
npm run db:migrate
```

Optionally seed demo data:

```bash
npm run db:seed
```

### 4. Start the app

```bash
npm run dev
```

The Express server hosts both the API and the Vite dev server on `http://localhost:3000`.

## Production

```bash
npm run build
npm start
```

`npm start` sets `NODE_ENV=production`, which serves the built `dist/` output instead of the
Vite middleware and enables HSTS plus a Content-Security-Policy. The server refuses to boot in
production if `APP_SECRET`, the Firebase service account, or the Spotify credentials are missing.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run build` | Build the client and bundle the server |
| `npm start` | Run the production build |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm test` | Run the Node test-runner suite |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:seed` | Insert demo rooms and tracks |

## Security notes

- Spotify access and refresh tokens are encrypted at rest with AES-256-GCM using a key derived
  from `APP_SECRET`. Rotating `APP_SECRET` invalidates stored tokens and forces users to relink.
- The Spotify OAuth `state` parameter is HMAC-signed and expires after 10 minutes, so a third
  party cannot attach their Spotify account to another user's profile.
- API responses never include another user's email or Spotify tokens; see `publicUserColumns`
  in `src/db/schema.ts`.
- Only a room's host may broadcast playback sync events.
- `npm audit` reports moderate advisories in transitive dependencies of `drizzle-kit` (a dev
  dependency) and `firebase-admin`. Neither has a non-breaking fix upstream; `npm audit fix
  --force` would downgrade `firebase-admin` to v10 and is not safe to run.
