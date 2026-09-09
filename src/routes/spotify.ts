import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/security.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { env, getSpotifyRedirectUri } from '../lib/env.ts';
import { encryptSecret, decryptSecret, createOAuthState, verifyOAuthState } from '../lib/crypto.ts';
import { asyncRoute, HttpError, requireString } from '../lib/http.ts';
import { recordPlay } from '../db/history.ts';

const router = Router();

const APP_URL = env.appUrl;
// Must match an entry in the Spotify dashboard exactly.
const REDIRECT_URI = getSpotifyRedirectUri();

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API = 'https://api.spotify.com/v1';

/**
 * Name the Web Playback SDK registers this browser under. Shared with the
 * client so now-playing can tell "playing in Crate" from "playing elsewhere".
 */
export const CRATE_DEVICE_NAME = 'Crate Web Player';
const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

/** Fails clearly instead of building an authorize URL with an empty client id. */
function assertSpotifyConfigured() {
  if (!env.spotify.clientId || !env.spotify.clientSecret) {
    throw new HttpError(
      503,
      'Spotify is not configured on this server. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.'
    );
  }
}

/**
 * GET /api/spotify/login
 * Returns the Spotify authorize URL for the signed-in user. The `state` is an
 * HMAC-signed, expiring token rather than the bare uid, so a third party cannot
 * complete the flow on someone else's behalf.
 */
router.get(
  '/login',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'spotify-login' }),
  asyncRoute('spotify:login', async (req: AuthRequest, res: Response) => {
    assertSpotifyConfigured();
    const params = new URLSearchParams({
      client_id: env.spotify.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SPOTIFY_SCOPES,
      state: createOAuthState(req.user!.uid),
      show_dialog: 'true',
    });
    res.json({ authUrl: `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}` });
  })
);

async function spotifyTokenRequest(body: URLSearchParams) {
  const basic = Buffer.from(`${env.spotify.clientId}:${env.spotify.clientSecret}`).toString(
    'base64'
  );
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    // The response body can echo the client secret back; never surface it.
    const detail = await resp.text().catch(() => '');
    console.error(`Spotify token request failed (${resp.status}):`, detail);
    throw new HttpError(502, 'Spotify rejected the token request.');
  }
  return resp.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

const exchangeCodeForToken = (code: string) =>
  spotifyTokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    })
  );

const refreshAccessToken = (refreshToken: string) =>
  spotifyTokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  );

/**
 * GET /api/spotify/callback
 * Spotify redirects here after the user approves. The signed state identifies
 * which account the returned tokens belong to.
 */
router.get(
  '/callback',
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'spotify-callback' }),
  asyncRoute('spotify:callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      console.warn('Spotify authorization declined:', error);
      res.redirect(`${APP_URL}/?spotify=denied`);
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.redirect(`${APP_URL}/?spotify=error`);
      return;
    }

    const uid = verifyOAuthState(state);
    if (!uid) {
      console.warn('Rejected Spotify callback with an invalid or expired state parameter.');
      res.redirect(`${APP_URL}/?spotify=invalid_state`);
      return;
    }

    try {
      const tokenData = await exchangeCodeForToken(code);
      await db
        .update(users)
        .set({
          spotifyAccessToken: encryptSecret(tokenData.access_token),
          spotifyRefreshToken: tokenData.refresh_token
            ? encryptSecret(tokenData.refresh_token)
            : null,
          spotifyTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        })
        .where(eq(users.uid, uid));

      res.redirect(`${APP_URL}/?spotify=connected`);
    } catch (err) {
      console.error('Failed to link Spotify account:', err);
      res.redirect(`${APP_URL}/?spotify=error`);
    }
  })
);

/**
 * Returns a currently-valid Spotify access token for a user, refreshing it when
 * expired. Shared by the /token route and the server-side search proxy.
 */
export async function getValidAccessToken(uid: string): Promise<string> {
  const rows = await db.select().from(users).where(eq(users.uid, uid));
  const user = rows[0];

  const accessToken = decryptSecret(user?.spotifyAccessToken);
  if (!user || !accessToken) {
    throw new HttpError(428, 'Spotify account not linked');
  }

  // Refresh a minute early so a token cannot expire mid-request.
  const expiresAt = user.spotifyTokenExpiresAt
    ? new Date(user.spotifyTokenExpiresAt).getTime()
    : 0;
  if (expiresAt - 60_000 > Date.now()) return accessToken;

  const refreshToken = decryptSecret(user.spotifyRefreshToken);
  if (!refreshToken) {
    throw new HttpError(428, 'Spotify session expired. Please reconnect your account.');
  }

  const refreshed = await refreshAccessToken(refreshToken);
  await db
    .update(users)
    .set({
      spotifyAccessToken: encryptSecret(refreshed.access_token),
      spotifyRefreshToken: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : user.spotifyRefreshToken,
      spotifyTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    })
    .where(eq(users.uid, uid));

  return refreshed.access_token;
}

