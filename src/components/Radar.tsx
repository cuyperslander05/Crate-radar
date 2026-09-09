import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Users, Radio, Activity, Plus, AlertTriangle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { AlbumArt } from './common/AlbumArt';
import { Avatar } from './common/Avatar';

interface RadarScreenProps {
  /** Opens a specific room; the caller handles the screen change. */
  openRoom: (roomId: number) => void;
}

interface Jam {
  id: number;
  roomTitle: string;
  activeListenersCount: number;
  host?: { username: string | null; displayName: string | null };
  queue: { albumArtUrl: string | null; title: string }[];
}

interface Friend {
  uid: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="panel flex items-center gap-3 px-3 py-2.5">
      <div className="w-8 h-8 rounded bg-verweerd-mos/15 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-oud-goud" />
      </div>
      <div className="min-w-0">
        <div className="text-[18px] font-black leading-none tracking-tight">{value}</div>
        <div className="section-title mt-1">{label}</div>
      </div>
    </div>
  );
}

/** Modal for naming a new jam room. */
function NewRoomDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(title.trim());
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        aria-label="Start a new jam room"
        className="w-full max-w-[400px] bg-espresso border border-verweerd-mos/25 rounded-lg shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="h-9 flex items-center gap-2 px-3 border-b border-verweerd-mos/20 bg-espresso-3">
          <span className="text-[12px] font-bold">Start a jam room</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto w-6 h-6 flex items-center justify-center rounded text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/15 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4">
          <label htmlFor="room-title" className="section-title block mb-2">
            Room name
          </label>
          <input
            id="room-title"
            autoFocus
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday night indie"
            className="w-full h-8 bg-espresso-3 border border-verweerd-mos/25 rounded px-2.5 text-[12px] text-krijt placeholder:text-verweerd-mos/70 focus:outline-none focus:border-oud-goud/60 transition-colors"
          />
          <p className="text-[11px] text-verweerd-mos mt-2">
            You will host this room and control playback.
          </p>
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
            disabled={!title.trim() || creating}
            className="h-7 px-4 bg-terracotta rounded text-[11px] font-bold inline-flex items-center gap-1.5 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {creating && <Loader2 className="w-3 h-3 animate-spin" />}
            {creating ? 'Creating…' : 'Create room'}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

