import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../lib/ToastContext';

interface SpotifyStatus {
  linked: boolean;
  configured: boolean;
  expiresAt: string | null;
}

/**
 * Drives the Spotify account connection.
 *
 * GET /api/spotify/login existed but nothing in the UI ever called it, so no
 * user could link an account and playback could never work. This hook is what
 * the "Connect Spotify" buttons use.
 */
export function useSpotifyLink(enabled = true) {
  const { success, error: toastError } = useToast();
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<SpotifyStatus>('/api/spotify/status'));
    } catch (err) {
      console.error('Failed to read Spotify status:', err);
      setStatus({ linked: false, configured: false, expiresAt: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  /**
   * Reports the outcome of the OAuth redirect and strips the query parameter so
   * a page refresh does not replay the message.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('spotify');
    if (!result) return;

    const messages: Record<string, () => void> = {
      connected: () => {
        success('Spotify connected. Playback is ready.');
        refresh();
      },
      denied: () => toastError('Spotify access was declined.'),
      invalid_state: () =>
        toastError('That Spotify link request expired. Please try connecting again.'),
      error: () => toastError('Could not connect Spotify. Please try again.'),
    };
    messages[result]?.();

    params.delete('spotify');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`
    );
  }, [success, toastError, refresh]);

  /** Sends the browser to Spotify's consent screen. */
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { authUrl } = await api<{ authUrl: string }>('/api/spotify/login');
      window.location.assign(authUrl);
    } catch (err) {
      toastError(errorMessage(err, 'Could not start the Spotify connection.'));
      setConnecting(false);
    }
  }, [toastError]);

  const disconnect = useCallback(async () => {
    try {
      await api('/api/spotify/link', { method: 'DELETE' });
      setStatus((s) => (s ? { ...s, linked: false, expiresAt: null } : s));
      success('Spotify disconnected.');
    } catch (err) {
      toastError(errorMessage(err, 'Could not disconnect Spotify.'));
    }
  }, [success, toastError]);

  return {
    linked: status?.linked ?? false,
    configured: status?.configured ?? true,
    loading,
    connecting,
    connect,
    disconnect,
    refresh,
  };
}