/**
 * GET /api/spotify/status
 * Lets the UI show a "connect Spotify" prompt without triggering a token
 * refresh or a 4xx in the console.
 */
router.get(
  '/status',
  requireAuth,
  asyncRoute('spotify:status', async (req: AuthRequest, res: Response) => {
    const rows = await db.select().from(users).where(eq(users.uid, req.user!.uid));
    const user = rows[0];
    const linked = Boolean(decryptSecret(user?.spotifyAccessToken));
    res.json({
      linked,
      configured: Boolean(env.spotify.clientId && env.spotify.clientSecret),
      expiresAt: user?.spotifyTokenExpiresAt ?? null,
    });
  })
);

/**
 * GET /api/spotify/token
 * Hands the Web Playback SDK a valid access token for the current user.
 */
router.get(
  '/token',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'spotify-token' }),
  asyncRoute('spotify:token', async (req: AuthRequest, res: Response) => {
    assertSpotifyConfigured();
    const accessToken = await getValidAccessToken(req.user!.uid);
    res.json({ accessToken });
  })
);

/**
 * DELETE /api/spotify/link
 * Disconnects the Spotify account and clears the stored tokens.
 */
router.delete(
  '/link',
  requireAuth,
  asyncRoute('spotify:unlink', async (req: AuthRequest, res: Response) => {
    await db
      .update(users)
      .set({
        spotifyAccessToken: null,
        spotifyRefreshToken: null,
        spotifyTokenExpiresAt: null,
      })
      .where(eq(users.uid, req.user!.uid));
    res.json({ linked: false });
  })
);

export interface SpotifySearchHit {
  spotifyUri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
}

/**
 * GET /api/spotify/now-playing
 *
 * What the user's Spotify account is currently playing, on ANY device.
 *
 * The Web Playback SDK registers its own device and only reports playback on
 * that device, so music started in the desktop or phone app is invisible to it.
 * This endpoint lets the UI notice that playback and offer to adopt it.
 */
router.get(
  '/now-playing',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'spotify-now-playing' }),
  asyncRoute('spotify:nowPlaying', async (req: AuthRequest, res: Response) => {
    assertSpotifyConfigured();
    const accessToken = await getValidAccessToken(req.user!.uid);

    const resp = await fetch(`${SPOTIFY_API}/me/player`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 204 means the account has no active playback session at all.
    if (resp.status === 204) {
      res.json({ playing: false, track: null, device: null });
      return;
    }
    if (!resp.ok) {
      console.error('Spotify now-playing failed:', resp.status);
      throw new HttpError(502, 'Could not read your Spotify playback state.');
    }

    const data = (await resp.json()) as any;
    const item = data?.item;

    // Record the play so history and statistics accumulate outside jam rooms.
    if (item?.uri && data?.is_playing) {
      await recordPlay(req.user!.uid, {
        spotifyUri: item.uri,
        title: item.name ?? 'Unknown track',
        artist: (item.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown artist',
        albumArtUrl: item.album?.images?.[0]?.url ?? null,
        durationMs: item.duration_ms ?? null,
        deviceName: data?.device?.name ?? null,
        progressMs: data?.progress_ms ?? 0,
      }).catch((err) => {
        // History is a side effect; never fail the request over it.
        console.error('Failed to record listening history:', err);
      });
    }

    res.json({
      playing: Boolean(data?.is_playing),
      progressMs: data?.progress_ms ?? 0,
      device: data?.device
        ? {
            id: data.device.id,
            name: data.device.name,
            type: data.device.type,
            // True when the active device is this app's own browser player.
            isCrate: data.device.name === CRATE_DEVICE_NAME,
          }
        : null,
      track: item
        ? {
            spotifyUri: item.uri,
            title: item.name,
            artist: (item.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown artist',
            albumArtUrl: item.album?.images?.[0]?.url ?? null,
            durationMs: item.duration_ms ?? 0,
          }
        : null,
    });
  })
);

/**
 * GET /api/spotify/search?q=...
 * Server-side proxy for the Spotify catalogue search. Proxying keeps the access
 * token on the server and lets us normalise the response into the shape the
 * queue expects.
 */
router.get(
  '/search',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'spotify-search' }),
  asyncRoute('spotify:search', async (req: AuthRequest, res: Response) => {
    assertSpotifyConfigured();
    const q = requireString(req.query.q, 'q', { max: 200 });
    const accessToken = await getValidAccessToken(req.user!.uid);

    const params = new URLSearchParams({ q, type: 'track', limit: '20' });
    const resp = await fetch(`${SPOTIFY_API}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      console.error('Spotify search failed:', resp.status, await resp.text().catch(() => ''));
      throw new HttpError(502, 'Spotify search is unavailable right now.');
    }

    const data = (await resp.json()) as any;
    const hits: SpotifySearchHit[] = (data?.tracks?.items ?? []).map((track: any) => ({
      spotifyUri: track.uri,
      title: track.name,
      artist: (track.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown artist',
      albumArtUrl: track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms ?? 0,
    }));

    res.json(hits);
  })
);

export default router;
