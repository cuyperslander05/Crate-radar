import { Router } from 'express';
import type { Response } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/security.ts';
import { db } from '../db/index.ts';
import {
  jamRooms,
  queueItems,
  queueUpvotes,
  publicUserColumnFlags,
} from '../db/schema.ts';
import {
  asyncRoute,
  badRequest,
  forbidden,
  notFound,
  parseId,
  requireString,
  optionalHttpsUrl,
  requireSpotifyTrackUri,
} from '../lib/http.ts';
import { emitQueueUpdate, emitRoomClosed } from '../sockets/index.ts';

const router = Router();

/**
 * Shared relational shape for a room. Note `columns: publicUserColumnFlags` on
 * the host — selecting the whole user row here would ship that user's Spotify
 * access and refresh tokens to every client that lists rooms.
 */
const roomWith = () => ({
  host: { columns: { ...publicUserColumnFlags } },
  queue: {
    where: isNull(queueItems.playedAt),
    orderBy: [desc(queueItems.upvotesCount), queueItems.createdAt],
    with: { addedBy: { columns: { ...publicUserColumnFlags } } },
  },
});

/** Loads one room with its queue, or throws 404. */
async function loadRoom(roomId: number) {
  const room = await db.query.jamRooms.findFirst({
    where: eq(jamRooms.id, roomId),
    with: roomWith(),
  });
  if (!room) throw notFound('Jam room not found');
  return room;
}

/** GET /api/jams — all active rooms, most recent first. */
router.get(
  '/',
  requireAuth,
  asyncRoute('jams:list', async (_req: AuthRequest, res: Response) => {
    const rooms = await db.query.jamRooms.findMany({
      where: eq(jamRooms.status, 'active'),
      orderBy: [desc(jamRooms.createdAt)],
      with: roomWith(),
    });
    res.json(rooms);
  })
);

/** GET /api/jams/me — rooms hosted by the caller. */
router.get(
  '/me',
  requireAuth,
  asyncRoute('jams:mine', async (req: AuthRequest, res: Response) => {
    const rooms = await db.query.jamRooms.findMany({
      where: eq(jamRooms.hostUid, req.user!.uid),
      orderBy: [desc(jamRooms.createdAt)],
      with: roomWith(),
    });
    res.json(rooms);
  })
);

/**
 * POST /api/jams — creates a room hosted by the caller.
 * "+ New room" previously only navigated to the jam screen without persisting
 * anything, so every user landed in whichever room the database returned first.
 */
router.post(
  '/',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'jams-create' }),
  asyncRoute('jams:create', async (req: AuthRequest, res: Response) => {
    const roomTitle = requireString(req.body?.roomTitle, 'roomTitle', { max: 80 });

    const [room] = await db
      .insert(jamRooms)
      .values({
        roomTitle,
        hostUid: req.user!.uid,
        status: 'active',
        activeListenersCount: 0,
      })
      .returning();

    res.status(201).json(await loadRoom(room.id));
  })
);

/**
 * GET /api/jams/current — the caller's own active room, falling back to the
 * most recently created active room.
 *
 * The previous implementation called findFirst() with no where or order clause,
 * so "join" on any room card resolved to an arbitrary row.
 */
router.get(
  '/current',
  requireAuth,
  asyncRoute('jams:current', async (req: AuthRequest, res: Response) => {
    const own = await db.query.jamRooms.findFirst({
      where: and(eq(jamRooms.hostUid, req.user!.uid), eq(jamRooms.status, 'active')),
      orderBy: [desc(jamRooms.createdAt)],
      with: roomWith(),
    });
    if (own) {
      res.json(own);
      return;
    }

    const latest = await db.query.jamRooms.findFirst({
      where: eq(jamRooms.status, 'active'),
      orderBy: [desc(jamRooms.createdAt)],
      with: roomWith(),
    });
    if (!latest) throw notFound('No active jam rooms yet');
    res.json(latest);
  })
);

/** GET /api/jams/:id */
router.get(
  '/:id',
  requireAuth,
  asyncRoute('jams:get', async (req: AuthRequest, res: Response) => {
    res.json(await loadRoom(parseId(req.params.id, 'room id')));
  })
);

/**
 * POST /api/jams/:id/queue — adds a track to a room's queue.
 * Accepts the normalised shape returned by /api/spotify/search.
 */
