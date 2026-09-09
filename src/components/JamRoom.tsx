import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, Share2, SkipForward, SkipBack, Play, Plus, Zap, Heart, Flame,
  Headphones, Waves, Loader2, Music, AlertTriangle, ChevronUp, Radio, Plus as PlusIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ScreenState } from '../types';
import { QueueSearchModal } from './QueueSearchModal';
import { AlbumArt } from './common/AlbumArt';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';
import { useAuth } from '../lib/AuthContext';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import { useJamRoomSocket } from '../hooks/useJamRoomSocket';
import { useSpotifyLink } from '../hooks/useSpotifyLink';
import { useNowPlaying } from '../lib/NowPlayingContext';
import { transferPlayback } from '../lib/spotifyControls';

interface JamRoomProps {
  setScreen: (screen: ScreenState) => void;
  /** Room to open; falls back to the caller's current room when absent. */
  roomId?: number | null;
}

interface QueueItem {
  id: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyUri: string | null;
  durationMs: number | null;
  upvotesCount: number;
  addedByUid: string;
}

interface Room {
  id: number;
  roomTitle: string;
  hostUid: string;
  activeListenersCount: number;
  currentTrackId: number | null;
  host?: { uid: string; username: string | null; displayName: string | null };
  queue: QueueItem[];
}

const REACTIONS = [
  { key: 'fire', Icon: Flame },
  { key: 'headphones', Icon: Headphones },
  { key: 'heart', Icon: Heart },
  { key: 'waves', Icon: Waves },
] as const;

const formatTime = (ms: number) => {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};

