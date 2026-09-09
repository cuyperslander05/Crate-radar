import { api } from './api.ts';

const SPOTIFY_API = 'https://api.spotify.com/v1/me/player';

/** Fetches a fresh, valid Spotify access token from our backend handler. */
export async function getSpotifyAccessToken(): Promise<string> {
  const { accessToken } = await api<{ accessToken: string }>('/api/spotify/token');
  return accessToken;
}

/**
 * A Spotify playback failure, carrying the HTTP status so callers can handle
 * specific cases — notably 404, which means Spotify does not currently regard
 * this device as active and the call should be retried after claiming it.
 */
export class PlaybackError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlaybackError';
    this.status = status;
  }
}

/** Turns a Spotify Web API failure into a message worth showing the user. */
function playbackError(status: number): PlaybackError {
  if (status === 403) {
    return new PlaybackError(status, 'Spotify Premium is required to play music in Crate.');
  }
  if (status === 404) {
    return new PlaybackError(status, 'Reconnecting to your Spotify player…');
  }
  if (status === 429) {
    return new PlaybackError(status, 'Spotify is rate limiting this session. Try again shortly.');
  }
  return new PlaybackError(status, `Playback request failed (${status}).`);
}

/**
 * Starts playback of a track (or a list of track URIs) on the given active
 * Web SDK device. Pass the device_id acquired from the player "ready" event.
 */
export async function playTrack(trackUri: string, deviceId: string): Promise<void> {
  if (!trackUri || !deviceId) return;
  const accessToken = await getSpotifyAccessToken();
  const res = await fetch(`${SPOTIFY_API}/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [trackUri] }),
  });
  if (!res.ok && res.status !== 204) throw playbackError(res.status);
}

/**
 * Pauses playback on the given device.
 */
export async function pauseTrack(deviceId: string): Promise<void> {
  if (!deviceId) return;
  const accessToken = await getSpotifyAccessToken();
  const res = await fetch(`${SPOTIFY_API}/pause?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) throw playbackError(res.status);
}

/**
 * Resumes playback on the given device.
 */
export async function resumeTrack(deviceId: string): Promise<void> {
  if (!deviceId) return;
  const accessToken = await getSpotifyAccessToken();
  const res = await fetch(`${SPOTIFY_API}/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) throw playbackError(res.status);
}

/**
 * Moves the account's active playback onto this browser's Web SDK device.
 *
 * Music started in the Spotify desktop or phone app plays on that device, and
 * the Web SDK only reports what happens on its own. Transferring is what lets
 * Crate see and sync the session.
 */
export async function transferPlayback(deviceId: string, play = true): Promise<void> {
  if (!deviceId) return;
  const accessToken = await getSpotifyAccessToken();
  const res = await fetch(SPOTIFY_API, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
  if (!res.ok && res.status !== 204) throw playbackError(res.status);
}
