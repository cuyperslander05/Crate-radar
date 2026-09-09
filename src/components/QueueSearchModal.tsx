import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Search, X, Zap, Loader2, Check, Music } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useSpotifyLink } from '../hooks/useSpotifyLink';
import { AlbumArt } from './common/AlbumArt';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';

interface SearchHit {
  spotifyUri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
}

interface Props {
  onClose: () => void;
  roomId: number;
  jamRoomTitle?: string;
  /** Called after a track is queued so the room can refresh. */
  onQueued?: () => void;
}

const formatDuration = (ms: number) => {
  if (!ms || ms < 0) return '';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};

export function QueueSearchModal({ onClose, roomId, jamRoomTitle, onQueued }: Props) {
  const { success, error: toastError } = useToast();
  const { linked, loading: spotifyLoading } = useSpotifyLink();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addingUri, setAddingUri] = useState<string | null>(null);
  const [queuedUris, setQueuedUris] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced search against the Spotify catalogue (proxied by our server).
  useEffect(() => {
    const q = query.trim();
    if (!q || !linked) {
      setResults([]);
      setSearched(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await api<SearchHit[]>(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) setResults(hits);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          // A missing Spotify link is already explained by the panel below.
          if (!(err instanceof ApiError && err.needsSpotify)) {
            toastError(errorMessage(err, 'Search failed. Please try again.'));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, linked, toastError]);

  const addToQueue = useCallback(
    async (hit: SearchHit) => {
      setAddingUri(hit.spotifyUri);
      try {
        await api(`/api/jams/${roomId}/queue`, {
          method: 'POST',
          json: {
            title: hit.title,
            artist: hit.artist,
            spotifyUri: hit.spotifyUri,
            albumArtUrl: hit.albumArtUrl,
            durationMs: hit.durationMs,
          },
        });
        setQueuedUris((prev) => new Set(prev).add(hit.spotifyUri));
        success(`Added "${hit.title}" to the queue.`);
        onQueued?.();
      } catch (err) {
        toastError(errorMessage(err, 'Could not add that track.'));
      } finally {
        setAddingUri(null);
      }
    },
    [roomId, success, toastError, onQueued]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.12 }}
        role="dialog"
        aria-modal="true"
        aria-label="Add to jam queue"
        className="w-full max-w-[640px] h-[70vh] max-h-[560px] bg-espresso border border-verweerd-mos/25 rounded-lg shadow-2xl relative z-10 flex flex-col overflow-hidden"
      >
        <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-verweerd-mos/20 bg-espresso-3">
          <span className="text-[12px] font-bold">Add to jam queue</span>
          <span className="text-[11px] text-verweerd-mos truncate">
            {jamRoomTitle || 'Current room'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto w-6 h-6 flex items-center justify-center rounded text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/15 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 border-b border-verweerd-mos/15">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-verweerd-mos" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!linked && !spotifyLoading}
              placeholder="Search Spotify for a song or artist…"
              className="w-full h-8 bg-espresso-3 border border-verweerd-mos/25 rounded pl-8 pr-8 text-[12px] text-krijt placeholder:text-verweerd-mos/70 focus:outline-none focus:border-oud-goud/60 transition-colors disabled:opacity-50"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-verweerd-mos hover:text-krijt"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 app-scroll p-1.5">
          {spotifyLoading ? (
            <div className="flex items-center justify-center gap-2 text-verweerd-mos text-[12px] p-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking Spotify&hellip;
            </div>
          ) : !linked ? (
            <div className="p-6 text-center">
              <Music className="w-6 h-6 text-verweerd-mos/60 mx-auto mb-3" />
              <p className="text-[12px] text-verweerd-mos leading-relaxed mb-4 max-w-[36ch] mx-auto">
                Connect your Spotify account to search the catalogue and add tracks to the queue.
              </p>
              <div className="max-w-[240px] mx-auto">
                <SpotifyConnectButton />
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 text-verweerd-mos text-[12px] p-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching Spotify&hellip;
            </div>
          ) : results.length > 0 ? (
            results.map((hit) => {
              const isQueued = queuedUris.has(hit.spotifyUri);
              const isAdding = addingUri === hit.spotifyUri;
              return (
                <div
                  key={hit.spotifyUri}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-verweerd-mos/10 transition-colors group"
                >
                  <AlbumArt
                    src={hit.albumArtUrl}
                    alt={hit.title}
                    className="w-9 h-9 rounded flex-shrink-0"
                    iconSize={18}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold truncate leading-tight">{hit.title}</div>
                    <div className="text-[11px] text-verweerd-mos truncate leading-tight">
                      {hit.artist}
                    </div>
                  </div>
                  <span className="text-[10px] text-verweerd-mos/70 flex-shrink-0 tabular-nums">
                    {formatDuration(hit.durationMs)}
                  </span>
                  <button
                    onClick={() => addToQueue(hit)}
                    disabled={isAdding || isQueued}
                    className={`text-[10px] font-bold px-2.5 h-6 rounded inline-flex items-center gap-1 transition-all flex-shrink-0 ${
                      isQueued
                        ? 'bg-oud-goud/20 text-oud-goud'
                        : 'bg-terracotta text-krijt hover:brightness-110 opacity-0 group-hover:opacity-100 focus:opacity-100'
                    } disabled:cursor-default`}
                  >
                    {isAdding ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isQueued ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    {isQueued ? 'Queued' : 'Queue'}
                  </button>
                </div>
              );
            })
          ) : searched ? (
            <div className="text-center text-verweerd-mos text-[12px] p-6">
              No tracks found. Try a different search.
            </div>
          ) : (
            <div className="text-center text-verweerd-mos text-[12px] p-6">
              Start typing to search Spotify.
            </div>
          )}
        </div>

        <div className="h-10 flex-shrink-0 px-3 flex items-center justify-between border-t border-verweerd-mos/20 bg-espresso-3">
          <span className="text-[11px] text-verweerd-mos">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={onClose}
            className="h-7 px-4 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
