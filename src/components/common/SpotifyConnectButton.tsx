import { Check, Loader2, Music } from 'lucide-react';
import { useSpotifyLink } from '../../hooks/useSpotifyLink';

interface Props {
  /** "solid" for a primary call to action, "subtle" inside a settings row. */
  variant?: 'solid' | 'subtle';
  className?: string;
  /** Show a disconnect action once the account is linked. */
  allowDisconnect?: boolean;
}

/**
 * The single entry point for linking a Spotify account. Rendered on the sign-in
 * screen, in onboarding step 2, and on the profile page.
 */
export function SpotifyConnectButton({
  variant = 'solid',
  className = '',
  allowDisconnect = false,
}: Props) {
  const { linked, configured, loading, connecting, connect, disconnect } = useSpotifyLink();

  const base =
    'w-full h-9 rounded text-[12px] font-bold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50';
  const skin =
    variant === 'solid'
      ? 'bg-[#1DB954] text-black hover:brightness-110'
      : 'bg-verweerd-mos/15 border border-verweerd-mos/35 text-krijt hover:bg-verweerd-mos/25';

  if (loading) {
    return (
      <div className={`${base} ${skin} ${className} opacity-60`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Checking Spotify&hellip;
      </div>
    );
  }

  if (!configured) {
    return (
      <p className={`text-[11px] text-verweerd-mos leading-relaxed ${className}`}>
        Spotify is not configured on this server. Set <code>SPOTIFY_CLIENT_ID</code> and{' '}
        <code>SPOTIFY_CLIENT_SECRET</code> to enable playback.
      </p>
    );
  }

  if (linked) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="flex-1 inline-flex items-center gap-1.5 h-9 px-3 rounded border border-oud-goud/40 bg-oud-goud/10 text-[12px] font-bold text-oud-goud">
          <Check className="w-3.5 h-3.5" /> Spotify connected
        </span>
        {allowDisconnect && (
          <button
            onClick={disconnect}
            className="h-9 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <button onClick={connect} disabled={connecting} className={`${base} ${skin} ${className}`}>
      {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
      {connecting ? 'Opening Spotify…' : 'Connect Spotify'}
    </button>
  );
}
