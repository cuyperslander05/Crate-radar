import { useEffect, useState, useCallback } from 'react';
import { Loader2, BarChart3, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { api, errorMessage } from '../lib/api';
import { AlbumArt } from './common/AlbumArt';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';
import { useSpotifyLink } from '../hooks/useSpotifyLink';

interface TopTrack {
  id: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  plays: number;
  hot: boolean;
}

interface Vibe {
  energy: number;
  valence: number;
  danceability: number;
  sampleSize: number;
}

interface TopArtist {
  artist: string;
  plays: number;
}

interface Analytics {
  topTracks: TopTrack[];
  topArtists: TopArtist[];
  topArtist: string | null;
  totals: {
    plays: number;
    uniqueTracks: number;
    uniqueArtists: number;
    listeningMinutes: number;
    rooms: number;
    queued: number;
  };
  vibe: Vibe | null;
}

const RANGES = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'ALL' },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <div className="w-full h-28 bg-verweerd-mos/10 rounded flex items-end overflow-hidden">
        <div
          className={`w-full ${color} transition-[height] duration-500`}
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-verweerd-mos">
        {label} <span className="text-krijt">{pct}%</span>
      </span>
    </div>
  );
}

export function AnalyticsScreen() {
  const { profile } = useAuth();
  const { linked: spotifyLinked } = useSpotifyLink();

  const [data, setData] = useState<Analytics | null>(null);
  const [range, setRange] = useState<RangeId>('7d');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await api<Analytics>(`/api/analytics?range=${range}`));
    } catch (err) {
      setData(null);
      setLoadError(errorMessage(err, 'Could not load your analytics.'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  const vibe = data?.vibe ?? null;
  const topTracks = data?.topTracks ?? [];
  const pct = (v: number) => Math.round(v * 100);

  const totals = data?.totals;
  const listenedLabel =
    totals && totals.listeningMinutes >= 60
      ? `${Math.floor(totals.listeningMinutes / 60)}h ${totals.listeningMinutes % 60}m`
      : `${totals?.listeningMinutes ?? 0}m`;

  return (
    <div className="p-4 space-y-4">
      {/* Listening totals, recorded whenever the app is open — no jam required. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Tracks played', value: totals?.plays ?? 0 },
          { label: 'Listening time', value: listenedLabel },
          { label: 'Unique tracks', value: totals?.uniqueTracks ?? 0 },
          { label: 'Artists', value: totals?.uniqueArtists ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="panel px-3 py-2.5">
            <div className="text-[18px] font-black leading-none tracking-tight">{stat.value}</div>
            <div className="section-title mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      {/* Sound profile */}
      <section className="panel">
        <header className="h-9 flex items-center justify-between px-3 border-b border-verweerd-mos/20">
          <span className="section-title">Sound profile</span>
          <div className="flex gap-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`h-6 px-2 rounded text-[10px] font-black tracking-widest transition-colors ${
                  range === r.id
                    ? 'bg-oud-goud text-espresso'
                    : 'text-verweerd-mos hover:bg-verweerd-mos/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        <div className="p-3">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <h2 className="text-[15px] font-bold truncate">
              {data?.topArtist ?? 'No data yet'}
            </h2>
            {data?.topArtist && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-oud-goud border border-oud-goud/30 bg-oud-goud/10 rounded px-2 py-0.5 flex-shrink-0">
                Top artist
              </span>
            )}
          </div>

          {vibe ? (
            <>
              <div className="flex gap-2 mb-3">
                <MetricBar label="Energy" pct={pct(vibe.energy)} color="bg-verweerd-mos" />
                <MetricBar label="Valence" pct={pct(vibe.valence)} color="bg-oud-goud" />
                <MetricBar label="Dance" pct={pct(vibe.danceability)} color="bg-terracotta" />
              </div>
              <p className="text-verweerd-mos text-[11px]">
                Averaged from Spotify audio features across {vibe.sampleSize} track
                {vibe.sampleSize === 1 ? '' : 's'} you queued.
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-3 opacity-40">
                <MetricBar label="Energy" pct={0} color="bg-verweerd-mos" />
                <MetricBar label="Valence" pct={0} color="bg-oud-goud" />
                <MetricBar label="Dance" pct={0} color="bg-terracotta" />
              </div>
              {!spotifyLinked ? (
                <div className="space-y-2.5">
                  <p className="text-verweerd-mos text-[11px] leading-relaxed">
                    Connect Spotify to analyse the tracks you queue and unlock your sound profile.
                  </p>
                  <SpotifyConnectButton variant="subtle" />
                </div>
              ) : (
                <p className="text-verweerd-mos text-[11px] leading-relaxed">
                    Play something on Spotify with Crate open — your sound profile appears once
                  there is enough listening to measure.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Top tracks */}
      <section className="panel min-w-0">
        <header className="h-9 flex items-center justify-between px-3 border-b border-verweerd-mos/20">
          <span className="section-title">Most played</span>
          <span className="text-[11px] text-verweerd-mos">
            {totals?.rooms ?? 0} room{totals?.rooms === 1 ? '' : 's'} hosted &middot;{' '}
            {totals?.queued ?? 0} queued
          </span>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-verweerd-mos text-[12px] p-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-terracotta" />
            <span>Crunching your data&hellip;</span>
          </div>
        ) : loadError ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-5 h-5 text-terracotta mx-auto mb-2" />
            <p className="text-[12px] text-verweerd-mos mb-3">{loadError}</p>
            <button
              onClick={load}
              className="h-7 px-3 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
            >
              Try again
            </button>
          </div>
        ) : topTracks.length > 0 ? (
          <div>
            <div className="grid grid-cols-[28px_36px_minmax(0,1fr)_minmax(0,160px)_60px] items-center gap-2 px-3 h-7 border-b border-verweerd-mos/15 section-title">
              <span>#</span>
              <span />
              <span>Track</span>
              <span>Artist</span>
              <span className="text-right">Plays</span>
            </div>
            {topTracks.map((track) => (
              <div
                key={track.id}
                className="grid grid-cols-[28px_36px_minmax(0,1fr)_minmax(0,160px)_60px] items-center gap-2 px-3 h-11 border-b border-verweerd-mos/10 last:border-0 hover:bg-verweerd-mos/8 transition-colors"
              >
                <span className="text-[11px] font-bold text-verweerd-mos">{track.id}</span>
                <AlbumArt
                  src={track.albumArtUrl}
                  alt={track.title}
                  className="w-8 h-8 rounded"
                  iconSize={14}
                />
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-[12px] font-bold truncate">{track.title}</span>
                  {track.hot && (
                    <span className="text-[9px] font-black tracking-widest uppercase text-oud-goud border border-oud-goud/30 bg-oud-goud/10 rounded px-1.5 py-0.5 flex-shrink-0">
                      Hot
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-verweerd-mos truncate">{track.artist}</span>
                <span className="text-[11px] font-bold text-right tabular-nums">{track.plays}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-verweerd-mos text-[12px] p-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <BarChart3 className="w-6 h-6 text-verweerd-mos/60" />
              <span>
                {range === 'all'
                  ? 'Nothing tracked yet. Play something on Spotify with Crate open.'
                  : 'Nothing in this period. Try a wider range.'}
              </span>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
