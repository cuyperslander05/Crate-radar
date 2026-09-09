import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { auth } from '../lib/firebase';

interface HostSyncPayload {
  trackUri: string;
  positionMs: number;
  isPlaying: boolean;
}

interface RoomSyncUpdate extends HostSyncPayload {
  hostTimestamp: number;
}

interface UseJamRoomSocketOptions {
  enabled: boolean;
  roomId?: number;
  isHost?: boolean;
  localPositionMs?: number;
  isPlayerReady?: boolean;
  seekTo?: (positionMs: number) => Promise<void> | void;
  /** Called when another member changes the queue. */
  onQueueUpdate?: (room: unknown) => void;
  /** Called when the host ends the session. */
  onRoomClosed?: () => void;
}

const SYNC_THRESHOLD_MS = 1500;

/**
 * Socket.io connection authenticated with the Firebase ID token, keeping the
 * local player aligned with the host and the queue in step with the server.
 */
export function useJamRoomSocket({
  enabled,
  roomId,
  isHost = false,
  localPositionMs = 0,
  isPlayerReady = false,
  seekTo,
  onQueueUpdate,
  onRoomClosed,
}: UseJamRoomSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  // Latest values held in refs so the socket effect does not need to tear down
  // and reconnect every time playback position changes.
  const seekToRef = useRef(seekTo);
  const isHostRef = useRef(isHost);
  const localPositionRef = useRef(localPositionMs);
  const isPlayerReadyRef = useRef(isPlayerReady);
  const onQueueUpdateRef = useRef(onQueueUpdate);
  const onRoomClosedRef = useRef(onRoomClosed);
  seekToRef.current = seekTo;
  isHostRef.current = isHost;
  localPositionRef.current = localPositionMs;
  isPlayerReadyRef.current = isPlayerReady;
  onQueueUpdateRef.current = onQueueUpdate;
  onRoomClosedRef.current = onRoomClosed;

  const [isConnected, setIsConnected] = useState(false);
  const [driftMs, setDriftMs] = useState(0);
  const [isInSync, setIsInSync] = useState(true);
  const [listeners, setListeners] = useState<number | null>(null);
  const [lastHostUpdate, setLastHostUpdate] = useState<RoomSyncUpdate | null>(null);

  useEffect(() => {
    if (!enabled || !roomId) return;
    let disposed = false;

    const connect = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || disposed) return;

        const socket = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        // Registered once; re-emitted on every reconnect so a dropped
        // connection rejoins the room automatically.
        socket.on('connect', () => {
          setIsConnected(true);
          socket.emit('join_room', { roomId });
        });
        socket.on('disconnect', () => setIsConnected(false));

        socket.on('room_sync_update', (payload: RoomSyncUpdate) => {
          if (isHostRef.current) return;
          setLastHostUpdate(payload);

          // Project the host's position forward by the transit time.
          const hostNowMs = payload.positionMs + (Date.now() - payload.hostTimestamp);
          const drift = Math.abs(localPositionRef.current - hostNowMs);
          setDriftMs(Math.round(drift));
          setIsInSync(drift <= SYNC_THRESHOLD_MS);

          if (payload.isPlaying && drift > SYNC_THRESHOLD_MS && isPlayerReadyRef.current) {
            seekToRef.current?.(hostNowMs);
          }
        });

        socket.on('room_presence', (payload: { activeListenersCount: number }) => {
          setListeners(payload.activeListenersCount);
        });
        socket.on('queue_update', (room: unknown) => onQueueUpdateRef.current?.(room));
        socket.on('room_closed', () => onRoomClosedRef.current?.());
        socket.on('room_error', (payload: { error: string }) =>
          console.warn('Jam room error:', payload?.error)
        );
      } catch (err) {
        console.error('Failed to establish jam socket:', err);
      }
    };

    connect();

    return () => {
      disposed = true;
      const socket = socketRef.current;
      if (socket) {
        socket.emit('leave_room', { roomId });
        socket.disconnect();
      }
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, roomId]);

  /** Broadcasts the host's playback position to everyone else in the room. */
  const emitHostSync = useCallback(
    (payload: HostSyncPayload) => {
      if (!roomId) return;
      socketRef.current?.emit('host_sync_update', { ...payload, roomId });
    },
    [roomId]
  );

  return {
    isConnected,
    driftMs,
    isInSync,
    listeners,
    lastHostUpdate,
    isHost,
    emitHostSync,
  };
}
