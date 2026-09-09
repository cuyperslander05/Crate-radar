/**
 * Shared client types.
 *
 * These mirror what the API actually returns. Fields that had no backing
 * column and were therefore always undefined (vibeVector, badges, isProUser,
 * spotifyTier) have been removed — the sound profile is now served by
 * /api/analytics, computed from real Spotify audio features.
 */

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  syncRate: number | null;
  hasCompletedOnboarding: boolean;
  createdAt: string | null;
}

/** A user as seen by someone else — no email, no Spotify tokens. */
export interface PublicUser {
  id: number;
  uid: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  syncRate: number | null;
  createdAt: string | null;
}

export interface QueueItem {
  id: number;
  roomId: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyUri: string | null;
  durationMs: number | null;
  addedByUid: string;
  upvotesCount: number;
  playedAt: string | null;
  createdAt: string | null;
}

export interface JamRoom {
  id: number;
  roomTitle: string;
  hostUid: string;
  activeListenersCount: number;
  status: 'active' | 'closed';
  currentTrackId: number | null;
  createdAt: string | null;
  host?: PublicUser;
  queue: QueueItem[];
}

export type ScreenState = 'radar' | 'jam_room' | 'analytics' | 'profile';
