import { Router } from 'express';
import type { Response } from 'express';
import { desc, eq, ne, sql, and, isNull } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/security.ts';
import { db } from '../db/index.ts';
import { users, jamRooms, queueItems, publicUserColumns } from '../db/schema.ts';
import {
  getOrCreateUser,
  getUserProfile,
  completeOnboarding,
  updateUserProfile,
} from '../db/users.ts';
import {
  asyncRoute,
  badRequest,
  notFound,
  optionalString,
  optionalHttpsUrl,
} from '../lib/http.ts';
import { getValidAccessToken } from './spotify.ts';
import { getListeningStats, getRecentHistory } from '../db/history.ts';

const router = Router();

export interface VibeAverages {
  energy: number;
  valence: number;
  danceability: number;
  sampleSize: number;
}

/**
 * Averages Spotify's audio features across the given track ids.
 * Returns null when there is nothing to measure or Spotify is unavailable —
 * the caller renders an empty state rather than fabricating numbers.
 */
async function getAudioFeatureAverages(
  uid: string,
  trackIds: string[]
): Promise<VibeAverages | null> {
  if (trackIds.length === 0) return null;

  const accessToken = await getValidAccessToken(uid);
  const params = new URLSearchParams({ ids: trackIds.slice(0, 100).join(',') });
  const resp = await fetch(`https://api.spotify.com/v1/audio-features?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;

  const data = (await resp.json()) as { audio_features?: (null | Record<string, number>)[] };
  const features = (data.audio_features ?? []).filter(Boolean) as Record<string, number>[];
  if (features.length === 0) return null;

  const mean = (key: string) =>
    features.reduce((sum, f) => sum + (f[key] ?? 0), 0) / features.length;

  return {
    energy: Number(mean('energy').toFixed(3)),
    valence: Number(mean('valence').toFixed(3)),
    danceability: Number(mean('danceability').toFixed(3)),
    sampleSize: features.length,
  };
}

/**
 * POST /api/auth/sync — upserts the caller's profile from their Firebase
 * identity. Only display fields are accepted; uid and email come from the
 * verified token, never from the request body.
 */
router.post(
  '/auth/sync',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'auth-sync' }),
  asyncRoute('users:sync', async (req: AuthRequest, res: Response) => {
    const user = req.user!;

    // Sign-in must not fail over a cosmetic field: an unusable avatar URL is
    // dropped rather than rejected, which would strand the user on onboarding.
    let avatarUrl: string | null = null;
    try {
      avatarUrl = optionalHttpsUrl(req.body?.avatarUrl, 'avatarUrl');
    } catch {
      avatarUrl = null;
    }

    const profile = await getOrCreateUser(user.uid, user.email ?? '', {
      username: optionalString(req.body?.username, 'username', { max: 40 }),
      displayName: optionalString(req.body?.displayName, 'displayName', { max: 80 }),
      avatarUrl,
    });
    res.json(profile);
  })
);

/** GET /api/users/me — the caller's own profile (no Spotify tokens). */
router.get(
  '/users/me',
  requireAuth,
  asyncRoute('users:me', async (req: AuthRequest, res: Response) => {
    const profile = await getUserProfile(req.user!.uid);
    if (!profile) throw notFound('User not found');
    res.json(profile);
  })
);

/**
 * PATCH /api/users/me — updates the caller's own editable profile fields.
 * The "Edit profile" button previously opened a paywall modal instead.
 */
router.patch(
  '/users/me',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'profile-update' }),
  asyncRoute('users:update', async (req: AuthRequest, res: Response) => {
    const updates: Record<string, string> = {};

    const displayName = optionalString(req.body?.displayName, 'displayName', { max: 80 });
    if (displayName) updates.displayName = displayName;

    const bio = optionalString(req.body?.bio, 'bio', { max: 300 });
    if (bio !== null) updates.bio = bio;

    const username = optionalString(req.body?.username, 'username', { max: 40 });
    if (username) {
      if (!/^[a-zA-Z0-9_.]{3,40}$/.test(username)) {
        throw badRequest('Username may only contain letters, numbers, underscores and dots');
      }
      // Usernames are shown publicly, so they must stay unique.
      const taken = await db
        .select({ uid: users.uid })
        .from(users)
        .where(and(eq(users.username, username), ne(users.uid, req.user!.uid)))
        .limit(1);
      if (taken.length > 0) throw badRequest('That username is already taken');
      updates.username = username;
    }

    if (Object.keys(updates).length === 0) throw badRequest('Nothing to update');

    const updated = await updateUserProfile(req.user!.uid, updates);
    if (!updated) throw notFound('User not found');
    res.json(updated);
  })
);

/** POST /api/users/onboarding — marks onboarding complete. */
router.post(
  '/users/onboarding',
  requireAuth,
  asyncRoute('users:onboarding', async (req: AuthRequest, res: Response) => {
    const profile = await completeOnboarding(req.user!.uid);
    if (!profile) throw notFound('User not found');
    res.json(profile);
  })
);

/**
 * GET /api/users — other users on the radar.
 *
 * Explicit column selection matters here: `findMany()` on the users table
 * returns spotify_access_token and spotify_refresh_token, which would hand
 * every caller the credentials of every other user.
 */
router.get(
  '/users',
  requireAuth,
  asyncRoute('users:list', async (req: AuthRequest, res: Response) => {
    const others = await db
      .select(publicUserColumns)
      .from(users)
      .where(ne(users.uid, req.user!.uid))
      .orderBy(desc(users.createdAt))
      .limit(20);
    res.json(others);
  })
);

/** Maps the UI's range buttons to a cutoff date. */
function rangeCutoff(range: unknown): Date | null {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : null;
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * GET /api/analytics?range=7d|30d|all
 *
 * Statistics from the user's listening history, which is recorded whenever the
 * app is open regardless of jam rooms, plus their hosting activity. Previously
 * this only counted tracks queued in rooms the user hosted, so a user who had
 * never hosted a room saw nothing at all.
 */
router.get(
  '/analytics',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'analytics' }),
  asyncRoute('users:analytics', async (req: AuthRequest, res: Response) => {
    const uid = req.user!.uid;
    const cutoff = rangeCutoff(req.query.range);

    const stats = await getListeningStats(uid, cutoff);

    const [hosting] = await db
      .select({
        rooms: sql<number>`count(distinct ${jamRooms.id})`,
        queued: sql<number>`count(${queueItems.id})`,
      })
      .from(jamRooms)
      .leftJoin(queueItems, eq(queueItems.roomId, jamRooms.id))
      .where(eq(jamRooms.hostUid, uid));

    res.json({
      topTracks: stats.topTracks.map((row, i) => ({ id: i + 1, ...row, hot: i === 0 })),
      topArtists: stats.topArtists,
      topArtist: stats.topArtists[0]?.artist ?? null,
      totals: {
        ...stats.totals,
        rooms: hosting?.rooms ?? 0,
        queued: hosting?.queued ?? 0,
      },
      // A missing Spotify link just means no vibe section, not a failed request.
      vibe: await getAudioFeatureAverages(uid, stats.trackIds).catch(() => null),
    });
  })
);

/**
 * GET /api/history?limit=&offset= — the user's recent plays, newest first.
 */
router.get(
  '/history',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'history' }),
  asyncRoute('users:history', async (req: AuthRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(await getRecentHistory(req.user!.uid, limit, offset));
  })
);

/**
 * GET /api/search?q= — searches tracks already queued somewhere.
 *
 * The wildcard characters in the user's input are escaped so a query like "%"
 * cannot turn into a full-table scan pattern.
 */
router.get(
  '/search',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'local-search' }),
  asyncRoute('users:search', async (req: AuthRequest, res: Response) => {
    const raw = String(req.query.q ?? '').trim().slice(0, 200);
    if (!raw) {
      res.json([]);
      return;
    }

    const pattern = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const results = await db
      .select({
        id: queueItems.id,
        title: queueItems.title,
        artist: queueItems.artist,
        albumArtUrl: queueItems.albumArtUrl,
        spotifyUri: queueItems.spotifyUri,
        durationMs: queueItems.durationMs,
      })
      .from(queueItems)
      .where(
        and(
          isNull(queueItems.playedAt),
          sql`(${queueItems.title} LIKE ${pattern} OR ${queueItems.artist} LIKE ${pattern})`
        )
      )
      .limit(20);

    res.json(results);
  })
);

export default router;

