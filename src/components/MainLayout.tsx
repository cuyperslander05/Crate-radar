import React from 'react';
import { Radio, ListMusic, BarChart2, User as UserIcon, Settings } from 'lucide-react';
import { ScreenState } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Avatar } from './common/Avatar';
import { NowPlayingBar } from './common/NowPlayingBar';

interface MainLayoutProps {
  currentScreen: ScreenState;
  setScreen: (screen: ScreenState) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: ScreenState; icon: typeof Radio; label: string; hint: string }[] = [
  { id: 'radar', icon: Radio, label: 'Radar', hint: 'Live rooms & friends' },
  { id: 'jam_room', icon: ListMusic, label: 'Jam Room', hint: 'Current session' },
  { id: 'analytics', icon: BarChart2, label: 'Analytics', hint: 'Your sound profile' },
  { id: 'profile', icon: UserIcon, label: 'Profile', hint: 'Account & activity' },
];

/**
 * Desktop application shell: persistent left sidebar + title bar, with a single
 * scrollable content pane. The window itself never scrolls.
 */
export function MainLayout({ currentScreen, setScreen, children }: MainLayoutProps) {
  const { profile } = useAuth();
  const active = NAV_ITEMS.find((i) => i.id === currentScreen);

  return (
    <div className="h-screen w-screen flex bg-espresso-2 text-krijt overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[212px] flex-shrink-0 flex flex-col border-r border-verweerd-mos/20 bg-espresso-3">
        <div className="h-12 flex items-center gap-2 px-4 border-b border-verweerd-mos/20">
          <Radio className="w-4 h-4 text-oud-goud" />
          <span className="text-[13px] font-black tracking-tight">RADAR</span>
          <span className="ml-auto text-[9px] font-bold text-verweerd-mos tracking-widest">v1.0</span>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          <div className="section-title px-2 py-2">Workspace</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                title={item.hint}
                className={`w-full flex items-center gap-2.5 px-2.5 h-8 rounded text-[12px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-oud-goud/15 text-oud-goud border-l-2 border-oud-goud pl-2'
                    : 'text-verweerd-mos hover:bg-verweerd-mos/10 hover:text-krijt border-l-2 border-transparent pl-2'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Account strip */}
        <div className="border-t border-verweerd-mos/20 p-2">
          <button
            onClick={() => setScreen('profile')}
            className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-verweerd-mos/10 transition-colors text-left"
          >
            <Avatar src={profile?.avatarUrl} name={profile?.displayName} size="sm" className="w-7 h-7 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold truncate leading-tight">{profile?.displayName || 'Signed in'}</div>
              <div className="text-[10px] text-verweerd-mos truncate leading-tight">@{profile?.username || '—'}</div>
            </div>
            <Settings className="w-3.5 h-3.5 text-verweerd-mos flex-shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Title bar */}
        <header className="h-12 flex-shrink-0 flex items-center gap-3 px-4 border-b border-verweerd-mos/20 bg-espresso">
          <h1 className="text-[13px] font-bold tracking-tight">{active?.label}</h1>
          <span className="text-[11px] text-verweerd-mos truncate">{active?.hint}</span>

          {/* Track search lives inside a jam room, where there is a queue to add
              to; a global search box here had nothing to search. */}
        </header>

        {/* Content pane */}
        <main className="flex-1 min-h-0 app-scroll">{children}</main>

        {/* Always-on playback strip: stays in sync while the app is open,
            whichever Spotify device the music is playing on. */}
        <NowPlayingBar />
      </div>
    </div>
  );
}
