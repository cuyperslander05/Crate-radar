import { Radio, Volume2 } from 'lucide-react';
import { useNowPlaying } from '../../lib/NowPlayingContext';
import { formatTime } from '../../lib/playback';
import { AlbumArt } from './AlbumArt';

/**
 * Persistent playback strip in the app shell.
 *
 * Shows whatever the user's Spotify account is playing on any device, and keeps
 * ticking for as long as the app is open — the sync is not tied to being inside
 * a jam room.
 */
export function NowPlayingBar() {
  const { track, device, isPlaying, positionMs, durationMs, isElsewhere, needsSpotify } =
    useNowPlaying();

  if (needsSpotify || !track) return null;

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <div className="h-12 flex-shrink-0 border-t border-verweerd-mos/20 bg-espresso-3 flex items-center gap-3 px-3 relative">
      {/* Progress hairline across the full width of the bar */}
      <div className="absolute top-0 left-0 right-0 h-px bg-verweerd-mos/15">
        <div
          className="h-full bg-oud-goud transition-[width] duration-500 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <AlbumArt
        src={track.albumArtUrl}
        alt={track.title}
        className="w-8 h-8 rounded flex-shrink-0"
        iconSize={16}
      />

      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold truncate leading-tight">{track.title}</div>
        <div className="text-[10px] text-verweerd-mos truncate leading-tight">{track.artist}</div>
      </div>

      <div className="text-[10px] font-bold text-verweerd-mos tabular-nums flex-shrink-0">
        {formatTime(positionMs)} / {formatTime(durationMs)}
      </div>

      <div
        title={device ? `Playing on ${device.name}` : undefined}
        className={`hidden sm:inline-flex items-center gap-1 h-6 px-2 rounded border text-[10px] font-bold tracking-wider flex-shrink-0 max-w-[180px] ${
          isElsewhere
            ? 'text-oud-goud border-oud-goud/40 bg-oud-goud/10'
            : 'text-verweerd-mos border-verweerd-mos/30'
        }`}
      >
        {isElsewhere ? (
          <Radio className="w-3 h-3 flex-shrink-0" />
        ) : (
          <Volume2 className="w-3 h-3 flex-shrink-0" />
        )}
        <span className="truncate">{device?.name ?? 'Unknown device'}</span>
      </div>

      {!isPlaying && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-verweerd-mos flex-shrink-0">
          Paused
        </span>
      )}
    </div>
  );
}
