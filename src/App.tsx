/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ScreenState } from './types';
import { Login } from './components/Login';
import { Onboarding } from './components/Onboarding';
import { MainLayout } from './components/MainLayout';
import { RadarScreen } from './components/Radar';
import { JamRoom } from './components/JamRoom';
import { AnalyticsScreen } from './components/Analytics';
import { ProfileScreen } from './components/Profile';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAuth } from './lib/AuthContext';
import { useToast } from './lib/ToastContext';

/** Reads ?room=<id> so a shared room link opens that room directly. */
function initialRoomId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('room');
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function App() {
  const { user, profile, authLoading, profileLoading, loading, completeOnboarding, profileError, refreshProfile, logOut } =
    useAuth();
  const { error: toastError } = useToast();

  const deepLinkedRoom = initialRoomId();
  const [currentScreen, setCurrentScreen] = useState<ScreenState>(
    deepLinkedRoom ? 'jam_room' : 'radar'
  );
  const [activeRoomId, setActiveRoomId] = useState<number | null>(deepLinkedRoom);

  const openRoom = useCallback((roomId: number) => {
    setActiveRoomId(roomId);
    setCurrentScreen('jam_room');
  }, []);

  // Selecting "Jam Room" from the sidebar means "my current room", so the
  // pinned room id is cleared and JamRoom falls back to /api/jams/current.
  const setScreen = useCallback((screen: ScreenState) => {
    if (screen === 'jam_room') setActiveRoomId(null);
    setCurrentScreen(screen);
  }, []);

  // CRITICAL: never evaluate route guards while auth/profile are still loading,
  // otherwise we redirect prematurely and cause an infinite loop.
  if (loading || authLoading || profileLoading) {
    return (
      <div className="h-screen bg-espresso-2 flex flex-col items-center justify-center gap-3 text-krijt">
        <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
        <span className="text-sm text-verweerd-mos">Loading Crate...</span>
      </div>
    );
  }

  // Rule 1: not authenticated -> Login.
  if (!user) return <Login onLogin={() => {}} />;

  // Rule 2: signed in but the profile could not be fetched. Without this the
  // onboarding guard below would treat a failed request as "not onboarded".
  if (profileError) {
    return (
      <div className="h-screen bg-espresso-2 flex items-center justify-center p-8 text-krijt">
        <div className="panel max-w-[400px] w-full p-5 text-center">
          <AlertTriangle className="w-5 h-5 text-terracotta mx-auto mb-3" />
          <h1 className="text-[14px] font-black tracking-tight mb-2">Could not load your profile</h1>
          <p className="text-[12px] text-verweerd-mos leading-relaxed mb-4">{profileError}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => refreshProfile()}
              className="h-8 px-3 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
            >
              Try again
            </button>
            <button
              onClick={() => logOut()}
              className="h-8 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Source of truth for onboarding status lives in the backend profile.
  if (profile?.hasCompletedOnboarding !== true) {
    return (
      <Onboarding
        onComplete={async () => {
          try {
            await completeOnboarding();
          } catch {
            toastError('Could not finish setup. Please try again.');
          }
        }}
      />
    );
  }

  // Rule 3: authenticated and onboarded -> the app shell. Each screen gets its
  // own boundary so one crashing view does not take down the navigation.
  return (
    <MainLayout currentScreen={currentScreen} setScreen={setScreen}>
      <ErrorBoundary key={currentScreen}>
        {currentScreen === 'radar' && <RadarScreen openRoom={openRoom} />}
        {currentScreen === 'jam_room' && <JamRoom setScreen={setScreen} roomId={activeRoomId} />}
        {currentScreen === 'analytics' && <AnalyticsScreen />}
        {currentScreen === 'profile' && <ProfileScreen openRoom={openRoom} />}
      </ErrorBoundary>
    </MainLayout>
  );
}
