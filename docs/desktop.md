# Crate Desktop app

Crate is a client/server application: the React frontend talks to an Express +
Socket.io backend that needs **PostgreSQL**, **Firebase**, and **Spotify** to
function. That is why the downloadable desktop app is a wrapper (Electron) that
bundles the frontend and runs the local backend, rather than a fully offline
program.

> The desktop app does **not** ship with any credentials. On first launch it
> asks you for the same settings the web app needs — you must bring your own
> database, Firebase project, and Spotify application.

## How the desktop app works

1. `electron/main.cjs` (the Electron entry point, wired via `package.json` >
   `main`) starts the bundled backend (`dist/server.cjs`) on `127.0.0.1:3001`
   and opens the Crate window pointed at it.
2. If required settings are missing, it shows `electron/settings.html` — a
   first-run form. Saved values persist to
   `%APPDATA%\crate-config\settings.json` on this machine only.
3. Once configured and running, the app works exactly like Crate in the
   browser (Spotify Premium playback still applies, and the Spotify app must
   list the redirect URI `http://127.0.0.1:3001/api/spotify/callback`).

## Required settings

The same variables as `.env`. Full descriptions live in `.env.example`:

- `APP_SECRET` — 32-byte hex; generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` — your
  Postgres instance. Run migrations once: `npm run db:migrate`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` —
  the Firebase Admin SDK service account
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — Spotify app

## Building the installer yourself

```bash
npm install
npm run build                          # builds dist/ (frontend + server)
npm run desktop:dist                   # electron-builder -> release/*.exe
```

`electron-builder` reads `electron-builder.yml` and produces a Windows NSIS
installer under `release/`.

## Building in CI

`.github/workflows/desktop-release.yml` builds the Windows installer on
`windows-latest`. It runs on `workflow_dispatch`, a tag matching
`desktop-v*`, or a published GitHub release, and uploads `release/*.exe` as a
build artifact.

The showcase page links `.../Crate-radar/releases/latest` as the download
button, so publishing a GitHub **release** with the installer attached is what
makes the downloadable app go live for visitors.
