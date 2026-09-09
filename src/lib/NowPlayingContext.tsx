import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError } from './api';
import { useAuth } from './AuthContext';
import { projectPosition, type PositionAnchor } from './playback';

export interface NowPlayingTrack {
  spotifyUri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export interface NowPlayingDevice {
  id: string;
  name: string;
  type: string;
  /** True when the active device is this browser's own Web SDK player. */
  isCrate: boolean;
}

interface NowPlayingResponse {
  playing: boolean;
  progressMs?: number;
  device: NowPlayingDevice | null;
  track: NowPlayingTrack | null;
}

interface NowPlayingContextValue {
  track: NowPlayingTrack | null;
  device: NowPlayingDevice | null;
  isPlaying: boolean;
  /** Smoothly interpolated between polls, so the timer actually ticks. */
  positionMs: number;
  durationMs: number;
  /** Playing, but on a device other than this browser. */
  isElsewhere: boolean;
  /** The account has no Spotify link, so polling is paused. */
  needsSpotify: boolean;
  refresh: () => Promise<void>;
}

const NowPlayingContext = createContext<NowPlayingContextValue>({
  track: null,
  device: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isElsewhere: false,
  needsSpotify: false,
  refresh: async () => {},
});

export const useNowPlaying = () => useContext(NowPlayingContext);

/** Poll faster while something is playing; idle accounts change rarely. */
const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 20_000;
const TICK_MS = 500;

/**
 * Keeps the app in sync with the user's Spotify playback for as long as it is
 * open, whichever device the music is on.
 *
 * Polling lives here rather than in a screen so the sync survives navigation,
 * and the position is interpolated locally between polls so the timer advances
 * every half-second instead of jumping once per poll.
 */
export const NowPlayingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [needsSpotify, setNeedsSpotify] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  const anchor = useRef<PositionAnchor>({ positionMs: 0, at: Date.now(), isPaused: true });
  const durationRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await api<NowPlayingResponse>('/api/spotify/now-playing');
      setNeedsSpotify(false);
      setData(next);

      durationRef.current = next.track?.durationMs ?? 0;
      anchor.current = {
        positionMs: next.progressMs ?? 0,
        at: Date.now(),
        isPaused: !next.playing,
      };
      setPositionMs(anchor.current.positionMs);
    } catch (err) {
      // 428 means the account is not linked: stop polling until it is, rather
      // than hammering the endpoint and filling the console with errors.
      if (err instanceof ApiError && err.needsSpotify) {
        setNeedsSpotify(true);
        setData(null);
      }
    }
  }, []);

  // Poll for as long as the app is open and the user is signed in.
  useEffect(() => {
    if (!user || needsSpotify) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      // Re-read the interval each cycle so it adapts as playback starts/stops.
      timer = setTimeout(loop, anchor.current.isPaused ? POLL_IDLE_MS : POLL_ACTIVE_MS);
    };

    loop();

    // Refresh immediately when the tab regains focus, so coming back from the
    // Spotify app shows the right track at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, needsSpotify, refresh]);

  // Retry a missing Spotify link occasionally, so connecting the account starts
  // the sync without needing a page reload.
  useEffect(() => {
    if (!user || !needsSpotify) return;
    const retry = setInterval(() => setNeedsSpotify(false), 30_000);
    return () => clearInterval(retry);
  }, [user, needsSpotify]);

  // Local ticker: advances the readout between polls.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (anchor.current.isPaused) return;
      const next = projectPosition(anchor.current, Date.now(), durationRef.current);
      setPositionMs((prev) => (prev === next ? prev : next));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [user]);

  const value = useMemo<NowPlayingContextValue>(
    () => ({
      track: data?.track ?? null,
      device: data?.device ?? null,
      isPlaying: Boolean(data?.playing),
      positionMs,
      durationMs: data?.track?.durationMs ?? 0,
      isElsewhere: Boolean(data?.track && data.device && !data.device.isCrate),
      needsSpotify,
      refresh,
    }),
    [data, positionMs, needsSpotify, refresh]
  );

  return <NowPlayingContext.Provider value={value}>{children}</NowPlayingContext.Provider>;
};
