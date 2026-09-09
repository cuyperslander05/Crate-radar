import { useEffect, useRef, useState, useCallback } from 'react';
import { api, ApiError } from '../lib/api.ts';
import {
  playTrack,
  pauseTrack,
  resumeTrack,
  transferPlayback,
  PlaybackError,
} from '../lib/spotifyControls.ts';
import { projectPosition, type PositionAnchor } from '../lib/playback.ts';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (options: { name: string; getOAuthToken: (cb: (token: string) => void) => void; volume?: number }) => SpotifyPlayerInstance };
  }
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (state: any) => void) => boolean;
  getCurrentState: () => Promise<any | null>;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setName: (name: string) => Promise<void>;
}

export interface SpotifyTrack {
  uri: string;
  name: string;
  artist: string;
  albumArt: string | null;
}

export interface SpotifyPlaybackState {
  deviceId: string | null;
  isReady: boolean;
  isActive: boolean;
  currentTrack: SpotifyTrack | null;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
  isLoading: boolean;
}

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
let sdkLoaded = false;

function ensureSdkLoaded(): Promise<void> {
  return new Promise((resolve) => {
    if (sdkLoaded || (window.Spotify && window.Spotify.Player)) {
      sdkLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    document.body.appendChild(script);
  });
}

async function fetchSpotifyAccessToken(): Promise<string> {
  try {
    const { accessToken } = await api<{ accessToken: string }>('/api/spotify/token');
    return accessToken;
  } catch (err) {
    if (err instanceof ApiError && err.needsSpotify) {
      throw new Error('Connect your Spotify account to play music in Crate.');
    }
    throw err;
  }
}

export function useSpotifyPlayer(enabled: boolean) {
  const [state, setState] = useState<SpotifyPlaybackState>({
    deviceId: null,
    isReady: false,
    isActive: false,
    currentTrack: null,
    isPaused: true,
    positionMs: 0,
    durationMs: 0,
    error: null,
    isLoading: false,
  });

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  /**
   * Anchor for the progress ticker: the last position the SDK reported and the
   * wall-clock time it was reported at.
   *
   * player_state_changed only fires on state CHANGES (play, pause, seek, track
   * change) — never as the track advances — so position has to be extrapolated
   * between events or the timer sits frozen at its starting value.
   */
  const positionAnchor = useRef<PositionAnchor>({ positionMs: 0, at: Date.now(), isPaused: true });

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const initPlayer = async () => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        // Verify the account is linked before loading the SDK, so an unlinked
        // user gets a clear message instead of a silent no-op player.
        await fetchSpotifyAccessToken();
        await ensureSdkLoaded();

        if (disposed) return;

        const init = () => {
          if (!window.Spotify?.Player || disposed) return;
          const player = new window.Spotify.Player({
            name: 'Crate Web Player',
            // Called again whenever the SDK needs a fresh token, so fetch on
            // demand instead of closing over one that expires after an hour.
            getOAuthToken: (cb) => {
              fetchSpotifyAccessToken()
                .then(cb)
                .catch((err) => {
                  setState((s) => ({ ...s, error: err.message || 'Spotify session expired.' }));
                });
            },
            volume: 0.5,
          });
          playerRef.current = player;

          player.addListener('ready', ({ device_id }) => {
            deviceIdRef.current = device_id;
            setState((s) => ({ ...s, deviceId: device_id, isReady: true, isLoading: false }));
          });

          player.addListener('not_ready', () => {
            setState((s) => ({ ...s, isReady: false, isActive: false }));
          });

          // The SDK reports these separately; without surfacing them the user
          // just sees a disabled play button and no explanation.
          player.addListener('initialization_error', ({ message }: any) =>
            setState((s) => ({ ...s, error: message || 'Spotify player failed to initialise.', isLoading: false }))
          );
          player.addListener('authentication_error', () =>
            setState((s) => ({ ...s, error: 'Spotify rejected the session. Please reconnect your account.', isLoading: false }))
          );
          player.addListener('account_error', () =>
            setState((s) => ({ ...s, error: 'Spotify Premium is required to play music in Crate.', isLoading: false }))
          );
          player.addListener('playback_error', ({ message }: any) =>
            setState((s) => ({ ...s, error: message || 'Playback failed.' }))
          );

          player.addListener('player_state_changed', (playback: any) => {
            if (!playback) {
              positionAnchor.current = { positionMs: 0, at: Date.now(), isPaused: true };
              setState((s) => ({ ...s, isPaused: true, positionMs: 0, currentTrack: null }));
              return;
            }

            // Re-anchor the ticker on every reported change.
            positionAnchor.current = {
              positionMs: playback.position,
              at: Date.now(),
              isPaused: playback.paused,
            };

            const track = playback?.track_window?.current_track;
            setState((s) => ({
              ...s,
              isPaused: playback.paused,
              positionMs: playback.position,
              durationMs: track?.duration_ms || 0,
              isActive: !playback.paused,
              currentTrack: track ? {
                uri: track.uri,
                name: track.name,
                artist: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
                albumArt: track.album?.images?.[0]?.url || null,
              } : null,
            }));
          });

          player.connect().then((success) => {
            if (!success) {
              setState((s) => ({ ...s, error: 'Failed to connect. Spotify Premium is required.', isLoading: false }));
            }
          });
        };

        if (window.Spotify?.Player) {
          init();
        } else {
          window.onSpotifyWebPlaybackSDKReady = init;
        }
      } catch (err: any) {
        console.error('Failed to init Spotify player:', err);
        if (!disposed) setState((s) => ({ ...s, error: err.message || 'Failed to init Spotify player', isLoading: false }));
      }
    };

    initPlayer();

    return () => {
      disposed = true;
      window.onSpotifyWebPlaybackSDKReady = undefined;
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
    };
  }, [enabled]);

  /**
   * Advances the displayed position between SDK events.
   *
   * Runs at 500ms — fast enough that the seconds readout never visibly lags,
   * cheap enough to be irrelevant. Every few seconds it re-reads the player's
   * real state so the extrapolation cannot drift away from actual playback.
   */
  useEffect(() => {
    if (!enabled || !state.isReady) return;

    let ticks = 0;
    const interval = setInterval(() => {
      const anchor = positionAnchor.current;

      if (!anchor.isPaused) {
        const now = Date.now();
        setState((s) => {
          const next = projectPosition(anchor, now, s.durationMs);
          return next === s.positionMs ? s : { ...s, positionMs: next };
        });
      }

      // Re-anchor from the SDK roughly every 5 seconds.
      if (++ticks % 10 === 0) {
        playerRef.current
          ?.getCurrentState()
          .then((playback) => {
            if (!playback) return;
            positionAnchor.current = {
              positionMs: playback.position,
              at: Date.now(),
              isPaused: playback.paused,
            };
          })
          .catch(() => {
            // A transient read failure just means we keep extrapolating.
          });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [enabled, state.isReady]);

  const startPlayback = useCallback(async (trackUri?: string) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) {
      setState((s) => ({ ...s, error: 'Player is not ready yet.' }));
      return;
    }

    const attempt = () => (trackUri ? playTrack(trackUri, deviceId) : resumeTrack(deviceId));

    try {
      await attempt();
    } catch (err: any) {
      // Spotify answers 404 when it does not consider this device active — the
      // usual case after leaving and rejoining a room, where the SDK has
      // reconnected but the account's active device is still the old one.
      // Claiming the device and retrying once recovers it silently instead of
      // telling the user there is no active Spotify session.
      if (err instanceof PlaybackError && err.status === 404) {
        try {
          await transferPlayback(deviceId, false);
          await attempt();
          return;
        } catch (retryErr: any) {
          setState((s) => ({ ...s, error: retryErr.message || 'Playback failed.' }));
          return;
        }
      }
      setState((s) => ({
        ...s,
        error: err.message || 'Spotify Premium is required to play in Crate.',
      }));
    }
  }, []);

  const pausePlayback = useCallback(async () => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    await pauseTrack(deviceId);
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    const player = playerRef.current;
    if (!player) return;

    const target = Math.max(0, Math.round(positionMs));
    await player.seek(target);

    // Re-anchor straight away so the readout jumps immediately rather than
    // waiting for the SDK to report the seek back to us.
    positionAnchor.current = {
      ...positionAnchor.current,
      positionMs: target,
      at: Date.now(),
    };
    setState((s) => ({ ...s, positionMs: target }));
  }, []);

  return {
    ...state,
    startPlayback,
    pausePlayback,
    seekTo,
  };
}

