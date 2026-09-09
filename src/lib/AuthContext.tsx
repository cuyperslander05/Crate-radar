import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, AuthError } from 'firebase/auth';
import { auth } from './firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  /** Firebase auth session loading */
  authLoading: boolean;
  /** Backend profile (DB) loading */
  profileLoading: boolean;
  loading: boolean;
  authError: string | null;
  /** Set when the backend profile could not be loaded, so the UI can offer a retry. */
  profileError: string | null;
  signIn: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** Re-reads the backend profile, e.g. after an edit. */
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  authLoading: true,
  profileLoading: true,
  loading: true,
  authError: null,
  profileError: null,
  signIn: async () => {},
  completeOnboarding: async () => {},
  refreshProfile: async () => {},
  clearAuthError: () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const isBrowserMobileOrTablet = () =>
  typeof window !== 'undefined' &&
  /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);

export function getAuthErrorMessage(error: AuthError | unknown): string {
  const code = (error as AuthError)?.code || (error as any)?.message || 'unknown';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'The Google sign-in window was closed before you finished. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'The sign-in was cancelled. Please try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. Add it to Firebase Console > Authentication > Authorized domains.';
    case 'auth/operation-not-supported-in-this-environment':
      return 'Popup sign-in is not supported here. Redirecting to sign you in securely...';
    case 'auth/network-request-failed':
      return 'Network error while signing in. Check your connection and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/popup-blocked-by-browser':
      return 'Popups are blocked. Please allow them for this site.';
    default:
      return `Sign-in failed (${code}). Please try again.`;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Fetch (or sync + fetch) the backend user profile for an authenticated user.
  const loadProfile = useCallback(async (currentUser: User) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const token = await currentUser.getIdToken();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // Upsert from Firebase metadata, then read the stored row back. The sync
      // response already carries the profile, so it is used directly rather
      // than issuing a second request for the same data.
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: currentUser.email?.split('@')[0] || `user_${currentUser.uid.slice(0, 5)}`,
          displayName: currentUser.displayName || 'New User',
          avatarUrl: currentUser.photoURL || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Could not load your profile (${res.status}).`);
      }

      setProfile((await res.json()) as UserProfile);
    } catch (error) {
      // Distinguished from "loaded but not onboarded": without this the guard
      // would silently drop the user back into the onboarding wizard.
      console.error('Error loading backend user profile:', error);
      setProfile(null);
      setProfileError(
        error instanceof Error ? error.message : 'Could not load your profile.'
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadProfile(currentUser);
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });

    // Resolve any pending redirect sign-in result on mount.
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        console.log('Redirect sign-in resolved for', result.user.email);
        loadProfile(result.user);
      }
    }).catch((err) => {
      console.warn('Redirect result error:', getAuthErrorMessage(err));
      setAuthError(getAuthErrorMessage(err));
    });

    return unsubscribe;
  }, [loadProfile]);

  const signIn = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider(); // default: openid, email, profile

    try {
      console.log('Attempting Google sign-in via popup...');
      const result = await signInWithPopup(auth, provider);
      console.log('Popup sign-in succeeded for', result.user.email);
      // onAuthStateChanged fires and loadProfile runs; also eagerly load here.
      await loadProfile(result.user);
    } catch (err: any) {
      const code = err?.code || '';
      console.error('Firebase Auth Error Code:', err?.code);
      console.error('Firebase Auth Error Message:', err?.message);
      console.error('Current authDomain in use:', (auth as any).config?.authDomain);

      const shouldRedirect =
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-blocked-by-browser' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/unauthorized-domain' ||
        isBrowserMobileOrTablet();

      if (shouldRedirect) {
        console.warn('Popup unavailable; falling back to redirect:', code || 'mobile');
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          console.error('Redirect fallback also failed:', redirectErr);
          setAuthError(getAuthErrorMessage(redirectErr));
          throw redirectErr;
        }
      }

      console.error('Google sign-in failed:', getAuthErrorMessage(err));
      setAuthError(getAuthErrorMessage(err));
      throw err;
    }
  };

  /**
   * Persists "onboarding completed" to the backend and updates local state.
   * The route guard keys off profile.hasCompletedOnboarding === true.
   */
  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const dbUser = await res.json() as UserProfile;
        setProfile(dbUser);
      } else {
        console.error('Failed to complete onboarding:', res.status);
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  const clearAuthError = () => setAuthError(null);

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, authLoading, profileLoading, loading: authLoading || profileLoading, authError, profileError, signIn, completeOnboarding, refreshProfile, clearAuthError, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};