export function RadarScreen({ openRoom }: RadarScreenProps) {
  const { profile } = useAuth();
  const { error: toastError, success } = useToast();

  const [jams, setJams] = useState<Jam[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Friends are secondary: a failure there should not blank the rooms list.
      const [jamList, friendList] = await Promise.all([
        api<Jam[]>('/api/jams'),
        api<Friend[]>('/api/users').catch(() => [] as Friend[]),
      ]);
      setJams(jamList);
      setFriends(friendList);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load live rooms.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  const createRoom = useCallback(
    async (roomTitle: string) => {
      try {
        const room = await api<{ id: number }>('/api/jams', {
          method: 'POST',
          json: { roomTitle },
        });
        setShowNewRoom(false);
        success(`"${roomTitle}" is live.`);
        openRoom(room.id);
      } catch (err) {
        toastError(errorMessage(err, 'Could not create the room.'));
      }
    },
    [openRoom, success, toastError]
  );

  const totalListeners = jams.reduce((sum, j) => sum + (j.activeListenersCount || 0), 0);

  if (!profile) return null;

  return (
    <div className="p-4 grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat icon={Radio} label="Live rooms" value={jams.length} />
          <Stat icon={Users} label="Listeners" value={totalListeners} />
          <Stat icon={Activity} label="Sync rate" value={`${profile.syncRate ?? 0}%`} />
          <Stat icon={Users} label="On radar" value={friends.length} />
        </div>

        <section className="panel">
          <header className="flex items-center justify-between px-3 h-9 border-b border-verweerd-mos/20">
            <span className="section-title">Live jam rooms</span>
            <button
              onClick={() => setShowNewRoom(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-oud-goud hover:text-krijt transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New room
            </button>
          </header>

          <div className="p-3">
            {loading ? (
              <div className="flex items-center gap-2 text-verweerd-mos text-[12px] py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-terracotta" />
                <span>Scanning live rooms&hellip;</span>
              </div>
            ) : loadError ? (
              <div className="py-6 text-center">
                <AlertTriangle className="w-5 h-5 text-terracotta mx-auto mb-2" />
                <p className="text-[12px] text-verweerd-mos mb-3">{loadError}</p>
                <button
                  onClick={load}
                  className="h-7 px-3 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
                >
                  Try again
                </button>
              </div>
            ) : jams.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-verweerd-mos text-[12px] mb-3">
                  No active jam rooms on your radar.
                </p>
                <button
                  onClick={() => setShowNewRoom(true)}
                  className="h-7 px-3 bg-terracotta rounded text-[11px] font-bold hover:brightness-110 transition-all"
                >
                  Start the first one
                </button>
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                {jams.map((jam) => (
                  <button
                    key={jam.id}
                    onClick={() => openRoom(jam.id)}
                    className="group text-left flex gap-2.5 p-2 rounded border border-verweerd-mos/20 bg-verweerd-mos/5 hover:bg-verweerd-mos/12 hover:border-oud-goud/40 transition-colors"
                  >
                    <AlbumArt
                      src={jam.queue?.[0]?.albumArtUrl}
                      alt={jam.queue?.[0]?.title || jam.roomTitle}
                      className="w-11 h-11 rounded flex-shrink-0"
                      iconSize={20}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-terracotta flex-shrink-0" />
                        <h3 className="font-bold text-[12px] truncate">{jam.roomTitle}</h3>
                      </div>
                      <p className="text-[11px] text-verweerd-mos truncate mt-0.5">
                        @{jam.host?.username || 'unknown'} &middot; {jam.activeListenersCount}{' '}
                        listening
                      </p>
                    </div>
                    <span className="self-center text-[10px] font-black uppercase tracking-widest text-verweerd-mos group-hover:text-oud-goud transition-colors">
                      Join
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <header className="flex items-center justify-between px-3 h-9 border-b border-verweerd-mos/20">
            <span className="section-title">Group vibe</span>
            <span className="text-[11px] font-bold text-oud-goud">
              {totalListeners > 0 ? `${totalListeners} listening` : 'idle'}
            </span>
          </header>
          <div className="p-3 flex items-center gap-4">
            <div className="flex gap-1 items-end h-12 w-40 flex-shrink-0" aria-hidden="true">
              {[20, 18, 15, 12, 10].map((factor, i) => (
                <div
                  key={i}
                  className={
                    i === 1 ? 'flex-1 bg-terracotta rounded-sm'
                    : i === 3 ? 'flex-1 bg-verweerd-mos rounded-sm'
                    : 'flex-1 bg-oud-goud rounded-sm'
                  }
                  style={{
                    height: `${Math.min(90, Math.max(10, (totalListeners + i) * factor))}%`,
                  }}
                />
              ))}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold leading-tight truncate">
                {jams.length > 0 ? jams[0].roomTitle : 'No live rooms on your radar yet'}
              </div>
              <div className="text-[11px] text-verweerd-mos mt-1">
                Aggregated energy across {jams.length} room{jams.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* People on the radar */}
      <aside className="panel xl:sticky xl:top-0">
        <header className="flex items-center justify-between px-3 h-9 border-b border-verweerd-mos/20">
          <span className="section-title">On the radar</span>
          <span className="text-[11px] text-verweerd-mos">{friends.length}</span>
        </header>

        <div className="p-1.5 max-h-[calc(100vh-9.5rem)] app-scroll">
          {friends.map((friend) => (
            <div
              key={friend.uid}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-verweerd-mos/10 transition-colors"
            >
              <Avatar
                src={friend.avatarUrl}
                name={friend.displayName || friend.username}
                className="w-7 h-7 flex-shrink-0"
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold truncate leading-tight">
                  @{friend.username || 'unknown'}
                </div>
                <div className="text-[10px] text-verweerd-mos truncate leading-tight">
                  {friend.displayName || 'Crate listener'}
                </div>
              </div>
            </div>
          ))}
          {friends.length === 0 && (
            <div className="text-verweerd-mos text-[12px] p-4 text-center">
              No one else on your radar yet.
            </div>
          )}
        </div>
      </aside>

      {showNewRoom && (
        <NewRoomDialog onClose={() => setShowNewRoom(false)} onCreate={createRoom} />
      )}
    </div>
  );
}
