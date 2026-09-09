import 'dotenv/config';
import path from 'path';

/**
 * Centralised, validated environment access for the server process.
 *
 * Crate Desktop runs with an embedded SQLite database and local accounts, so
 * there is no external database or Firebase to configure. The only required
 * secret is APP_SECRET, which signs local session tokens and Spotify OAuth
 * state. Spotify itself still needs a client id/secret and each user brings
 * their own Spotify account (Premium) to play.
 */

function optional(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function bool(name: string, fallback: boolean): boolean {
  const raw = optional(name);
  if (!raw) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const isProduction = process.env.NODE_ENV === 'production';

/** Directory that holds the embedded SQLite database. */
export function dataDir(): string {
  return optional('CRATE_DATA_DIR', process.cwd());
}

/** Absolute path to the SQLite database file. */
export function dbFile(): string {
  return path.join(dataDir(), 'crate.db');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(optional('PORT', '3001')),
  appUrl: optional('APP_URL', 'http://127.0.0.1:3001').replace(/\/+$/, ''),

  db: { file: dbFile() },

  spotify: {
    clientId: optional('SPOTIFY_CLIENT_ID'),
    clientSecret: optional('SPOTIFY_CLIENT_SECRET'),
    redirectUri: optional('SPOTIFY_REDIRECT_URI'),
  },

  /** 32-byte secret used to sign local session tokens and OAuth state. */
  appSecret: optional('APP_SECRET'),

  allowedOrigins: optional('ALLOWED_ORIGINS')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

/**
 * Origins permitted to connect over Socket.io / CORS. Falls back to APP_URL.
 */
export function getAllowedOrigins(): string[] {
  if (env.allowedOrigins.length > 0) return env.allowedOrigins;
  const origins = new Set<string>([env.appUrl]);
  origins.add('http://localhost:' + env.port);
  origins.add('http://127.0.0.1:' + env.port);
  if (!isProduction) {
    origins.add('http://localhost:5173');
  }
  return [...origins];
}

/** The redirect URI sent to Spotify (loopback IP for local app). */
export function getSpotifyRedirectUri(): string {
  if (env.spotify.redirectUri) return env.spotify.redirectUri;
  const url = new URL(`${env.appUrl}/api/spotify/callback`);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString();
}

/**
 * Warns at boot when the signing secret is missing but never throws: the app is
 * a local desktop program, so it can still boot into the setup screen.
 */
export function assertProductionSecrets(): void {
  if (!env.appSecret) {
    if (isProduction) {
      console.error('[config] APP_SECRET is not set. Sessions and Spotify OAuth state will not be signed.');
    } else {
      console.warn('[config] APP_SECRET is not set. Sessions and Spotify OAuth state will not be signed.');
    }
  }
}
