/**
 * Playback position helpers shared by the Web SDK player and the account-wide
 * now-playing poller.
 *
 * Neither source reports position continuously — the SDK only fires on state
 * changes, and the Web API is polled at an interval — so the displayed position
 * has to be extrapolated between reports or the timer appears frozen.
 */

export interface PositionAnchor {
  /** Position last reported by Spotify, in ms. */
  positionMs: number;
  /** Wall-clock time that report arrived. */
  at: number;
  isPaused: boolean;
}

/**
 * Projects the current position from the last report.
 *
 * While paused the position is fixed; while playing it advances with real time,
 * capped at the track duration so it cannot run past the end while waiting for
 * the next report. A backwards clock jump never rewinds the position.
 */
export function projectPosition(
  anchor: PositionAnchor,
  now: number,
  durationMs: number
): number {
  if (anchor.isPaused) return anchor.positionMs;
  const projected = anchor.positionMs + Math.max(0, now - anchor.at);
  return durationMs > 0 ? Math.min(projected, durationMs) : projected;
}

export const formatTime = (ms: number): string => {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};
