import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2, Play, Award, Radio, Activity, Loader2, X, AlertTriangle, Music2, LogOut,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { Avatar } from './common/Avatar';
import { AlbumArt } from './common/AlbumArt';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';

interface ProfileScreenProps {
  openRoom: (roomId: number) => void;
}

interface Jam {
  id: number;
  roomTitle: string;
  activeListenersCount: number;
  status: string;
  queue: { id: number; title: string; artist: string; albumArtUrl: string | null }[];
}

const TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'history', label: 'History' },
  { id: 'past', label: 'Past jams' },
  { id: 'settings', label: 'Settings' },
] as const;

interface HistoryEntry {
  id: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  deviceName: string | null;
  playedAt: string;
}

/** Human-friendly relative time for a play. */
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type TabId = (typeof TABS)[number]['id'];

/** Dialog for editing the fields a user actually owns. */
function EditProfileDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: { displayName: string; username: string; bio: string };
  onClose: () => void;
  onSave: (values: { displayName: string; username: string; bio: string }) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.12 }}
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        className="w-full max-w-[420px] bg-espresso border border-verweerd-mos/25 rounded-lg shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="h-9 flex items-center gap-2 px-3 border-b border-verweerd-mos/20 bg-espresso-3">
          <span className="text-[12px] font-bold">Edit profile</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto w-6 h-6 flex items-center justify-center rounded text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/15 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label htmlFor="displayName" className="section-title block mb-1.5">
              Display name
            </label>
            <input
              id="displayName"
              maxLength={80}
              {...field('displayName')}
              className="w-full h-8 bg-espresso-3 border border-verweerd-mos/25 rounded px-2.5 text-[12px] text-krijt focus:outline-none focus:border-oud-goud/60 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="username" className="section-title block mb-1.5">
              Username
            </label>
            <input
              id="username"
              maxLength={40}
              {...field('username')}
              className="w-full h-8 bg-espresso-3 border border-verweerd-mos/25 rounded px-2.5 text-[12px] text-krijt focus:outline-none focus:border-oud-goud/60 transition-colors"
            />
            <p className="text-[10px] text-verweerd-mos mt-1">
              Letters, numbers, underscores and dots. Must be unique.
            </p>
          </div>

          <div>
            <label htmlFor="bio" className="section-title block mb-1.5">
              Bio
            </label>
            <textarea
              id="bio"
              rows={3}
              maxLength={300}
              {...field('bio')}
              className="w-full bg-espresso-3 border border-verweerd-mos/25 rounded p-2.5 text-[12px] text-krijt resize-none focus:outline-none focus:border-oud-goud/60 transition-colors"
            />
          </div>
        </div>

        <div className="h-11 px-3 flex items-center justify-end gap-2 border-t border-verweerd-mos/20 bg-espresso-3">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-7 px-4 bg-terracotta rounded text-[11px] font-bold inline-flex items-center gap-1.5 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

