import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { listeningHistory } from './schema.ts';

interface PlayInput {
  spotifyUri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number | null;
  deviceName: string | null;
  /** How far into the track playback currently is. */
  progressMs: number;
}

/**
 * Records a play, ignoring the repeats that polling inevitably produces.
 */
export async function recordPlay(uid: string, play: PlayInput): Promise<void> {
  const [last] = await db
    .select()
    .from(listeningHistory)
    .where(eq(listeningHistory.uid, uid))
    .orderBy(desc(listeningHistory.playedAt))
    .limit(1);

  if (last && last.spotifyUri === play.spotifyUri) {
    const playedAt = last.playedAt instanceof Date ? last.playedAt : new Date(last.playedAt);
    const sinceLast = Date.now() - playedAt.getTime();
    // A replay is only plausible once we are at least as far along as the
    // previous row's start; below that this is the same listen still running.
    const looksLikeReplay = play.progressMs < 5_000 && sinceLast > 30_000;
    if (!looksLikeReplay) return;
  }

  await db.insert(listeningHistory).values({
    uid,
    spotifyUri: play.spotifyUri,
    title: play.title,
    artist: play.artist,
    albumArtUrl: play.albumArtUrl,
    durationMs: play.durationMs,
    deviceName: play.deviceName,
  });
}

/** Most recent plays, newest first. */
export async function getRecentHistory(uid: string, limit = 50, offset = 0) {
  return db
    .select()
    .from(listeningHistory)
    .where(eq(listeningHistory.uid, uid))
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit)
    .offset(offset);
}

/** Restricts a stats query to a rolling window, or all time when null. */
const scopeFor = (uid: string, since: Date | null) =>
  since
    ? and(eq(listeningHistory.uid, uid), gte(listeningHistory.playedAt, since))
    : eq(listeningHistory.uid, uid);

/**
 * Listening statistics derived from history, independent of jam rooms.
 */
export async function getListeningStats(uid: string, since: Date | null) {
  const scope = scopeFor(uid, since);

  const topTracks = await db
    .select({
      title: listeningHistory.title,
      artist: listeningHistory.artist,
      albumArtUrl: listeningHistory.albumArtUrl,
      spotifyUri: listeningHistory.spotifyUri,
      plays: sql<number>`count(*)`,
    })
    .from(listeningHistory)
    .where(scope)
    .groupBy(
      listeningHistory.title,
      listeningHistory.artist,
      listeningHistory.albumArtUrl,
      listeningHistory.spotifyUri
    )
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topArtists = await db
    .select({
      artist: listeningHistory.artist,
      plays: sql<number>`count(*)`,
    })
    .from(listeningHistory)
    .where(scope)
    .groupBy(listeningHistory.artist)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const [totals] = await db
    .select({
      plays: sql<number>`count(*)`,
      uniqueTracks: sql<number>`count(distinct ${listeningHistory.spotifyUri})`,
      uniqueArtists: sql<number>`count(distinct ${listeningHistory.artist})`,
      // Approximate: assumes a track played to completion.
      listeningMs: sql<number>`coalesce(sum(${listeningHistory.durationMs}), 0)`,
    })
    .from(listeningHistory)
    .where(scope);

  // Distinct track ids for the Spotify audio-features lookup (100 max).
  const uriRows = await db
    .selectDistinct({ spotifyUri: listeningHistory.spotifyUri })
    .from(listeningHistory)
    .where(scope)
    .limit(100);

  return {
    topTracks,
    topArtists,
    totals: {
      plays: totals?.plays ?? 0,
      uniqueTracks: totals?.uniqueTracks ?? 0,
      uniqueArtists: totals?.uniqueArtists ?? 0,
      listeningMinutes: Math.round(Number(totals?.listeningMs ?? 0) / 60000),
    },
    trackIds: uriRows.map((r) => r.spotifyUri.split('').pop()!).filter(Boolean),
  };
}
