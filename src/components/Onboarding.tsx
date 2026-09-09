import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Disc, Music, Check, Lock, Radio } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { SpotifyConnectButton } from './common/SpotifyConnectButton';
import { Avatar } from './common/Avatar';

interface OnboardingProps {
  onComplete: () => Promise<void> | void;
}

const STEPS = [
  { id: 1, label: 'Welcome', hint: 'What Radar does' },
  { id: 2, label: 'Music source', hint: 'Connect a service' },
  { id: 3, label: 'Account', hint: 'Finish setup' },
];

/**
 * Desktop onboarding: a fixed-size wizard window (step rail + content pane +
 * action bar) instead of a full-height mobile carousel.
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<number>(1);
  // App renders this screen only for an authenticated user, so there is no
  // sign-in to perform here — only the "onboarding complete" flag to persist.
  const { user } = useAuth();
  const [isFinishing, setIsFinishing] = useState(false);

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const finish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      // onComplete persists the flag and reports its own failures.
      await onComplete();
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-espresso-2 text-krijt p-8 overflow-hidden">
      <div className="w-full max-w-[860px] h-[500px] bg-espresso border border-verweerd-mos/25 rounded-lg shadow-2xl flex overflow-hidden">
        {/* Step rail */}
        <aside className="w-[220px] flex-shrink-0 bg-espresso-3 border-r border-verweerd-mos/20 flex flex-col">
          <div className="h-10 flex items-center gap-2 px-3 border-b border-verweerd-mos/20">
            <Radio className="w-4 h-4 text-oud-goud" />
            <span className="text-[13px] font-black tracking-tight">RADAR</span>
          </div>

          <div className="p-2 flex-1">
            <div className="section-title px-2 py-2">Setup</div>
            {STEPS.map((s) => {
              const isDone = s.id < step;
              const isActive = s.id === step;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2.5 px-2.5 h-10 rounded text-[12px] ${
                    isActive ? 'bg-oud-goud/12 text-oud-goud' : isDone ? 'text-krijt/70' : 'text-verweerd-mos'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 border ${
                      isDone
                        ? 'bg-oud-goud text-espresso border-oud-goud'
                        : isActive
                          ? 'border-oud-goud text-oud-goud'
                          : 'border-verweerd-mos/40'
                    }`}
                  >
                    {isDone ? <Check className="w-3 h-3" /> : s.id}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold leading-tight">{s.label}</div>
                    <div className="text-[10px] text-verweerd-mos leading-tight">{s.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={finish}
            disabled={isFinishing}
            className="m-2 h-7 rounded text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors disabled:opacity-50"
          >
            Skip setup
          </button>
        </aside>

        {/* Content pane */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 app-scroll p-6">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="flex gap-8 items-center h-full"
                >
                  <div className="flex-1 min-w-0">
                    <h1 className="text-[24px] font-black tracking-tight leading-tight mb-2">
                      Sync music in real time with friends.
                    </h1>
                    <p className="text-verweerd-mos text-[13px] leading-relaxed max-w-[42ch]">
                      Listen together across Spotify &amp; Apple Music, democratically vote on room queues, and unlock
                      your sound vibe analytics.
                    </p>
                  </div>

                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    className="relative flex-shrink-0"
                  >
                    <Disc className="w-40 h-40 text-oud-goud opacity-80" strokeWidth={1} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-espresso rounded-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-krijt" />
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                >
                  <h1 className="text-[18px] font-black tracking-tight mb-1">Connect your music source</h1>
                  <p className="text-verweerd-mos text-[12px] mb-4">
                    Select your primary service to start sharing live sessions.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative border border-oud-goud/40 bg-verweerd-mos/10 rounded p-4 flex flex-col">
                      <span className="absolute top-2 right-2 bg-oud-goud text-espresso text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                      <div className="w-8 h-8 bg-[#1DB954] rounded-full flex items-center justify-center mb-3">
                        <Music className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="font-bold text-[13px]">Spotify Premium</h3>
                      <p className="text-verweerd-mos text-[11px] mt-1 mb-3 flex-1">
                        Full queue control &amp; real-time sync
                      </p>
                      <SpotifyConnectButton />
                    </div>

                    <div className="border border-verweerd-mos/25 rounded p-4 flex flex-col opacity-60">
                      <div className="w-8 h-8 bg-verweerd-mos/40 rounded-full flex items-center justify-center mb-3">
                        <Music className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="font-bold text-[13px]">Apple Music / YT</h3>
                      <p className="text-verweerd-mos text-[11px] mt-1 mb-3 flex-1">
                        Basic sync &amp; history log
                      </p>
                      <span className="inline-flex items-center justify-center h-9 rounded border border-verweerd-mos/25 text-[11px] font-bold text-verweerd-mos">
                        Coming soon
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-verweerd-mos text-[11px] mt-4">
                    <Lock className="w-3 h-3" />
                    <span>We never store your passwords. Secured via OAuth 2.0.</span>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="h-full flex flex-col justify-center max-w-[420px]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar
                      src={user?.photoURL}
                      name={user?.displayName || user?.email}
                      size="md"
                      className="w-14 h-14 border-2 border-oud-goud"
                    />
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-oud-goud mb-1">
                        <Check className="w-3 h-3" /> Signed in
                      </div>
                      <div className="text-[13px] font-bold truncate">
                        {user?.displayName || 'Your account'}
                      </div>
                      <div className="text-[11px] text-verweerd-mos truncate">{user?.email}</div>
                    </div>
                  </div>

                  <h1 className="text-[18px] font-black tracking-tight mb-1">You&apos;re all set</h1>
                  <p className="text-verweerd-mos text-[12px] leading-relaxed">
                    Your account is ready. Enter Crate to find a live room, or start your own and
                    build a queue with friends.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action bar */}
          <div className="h-12 flex-shrink-0 flex items-center justify-between gap-3 px-4 border-t border-verweerd-mos/20 bg-espresso-3">
            <span className="text-[11px] text-verweerd-mos">Step {step} of {STEPS.length}</span>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="h-8 px-3 rounded border border-verweerd-mos/30 text-[11px] font-bold text-verweerd-mos hover:text-krijt hover:bg-verweerd-mos/10 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={step === 3 ? finish : nextStep}
                disabled={isFinishing}
                className="h-8 px-4 bg-terracotta rounded text-[11px] font-black tracking-widest uppercase hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isFinishing
                  ? 'Finishing…'
                  : step === 1
                    ? 'Get started'
                    : step === 2
                      ? 'Continue'
                      : 'Enter Crate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