export function ProfileScreen({ openRoom }: ProfileScreenProps) {
  const { profile, refreshProfile, logOut } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>('feed');
  const [myJams, setMyJams] = useState<Jam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setMyJams(await api<Jam[]>('/api/jams/me'));
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load your jams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  // Listening history is recorded app-wide, so it exists even with no jams.
  useEffect(() => {
    if (!profile || activeTab !== 'history' || history) return;
    setHistoryLoading(true);
    api<HistoryEntry[]>('/api/history?limit=50')
      .then(setHistory)
      .catch((err) => toastError(errorMessage(err, 'Could not load your listening history.')))
      .finally(() => setHistoryLoading(false));
  }, [profile, activeTab, history, toastError]);

  const saveProfile = useCallback(
    async (values: { displayName: string; username: string; bio: string }) => {
      try {
        await api('/api/users/me', { method: 'PATCH', json: values });
        await refreshProfile();
        setShowEdit(false);
        success('Profile updated.');
      } catch (err) {
        toastError(errorMessage(err, 'Could not save your profile.'));
      }
    },
    [refreshProfile, success, toastError]
  );

  const shareProfile = useCallback(async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?user=${profile.username}`);
      success('Profile link copied to your clipboard.');
    } catch {
      toastError('Could not copy the link.');
    }
  }, [profile, success, toastError]);

  if (!profile) return null;

  const activeJams = myJams.filter((j) => j.status === 'active');
  const pastJams = myJams.filter((j) => j.status !== 'active');
  const shownJams = activeTab === 'past' ? pastJams : activeJams;

  return (
    <div className="p-4 space-y-4">
      {/* Identity bar */}
      <section className="panel p-4 flex items-center gap-4 flex-wrap">
        <div className="relative flex-shrink-0">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="md"
            className="w-16 h-16 border-2 border-oud-goud"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-black tracking-tight truncate">
              {profile.displayName}
            </h1>
            <span className="text-[11px] font-bold uppercase tracking-widest text-verweerd-mos">
              @{profile.username}
            </span>
          </div>
          <p className="text-[12px] text-krijt/80 mt-1 max-w-[60ch]">{profile.bio}</p>
        </div>

        <div className="flex items-center gap-5 px-5 border-l border-verweerd-mos/20 flex-shrink-0">
          {[
            { icon: Radio, label: 'Jams hosted', value: myJams.length },
            { icon: Activity, label: 'Sync rate', value: `${profile.syncRate ?? 0}%` },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-[18px] font-black tracking-tight leading-none">{s.value}</div>
              <div className="section-title mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowEdit(true)}
            className="h-8 px-3 bg-terracotta rounded text-[11px] font-black tracking-widest uppercase hover:brightness-110 transition-all"
          >
            Edit profile
          </button>
          <button
            onClick={shareProfile}
            title="Copy profile link"
            className="w-8 h-8 flex items-center justify-center rounded text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Activity */}
      <section className="panel">
        <header className="h-9 flex items-center gap-1 px-2 border-b border-verweerd-mos/20">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-7 px-3 rounded text-[11px] font-black tracking-widest uppercase transition-colors ${
                activeTab === tab.id
                  ? 'bg-verweerd-mos/15 text-oud-goud'
                  : 'text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </header>

        {activeTab === 'history' ? (
          historyLoading ? (
            <div className="flex items-center gap-2 text-verweerd-mos text-[12px] p-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-terracotta" />
              <span>Loading your history&hellip;</span>
            </div>
          ) : history && history.length > 0 ? (
            <div className="p-1.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-verweerd-mos/10 transition-colors"
                >
                  <AlbumArt
                    src={entry.albumArtUrl}
                    alt={entry.title}
                    className="w-9 h-9 rounded flex-shrink-0"
                    iconSize={18}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold truncate leading-tight">{entry.title}</div>
                    <div className="text-[11px] text-verweerd-mos truncate leading-tight">
                      {entry.artist}
                    </div>
                  </div>
                  {entry.deviceName && (
                    <span className="hidden sm:inline text-[10px] text-verweerd-mos/70 truncate max-w-[140px] flex-shrink-0">
                      {entry.deviceName}
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-verweerd-mos tabular-nums flex-shrink-0 w-[64px] text-right">
                    {timeAgo(entry.playedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-verweerd-mos text-[12px] text-center p-8">
              <div className="flex flex-col items-center gap-2">
                <Music2 className="w-6 h-6 text-verweerd-mos/60" />
                <span>Nothing yet. Play something on Spotify while Crate is open.</span>
              </div>
            </div>
          )
        ) : activeTab === 'settings' ? (
          <div className="p-4 max-w-[420px] space-y-4">
            <div>
              <div className="section-title mb-2 flex items-center gap-1.5">
                <Music2 className="w-3 h-3" /> Music source
              </div>
              <SpotifyConnectButton variant="subtle" allowDisconnect />
              <p className="text-[11px] text-verweerd-mos mt-2 leading-relaxed">
                Spotify Premium is required for in-app playback. Your tokens are encrypted at rest
                and can be revoked here at any time.
              </p>
            </div>

            <div className="pt-3 border-t border-verweerd-mos/20">
              <button
                onClick={logOut}
                className="h-8 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-verweerd-mos text-[12px] p-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-terracotta" />
            <span>Loading your jams&hellip;</span>
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
        ) : shownJams.length > 0 ? (
          <div className="p-3">
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {shownJams.map((jam) => (
                <article
                  key={jam.id}
                  className="border border-verweerd-mos/20 rounded bg-verweerd-mos/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-bold truncate">{jam.roomTitle}</h4>
                      <p className="text-[10px] text-verweerd-mos uppercase tracking-widest font-bold mt-0.5">
                        Hosted &middot; {jam.activeListenersCount} listener
                        {jam.activeListenersCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {jam.status === 'active' && (
                      <button
                        onClick={() => openRoom(jam.id)}
                        className="text-oud-goud font-bold text-[11px] hover:text-krijt transition-colors flex-shrink-0"
                      >
                        View &rarr;
                      </button>
                    )}
                  </div>

                  {jam.queue.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 p-2 rounded bg-espresso-3/60 border border-verweerd-mos/20 mb-2">
                        <AlbumArt
                          src={jam.queue[0].albumArtUrl}
                          alt={jam.queue[0].title}
                          className="w-9 h-9 rounded flex-shrink-0"
                          iconSize={18}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold truncate">{jam.queue[0].title}</div>
                          <div className="text-[10px] text-verweerd-mos truncate">
                            {jam.queue[0].artist}
                          </div>
                        </div>
                        <button
                          onClick={() => openRoom(jam.id)}
                          title="Open this room"
                          className="w-7 h-7 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0 hover:brightness-110 transition-all"
                        >
                          <Play className="w-3 h-3 ml-0.5" fill="currentColor" />
                        </button>
                      </div>

                      <div className="flex gap-1">
                        {jam.queue.slice(0, 6).map((item) => (
                          <AlbumArt
                            key={item.id}
                            src={item.albumArtUrl}
                            alt={item.title}
                            className="w-8 h-8 rounded flex-shrink-0"
                            iconSize={14}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-verweerd-mos text-[11px] text-center border border-dashed border-verweerd-mos/25 rounded p-3">
                      Empty queue
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-verweerd-mos text-[12px] text-center p-8">
            <div className="flex flex-col items-center gap-2">
              <Award className="w-6 h-6 text-verweerd-mos/60" />
              <span>
                {activeTab === 'past'
                  ? 'No past jams yet.'
                  : "You haven't hosted any jams yet."}
              </span>
            </div>
          </div>
        )}
      </section>

      {showEdit && (
        <EditProfileDialog
          initial={{
            displayName: profile.displayName ?? '',
            username: profile.username ?? '',
            bio: profile.bio ?? '',
          }}
          onClose={() => setShowEdit(false)}
          onSave={saveProfile}
        />
      )}
    </div>
  );
}