router.post(
  '/:id/queue',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'queue-add' }),
  asyncRoute('jams:addTrack', async (req: AuthRequest, res: Response) => {
    const roomId = parseId(req.params.id, 'room id');
    const room = await db.query.jamRooms.findFirst({ where: eq(jamRooms.id, roomId) });
    if (!room) throw notFound('Jam room not found');
    if (room.status !== 'active') throw badRequest('This room is closed');

    const title = requireString(req.body?.title, 'title', { max: 200 });
    const artist = requireString(req.body?.artist, 'artist', { max: 200 });
    const spotifyUri = requireSpotifyTrackUri(req.body?.spotifyUri);
    const albumArtUrl = optionalHttpsUrl(req.body?.albumArtUrl, 'albumArtUrl');
    const durationMsRaw = Number(req.body?.durationMs ?? 0);
    const durationMs =
      Number.isFinite(durationMsRaw) && durationMsRaw > 0
        ? Math.min(Math.floor(durationMsRaw), 24 * 60 * 60 * 1000)
        : null;

    // Reject a track that is already waiting in this room's queue.
    const existing = await db.query.queueItems.findFirst({
      where: and(
        eq(queueItems.roomId, roomId),
        eq(queueItems.spotifyUri, spotifyUri),
        isNull(queueItems.playedAt)
      ),
    });
    if (existing) throw badRequest('That track is already in the queue');

    const [item] = await db
      .insert(queueItems)
      .values({
        roomId,
        title,
        artist,
        spotifyUri,
        albumArtUrl,
        durationMs,
        addedByUid: req.user!.uid,
        upvotesCount: 0,
      })
      .returning();

    const updated = await loadRoom(roomId);
    emitQueueUpdate(roomId, updated);
    res.status(201).json(item);
  })
);

/**
 * POST /api/jams/:id/queue/:itemId/upvote — toggles the caller's vote.
 *
 * The vote lives in its own table with a unique (item, user) index, so the
 * count is derived from real rows and a replayed request cannot inflate it.
 */
router.post(
  '/:id/queue/:itemId/upvote',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'queue-vote' }),
  asyncRoute('jams:upvote', async (req: AuthRequest, res: Response) => {
    const roomId = parseId(req.params.id, 'room id');
    const itemId = parseId(req.params.itemId, 'queue item id');
    const uid = req.user!.uid;

    const item = await db.query.queueItems.findFirst({
      where: and(eq(queueItems.id, itemId), eq(queueItems.roomId, roomId)),
    });
    if (!item) throw notFound('Queue item not found');

    const voted = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(queueUpvotes)
        .where(and(eq(queueUpvotes.queueItemId, itemId), eq(queueUpvotes.uid, uid)));

      if (existing.length > 0) {
        await tx
          .delete(queueUpvotes)
          .where(and(eq(queueUpvotes.queueItemId, itemId), eq(queueUpvotes.uid, uid)));
      } else {
        await tx.insert(queueUpvotes).values({ queueItemId: itemId, uid });
      }

      // Recount from the source of truth rather than incrementing a cached number.
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(queueUpvotes)
        .where(eq(queueUpvotes.queueItemId, itemId));

      await tx.update(queueItems).set({ upvotesCount: count }).where(eq(queueItems.id, itemId));
      return { hasVoted: existing.length === 0, upvotesCount: count };
    });

    emitQueueUpdate(roomId, await loadRoom(roomId));
    res.json(voted);
  })
);

/**
 * POST /api/jams/:id/advance — host-only: marks the current track played and
 * promotes the next one. This is what makes the queue actually drive playback.
 */
router.post(
  '/:id/advance',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'queue-advance' }),
  asyncRoute('jams:advance', async (req: AuthRequest, res: Response) => {
    const roomId = parseId(req.params.id, 'room id');
    const room = await db.query.jamRooms.findFirst({ where: eq(jamRooms.id, roomId) });
    if (!room) throw notFound('Jam room not found');
    if (room.hostUid !== req.user!.uid) throw forbidden('Only the host controls playback');

    await db.transaction(async (tx) => {
      if (room.currentTrackId) {
        await tx
          .update(queueItems)
          .set({ playedAt: new Date() })
          .where(eq(queueItems.id, room.currentTrackId));
      }

      const [next] = await tx
        .select()
        .from(queueItems)
        .where(and(eq(queueItems.roomId, roomId), isNull(queueItems.playedAt)))
        .orderBy(desc(queueItems.upvotesCount), queueItems.createdAt)
        .limit(1);

      await tx
        .update(jamRooms)
        .set({ currentTrackId: next?.id ?? null })
        .where(eq(jamRooms.id, roomId));
    });

    const updated = await loadRoom(roomId);
    emitQueueUpdate(roomId, updated);
    res.json(updated);
  })
);

/** DELETE /api/jams/:id — host-only: closes a room. */
router.delete(
  '/:id',
  requireAuth,
  asyncRoute('jams:close', async (req: AuthRequest, res: Response) => {
    const roomId = parseId(req.params.id, 'room id');
    const room = await db.query.jamRooms.findFirst({ where: eq(jamRooms.id, roomId) });
    if (!room) throw notFound('Jam room not found');
    if (room.hostUid !== req.user!.uid) throw forbidden('Only the host can close this room');

    await db.update(jamRooms).set({ status: 'closed' }).where(eq(jamRooms.id, roomId));
    emitRoomClosed(roomId);
    res.json({ id: roomId, status: 'closed' });
  })
);

export default router;
