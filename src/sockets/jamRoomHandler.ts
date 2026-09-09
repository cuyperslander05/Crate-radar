import { Server, Socket } from 'socket.io';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jamRooms, roomMembers } from '../db/schema.ts';
import { roomChannel, emitPresence } from './index.ts';

interface HostSyncPayload {
  trackUri: string;
  positionMs: number;
  hostTimestamp: number;
  isPlaying: boolean;
}

const SPOTIFY_URI_PATTERN = /^spotify:track:[A-Za-z0-9]{22}$/;
const MAX_POSITION_MS = 24 * 60 * 60 * 1000;

export const registerJamRoomHandlers = (io: Server) => {
  io.on('connection', (socket) => handleConnection(socket));
};

/** Coerces a client-supplied room id into a positive integer, or null. */
function parseRoomId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Recomputes a room's listener count from the presence table and broadcasts it.
 * The count is derived rather than incremented so a dropped disconnect event
 * cannot leave the number permanently inflated.
 */
async function syncPresence(roomId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));

  await db
    .update(jamRooms)
    .set({ activeListenersCount: count })
    .where(eq(jamRooms.id, roomId));

  emitPresence(roomId, count);
}

const handleConnection = (socket: Socket) => {
  const uid = socket.data?.uid as string | undefined;
  if (!uid) {
    socket.disconnect(true);
    return;
  }

  // Rooms this socket has actually joined, so a sync event cannot be aimed at
  // a room the sender never entered.
  const joinedRooms = new Set<number>();

  socket.on('join_room', async (payload: { roomId?: unknown }) => {
    const roomId = parseRoomId(payload?.roomId);
    if (!roomId) {
      socket.emit('room_error', { error: 'A valid roomId is required' });
      return;
    }

    try {
      const room = await db.query.jamRooms.findFirst({ where: eq(jamRooms.id, roomId) });
      if (!room || room.status !== 'active') {
        socket.emit('room_error', { error: 'That jam room is not available' });
        return;
      }

      socket.join(roomChannel(roomId));
      joinedRooms.add(roomId);

      // onConflictDoNothing: a second tab from the same user is one listener.
      await db
        .insert(roomMembers)
        .values({ roomId, uid })
        .onConflictDoNothing({ target: [roomMembers.roomId, roomMembers.uid] });

      socket.to(roomChannel(roomId)).emit('user_joined', { userId: uid, roomId });
      await syncPresence(roomId);
    } catch (error) {
      console.error('join_room failed:', error);
      socket.emit('room_error', { error: 'Could not join the room' });
    }
  });

  const leave = async (roomId: number) => {
    socket.leave(roomChannel(roomId));
    joinedRooms.delete(roomId);
    try {
      await db
        .delete(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.uid, uid)));
      socket.to(roomChannel(roomId)).emit('user_left', { userId: uid, roomId });
      await syncPresence(roomId);
    } catch (error) {
      console.error('leave_room failed:', error);
    }
  };

  socket.on('leave_room', async (payload: { roomId?: unknown }) => {
    const roomId = parseRoomId(payload?.roomId);
    if (roomId && joinedRooms.has(roomId)) await leave(roomId);
  });

  /**
   * Playback sync from the host.
   *
   * The sender must be the room's host: previously any socket in the room could
   * emit this and every other listener would seek to the position it dictated.
   */
  socket.on(
    'host_sync_update',
    async (payload: HostSyncPayload & { roomId?: unknown }, ack?: (res: { ok: boolean }) => void) => {
      const roomId = parseRoomId(payload?.roomId);
      if (!roomId || !joinedRooms.has(roomId)) {
        ack?.({ ok: false });
        return;
      }

      try {
        const room = await db.query.jamRooms.findFirst({ where: eq(jamRooms.id, roomId) });
        if (!room || room.hostUid !== uid) {
          ack?.({ ok: false });
          return;
        }

        const trackUri =
          typeof payload?.trackUri === 'string' && SPOTIFY_URI_PATTERN.test(payload.trackUri)
            ? payload.trackUri
            : '';
        const positionMs =
          typeof payload?.positionMs === 'number' && Number.isFinite(payload.positionMs)
            ? Math.min(Math.max(0, Math.floor(payload.positionMs)), MAX_POSITION_MS)
            : 0;

        socket.to(roomChannel(roomId)).emit('room_sync_update', {
          trackUri,
          positionMs,
          // Stamped server-side: a client clock cannot be trusted to compute drift.
          hostTimestamp: Date.now(),
          isPlaying: Boolean(payload?.isPlaying),
        });
        ack?.({ ok: true });
      } catch (error) {
        console.error('host_sync_update failed:', error);
        ack?.({ ok: false });
      }
    }
  );

  socket.on('disconnect', async () => {
    for (const roomId of [...joinedRooms]) {
      await leave(roomId);
    }
  });
};
