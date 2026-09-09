import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getAllowedOrigins } from '../lib/env.ts';
import { registerJamRoomHandlers } from './jamRoomHandler.ts';

let ioInstance: Server | null = null;

/**
 * Attaches a Socket.io server to the existing HTTP server and wires up
 * Firebase-token authentication plus the jam room handlers.
 */
export const createSocketServer = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      // Never "*": an open origin lets any site connect a visitor's browser to
      // this server and read every room broadcast they are entitled to.
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Keep a single oversized frame from exhausting server memory.
    maxHttpBufferSize: 1e5,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      next(new Error('Authentication error: missing token'));
      return;
    }
    try {
      // checkRevoked: a signed-out or disabled account must not keep a live
      // socket open for the remaining lifetime of its ID token.
      const decoded = await adminAuth.verifyIdToken(token, true);
      socket.data.uid = decoded.uid;
      next();
    } catch {
      next(new Error('Authentication error: invalid token'));
    }
  });

  registerJamRoomHandlers(io);
  ioInstance = io;
  return io;
};

export const getIo = () => ioInstance;

export const roomChannel = (roomId: number | string) => `room:${roomId}`;

/** Pushes an updated room (including its queue) to everyone in that room. */
export function emitQueueUpdate(roomId: number, room: unknown) {
  ioInstance?.to(roomChannel(roomId)).emit('queue_update', room);
}

/** Tells listeners the host ended the session. */
export function emitRoomClosed(roomId: number) {
  ioInstance?.to(roomChannel(roomId)).emit('room_closed', { roomId });
}

/** Broadcasts the current listener count for a room. */
export function emitPresence(roomId: number, activeListenersCount: number) {
  ioInstance?.to(roomChannel(roomId)).emit('room_presence', { roomId, activeListenersCount });
}
