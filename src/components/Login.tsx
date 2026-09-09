import { useState } from 'react';
import { Radio, Loader2, AlertTriangle, ChevronRight, Zap, Headphones, BarChart2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';

interface LoginProps {
  onLogin: () => void;
}

/**
 * Desktop sign-in: a split window — product pane on the left, the actual
 * sign-in controls in a compact right-hand column.
 */
export function Login({ onLogin }: LoginProps) {
  const { user, signIn, authError, clearAuthError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [linkSpotify, setLinkSpotify] = useState(false);

  const handleGoogle = async () => {
    clearAuthError();
    setIsSigningIn(true);
    try {
      await signIn();
      onLogin();
    } catch {
      // error surfaced via authError from context
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="h-screen w-screen flex bg-espresso-2 text-krijt overflow-hidden">
      {/* Brand pane */}
      <div className="hidden md:flex flex-1 relative border-r border-verweerd-mos/20 bg-espresso-3 flex-col justify-between p-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] bg-oud-goud/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="flex items-center gap-2 relative z-10">
          <Radio className="w-4 h-4 text-oud-goud" />
          <span className="text-[13px] font-black tracking-tight">RADAR</span>
        </div>

        <div className="relative z-10 max-w-[420px]">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.1] mb-3">
            Sync music in real time with friends.
          </h1>
          <p className="text-[13px] text-verweerd-mos leading-relaxed mb-8">
            Listen together across Spotify &amp; Apple Music, vote on the room queue, and track your sound identity.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Zap, label: 'Sub-second sync' },
              { icon: Headphones, label: 'Shared queue' },
              { icon: BarChart2, label: 'Vibe analytics' },
            ].map((f) => (
              <div key={f.label} className="panel p-3">
                <f.icon className="w-4 h-4 text-oud-goud mb-2" />
                <div className="text-[11px] font-bold leading-tight">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-verweerd-mos relative z-10 tracking-widest uppercase font-bold">
          Desktop client v1.0
        </div>
      </div>

      {/* Sign-in pane */}
      <div className="w-full md:w-[400px] flex-shrink-0 flex flex-col justify-center px-8 bg-espresso">
        <div className="w-full max-w-[320px] mx-auto">
          <h2 className="text-[18px] font-black tracking-tight mb-1">Sign in</h2>
          <p className="text-[12px] text-verweerd-mos mb-6">Use your Google account to continue.</p>

          {authError && (
            <div className="flex items-start gap-2 bg-terracotta/15 border border-terracotta/40 rounded p-2.5 mb-4">
              <AlertTriangle className="w-3.5 h-3.5 text-terracotta flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">{authError}</p>
            </div>
          )}

          {linkSpotify ? (
            <div className="space-y-2.5">
              <p className="text-[12px] text-verweerd-mos leading-relaxed">
                {user
                  ? 'Link Spotify to unlock full playback & sync. Spotify Premium is required to play in Crate.'
                  : 'Sign in with Google first — Spotify is linked to your Crate account, so it needs one to attach to.'}
              </p>
              {user ? (
                <SpotifyConnectButton />
              ) : (
                <button
                  onClick={handleGoogle}
                  disabled={isSigningIn}
                  className="w-full h-9 bg-verweerd-mos/15 border border-verweerd-mos/35 rounded text-[12px] font-bold hover:bg-verweerd-mos/25 transition-colors disabled:opacity-50"
                >
                  {isSigningIn ? 'Signing in…' : 'Sign in with Google first'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleGoogle}
              disabled={isSigningIn}
              className="w-full h-9 bg-terracotta rounded text-[12px] font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSigningIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {isSigningIn ? 'Signing in…' : 'Continue with Google'}
            </button>
          )}

          <button
            onClick={() => setLinkSpotify((v) => !v)}
            className="mt-3 text-[11px] text-verweerd-mos hover:text-krijt transition-colors inline-flex items-center gap-1"
          >
            {linkSpotify ? 'Back to Google sign-in' : 'Link Spotify instead'}
            <ChevronRight className="w-3 h-3" />
          </button>

          {user && (
            <button onClick={onLogin} className="mt-5 block text-[11px] text-terracotta hover:underline">
              Signed in as {user.email} — continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