export function JamRoom({ setScreen, roomId }: JamRoomProps) {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const { linked: spotifyLinked } = useSpotifyLink();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [queueingNowPlaying, setQueueingNowPlaying] = useState(false);
  const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const reactionId = useRef(0);

  const loadRoom = useCallback(async () => {
    try {
      setLoadError(null);
      const path = roomId ? `/api/jams/${roomId}` : '/api/jams/current';
      setRoom(await api<Room>(path));
    } catch (err) {
      setRoom(null);
      setLoadError(errorMessage(err, 'Could not load this jam room.'));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (profile) loadRoom();
  }, [profile, loadRoom]);

  const isHost = Boolean(room && profile && room.hostUid === profile.uid);
  const roomReady = Boolean(room && !loading);

  // The queue is already ordered by votes server-side. The current track is the
  // room's currentTrackId when set, otherwise the top of the queue.
  const currentTrack =
    room?.queue.find((t) => t.id === room.currentTrackId) ?? room?.queue[0] ?? null;
  const upNext = room?.queue.filter((t) => t.id !== currentTrack?.id) ?? [];

  const player = useSpotifyPlayer(roomReady && spotifyLinked);
  const {
    track: externalTrack,
    device: externalDevice,
    isElsewhere,
    refresh: refreshNowPlaying,
  } = useNowPlaying();

  const sync = useJamRoomSocket({
    enabled: roomReady,
    roomId: room?.id,
    isHost,
    localPositionMs: player.positionMs,
    isPlayerReady: player.isReady,
    seekTo: player.seekTo,
    onQueueUpdate: (updated) => setRoom(updated as Room),
    onRoomClosed: () => {
      toastError('The host ended this session.');
      setScreen('radar');
    },
  });

  // Host: broadcast playback state so listeners stay aligned.
  const canBroadcast = isHost && player.isReady && Boolean(player.deviceId);
  const { emitHostSync } = sync;

  // Latest playback state, read by the heartbeat below. Kept in a ref so the
  // interval is not torn down and rebuilt on every position update.
  const playbackRef = useRef({ uri: '', positionMs: 0, isPlaying: false });
  playbackRef.current = {
    uri: player.currentTrack?.uri || '',
    positionMs: player.positionMs,
    isPlaying: !player.isPaused && Boolean(player.currentTrack),
  };

  useEffect(() => {
    if (!canBroadcast) return;
    const emit = () => {
      const { uri, positionMs, isPlaying } = playbackRef.current;
      emitHostSync({ trackUri: uri, positionMs, isPlaying });
    };
    emit();
    // A 2s heartbeat covers long tracks where no state-change event fires.
    const interval = setInterval(emit, 2000);
    return () => clearInterval(interval);
  }, [canBroadcast, emitHostSync]);

  // Also emit immediately on a track change or play/pause, so listeners do not
  // wait up to two seconds for the next heartbeat.
  useEffect(() => {
    if (!canBroadcast) return;
    const { uri, positionMs, isPlaying } = playbackRef.current;
    emitHostSync({ trackUri: uri, positionMs, isPlaying });
  }, [canBroadcast, emitHostSync, player.currentTrack?.uri, player.isPaused]);

  // Surface player errors once rather than leaving a dead, unexplained button.
  const reportedError = useRef<string | null>(null);
  useEffect(() => {
    if (player.error && player.error !== reportedError.current) {
      reportedError.current = player.error;
      toastError(player.error);
    }
  }, [player.error, toastError]);

  const handlePlayPause = useCallback(async () => {
    if (!player.isPaused) {
      await player.pausePlayback();
      return;
    }
    // Start the queue's current track rather than resuming whatever happened to
    // be playing on the user's Spotify account.
    await player.startPlayback(currentTrack?.spotifyUri ?? undefined);
  }, [player, currentTrack]);

  /**
   * Moves playback from the user's other Spotify device into this browser, so
   * the room can see and sync it.
   */
  const handlePlayHere = useCallback(async () => {
    if (!player.deviceId) {
      toastError('The Crate player is still starting up. Try again in a moment.');
      return;
    }
    setTransferring(true);
    try {
      await transferPlayback(player.deviceId, true);
      success('Playback moved to Crate.');
      // Spotify needs a moment before /me/player reports the new device.
      setTimeout(refreshNowPlaying, 1500);
    } catch (err) {
      toastError(errorMessage(err, 'Could not move playback to this browser.'));
    } finally {
      setTransferring(false);
    }
  }, [player.deviceId, success, toastError, refreshNowPlaying]);

  /** Adds whatever is playing elsewhere into this room's queue. */
  const handleQueueNowPlaying = useCallback(async () => {
    const track = externalTrack;
    if (!room || !track) return;
    setQueueingNowPlaying(true);
    try {
      await api(`/api/jams/${room.id}/queue`, { method: 'POST', json: track });
      await loadRoom();
      success(`Added "${track.title}" to the queue.`);
    } catch (err) {
      toastError(errorMessage(err, 'Could not add that track.'));
    } finally {
      setQueueingNowPlaying(false);
    }
  }, [room, externalTrack, loadRoom, success, toastError]);

  const handleUpvote = useCallback(
    async (item: QueueItem) => {
      setVotingId(item.id);
      try {
        await api(`/api/jams/${room!.id}/queue/${item.id}/upvote`, { method: 'POST' });
        await loadRoom();
      } catch (err) {
        toastError(errorMessage(err, 'Could not register your vote.'));
      } finally {
        setVotingId(null);
      }
    },
    [room, loadRoom, toastError]
  );

  const handleSkip = useCallback(async () => {
    if (!room) return;
    setAdvancing(true);
    try {
      const updated = await api<Room>(`/api/jams/${room.id}/advance`, { method: 'POST' });
      setRoom(updated);
      const next = updated.queue.find((t) => t.id === updated.currentTrackId);
      if (next?.spotifyUri) await player.startPlayback(next.spotifyUri);
    } catch (err) {
      toastError(errorMessage(err, 'Could not skip to the next track.'));
    } finally {
      setAdvancing(false);
    }
  }, [room, player, toastError]);

  const handleShare = useCallback(async () => {
    if (!room) return;
    const url = `${window.location.origin}/?room=${room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      success('Room link copied to your clipboard.');
    } catch {
      toastError('Could not copy the link. Copy it from the address bar instead.');
    }
  }, [room, success, toastError]);

  const handleReaction = (emoji: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = reactionId.current++;
    setReactions((prev) => [
      ...prev,
      { id, emoji, x: rect.left + rect.width / 2 - 16, y: rect.top },
    ]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 1500);
  };

  if (!profile || loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-verweerd-mos">
          <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
          <span className="text-[12px]">Syncing the room&hellip;</span>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="panel max-w-[380px] w-full p-5 text-center">
          <Music className="w-6 h-6 text-verweerd-mos/60 mx-auto mb-3" />
          <p className="text-[12px] text-verweerd-mos leading-relaxed mb-4">
            {loadError ?? 'No active jam rooms yet.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={loadRoom}
              className="h-8 px-3 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
            >
              Try again
            </button>
            <button
              onClick={() => setScreen('radar')}
              className="h-8 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
            >
              Back to Radar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const listenerCount = sync.listeners ?? room.activeListenersCount;
  const durationMs = player.durationMs || currentTrack?.durationMs || 0;
  const progressPct = durationMs > 0 ? Math.min(100, (player.positionMs / durationMs) * 100) : 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Room toolbar */}
      <div className="h-10 flex-shrink-0 flex items-center gap-2 px-3 border-b border-verweerd-mos/20 bg-espresso">
        <button
          onClick={() => setScreen('radar')}
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Radar
        </button>
        <div className="w-px h-4 bg-verweerd-mos/20" />
        <span className="text-[12px] font-bold truncate">{room.roomTitle}</span>
        <span className="text-[11px] text-verweerd-mos truncate">
          @{room.host?.username || 'unknown'} &middot; {listenerCount} listening
          {isHost && <span className="ml-1.5 text-oud-goud font-bold">· you host</span>}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <span
            title={sync.isConnected ? 'Connected to the room' : 'Reconnecting…'}
            className={`inline-flex items-center gap-1 h-6 px-2 rounded border text-[10px] font-bold tracking-widest ${
              !sync.isConnected
                ? 'text-verweerd-mos border-verweerd-mos/40 bg-verweerd-mos/10'
                : sync.isInSync
                  ? 'text-oud-goud border-oud-goud/40 bg-oud-goud/10'
                  : 'text-terracotta border-terracotta/40 bg-terracotta/10'
            }`}
          >
            <Zap className="w-3 h-3" />
            {!sync.isConnected ? 'OFFLINE' : sync.isInSync ? 'IN SYNC' : `${sync.driftMs}MS OFF`}
          </span>
          <button
            onClick={handleShare}
            title="Copy room link"
            className="w-7 h-7 flex items-center justify-center rounded text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Spotify prompt — the reason playback controls would otherwise be dead */}
      {!spotifyLinked && (
        <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-oud-goud/25 bg-oud-goud/10">
          <AlertTriangle className="w-3.5 h-3.5 text-oud-goud flex-shrink-0" />
          <p className="text-[11px] text-krijt flex-1 min-w-0">
            Connect Spotify Premium to hear this room. You can still browse and vote on the queue.
          </p>
          <div className="w-[180px] flex-shrink-0">
            <SpotifyConnectButton />
          </div>
        </div>
      )}

      {/* Playback is running on another Spotify device. The Web SDK registers
          its own device and cannot see that session, so offer to adopt it. */}
      {spotifyLinked && isElsewhere && externalTrack && (
        <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-oud-goud/25 bg-oud-goud/10">
          <AlbumArt
            src={externalTrack.albumArtUrl}
            alt={externalTrack.title}
            className="w-8 h-8 rounded flex-shrink-0"
            iconSize={16}
          />
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-oud-goud">
              <Radio className="w-3 h-3" />
              Playing on {externalDevice?.name ?? 'another device'}
            </div>
            <div className="text-[12px] font-bold truncate leading-tight">
              {externalTrack.title}
              <span className="text-verweerd-mos font-medium"> — {externalTrack.artist}</span>
            </div>
          </div>

          <button
            onClick={handleQueueNowPlaying}
            disabled={queueingNowPlaying}
            className="h-7 px-2.5 rounded border border-verweerd-mos/35 text-[11px] font-bold text-krijt hover:bg-verweerd-mos/20 transition-colors disabled:opacity-50 inline-flex items-center gap-1 flex-shrink-0"
          >
            {queueingNowPlaying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <PlusIcon className="w-3 h-3" />
            )}
            Add to queue
          </button>
          <button
            onClick={handlePlayHere}
            disabled={transferring || !player.isReady}
            title={
              player.isReady
                ? 'Move playback into this browser so the room can sync it'
                : 'The Crate player is still starting up'
            }
            className="h-7 px-2.5 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center gap-1 flex-shrink-0"
          >
            {transferring && <Loader2 className="w-3 h-3 animate-spin" />}
            Play here
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Stage */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 app-scroll p-5">
            <div className="flex gap-6 items-start">
              <div className="relative flex-shrink-0">
                <div className="absolute -inset-3 bg-oud-goud/10 blur-2xl rounded-full" />
                <div className="w-[220px] h-[220px] bg-espresso-3 rounded-lg shadow-xl relative z-10 overflow-hidden border border-verweerd-mos/25">
                  <AlbumArt
                    src={player.currentTrack?.albumArt ?? currentTrack?.albumArtUrl}
                    alt={currentTrack?.title || 'No track'}
                    className="w-full h-full"
                    iconSize={72}
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0 pt-1">
                <div className="section-title mb-2">Now playing</div>
                <h2 className="text-[26px] font-black tracking-tight leading-tight truncate">
                  {player.currentTrack?.name || currentTrack?.title || 'No track playing'}
                </h2>
                <p className="text-[14px] text-verweerd-mos font-medium mb-5 truncate">
                  {player.currentTrack?.artist || currentTrack?.artist || 'Add a track to start'}
                </p>

                <div className="w-full h-1 bg-verweerd-mos/20 rounded-full relative mb-1.5">
                  <div
                    className="absolute h-full bg-oud-goud rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-verweerd-mos mb-5 tracking-widest">
                  <span>{formatTime(player.positionMs)}</span>
                  <span>{formatTime(durationMs)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => player.seekTo(0)}
                    disabled={!player.isReady}
                    title="Restart track"
                    className="w-8 h-8 flex items-center justify-center rounded border border-verweerd-mos/25 text-verweerd-mos hover:text-krijt hover:border-verweerd-mos/50 transition-colors disabled:opacity-40"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handlePlayPause}
                    disabled={!player.isReady || !currentTrack?.spotifyUri}
                    title={
                      !spotifyLinked
                        ? 'Connect Spotify to play'
                        : !currentTrack?.spotifyUri
                          ? 'Add a track to the queue first'
                          : player.isPaused
                            ? 'Play'
                            : 'Pause'
                    }
                    className="w-10 h-10 bg-krijt rounded-full flex items-center justify-center text-espresso hover:brightness-95 transition-all disabled:opacity-40"
                  >
                    {player.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : player.isPaused ? (
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    ) : (
                      <div className="flex gap-1">
                        <div className="w-1 h-3.5 bg-espresso" />
                        <div className="w-1 h-3.5 bg-espresso" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={handleSkip}
                    disabled={!isHost || advancing || upNext.length === 0}
                    title={isHost ? 'Skip to next track' : 'Only the host can skip'}
                    className="w-8 h-8 flex items-center justify-center rounded border border-verweerd-mos/25 text-verweerd-mos hover:text-krijt hover:border-verweerd-mos/50 transition-colors disabled:opacity-40"
                  >
                    {advancing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <SkipForward className="w-4 h-4" />
                    )}
                  </button>

                  {!isHost && (
                    <button
                      onClick={() => {
                        const u = sync.lastHostUpdate;
                        if (!u) return;
                        player.seekTo(u.positionMs + (Date.now() - u.hostTimestamp));
                      }}
                      disabled={!sync.lastHostUpdate || !player.isReady}
                      className="ml-2 h-8 px-4 bg-terracotta rounded text-[11px] font-black tracking-widest hover:brightness-110 transition-all disabled:opacity-40"
                    >
                      RESYNC
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-0.5 border border-verweerd-mos/25 rounded px-1 h-8">
                    {REACTIONS.map(({ key, Icon }) => (
                      <button
                        key={key}
                        onClick={(e) => handleReaction(key, e)}
                        title={key}
                        className="w-7 h-7 flex items-center justify-center rounded text-verweerd-mos hover:text-oud-goud hover:bg-verweerd-mos/10 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Queue rail */}
        <aside className="w-[300px] flex-shrink-0 border-l border-verweerd-mos/20 bg-espresso flex flex-col min-h-0">
          <header className="h-9 flex-shrink-0 flex items-center justify-between px-3 border-b border-verweerd-mos/20">
            <span className="section-title">Up next &middot; {upNext.length}</span>
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-oud-goud hover:text-krijt transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add track
            </button>
          </header>

          <div className="flex-1 min-h-0 app-scroll p-1.5">
            {upNext.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-verweerd-mos/10 transition-colors group"
              >
                <span className="w-4 text-center text-[10px] font-bold text-verweerd-mos/70 flex-shrink-0">
                  {idx + 1}
                </span>
                <AlbumArt
                  src={item.albumArtUrl}
                  alt={item.title}
                  className="w-8 h-8 rounded flex-shrink-0"
                  iconSize={16}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold truncate leading-tight">{item.title}</div>
                  <div className="text-[10px] text-verweerd-mos truncate leading-tight">
                    {item.artist}
                  </div>
                </div>
                <button
                  onClick={() => handleUpvote(item)}
                  disabled={votingId === item.id}
                  title="Upvote this track"
                  className={`flex items-center gap-0.5 px-1.5 h-6 rounded text-[10px] font-black flex-shrink-0 transition-colors disabled:opacity-50 ${
                    idx === 0
                      ? 'text-oud-goud hover:bg-oud-goud/15'
                      : 'text-verweerd-mos hover:text-oud-goud hover:bg-verweerd-mos/15'
                  }`}
                >
                  {votingId === item.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ChevronUp className="w-3 h-3" strokeWidth={3} />
                  )}
                  {item.upvotesCount}
                </button>
              </div>
            ))}

            {upNext.length === 0 && (
              <div className="text-center p-6 text-verweerd-mos text-[12px]">
                <div className="flex flex-col items-center gap-2">
                  <Music className="w-5 h-5 text-verweerd-mos/60" />
                  <span>Queue is empty. Add the first track.</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Floating reactions */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => {
            const Icon = REACTIONS.find((x) => x.key === r.emoji)?.Icon ?? Heart;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 1, x: r.x, y: r.y, scale: 0.5 }}
                animate={{
                  opacity: 0,
                  x: r.x + (Math.random() * 60 - 30),
                  y: r.y - 150 - Math.random() * 100,
                  scale: 2,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute text-oud-goud drop-shadow-2xl"
              >
                <Icon className="w-6 h-6" />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {showSearch && (
        <QueueSearchModal
          roomId={room.id}
          jamRoomTitle={room.roomTitle}
          onClose={() => setShowSearch(false)}
          onQueued={loadRoom}
        />
      )}
    </div>
  );
}
