import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  error: () => {},
  success: () => {},
  dismiss: () => {},
});

export const useToast = () => useContext(ToastContext);

const VARIANTS: Record<ToastVariant, { icon: typeof Info; className: string }> = {
  error: { icon: AlertTriangle, className: 'border-terracotta/50 bg-terracotta/15 text-krijt' },
  success: { icon: CheckCircle2, className: 'border-oud-goud/50 bg-oud-goud/15 text-krijt' },
  info: { icon: Info, className: 'border-verweerd-mos/40 bg-espresso-3 text-krijt' },
};

const AUTO_DISMISS_MS = 6000;

/**
 * App-wide notification surface. Before this, every failed request in Radar,
 * Analytics, Profile and JamRoom was swallowed by a console.error, so a user
 * saw an empty screen with no explanation.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId.current++;
      setToasts((current) => {
        // Collapse an identical message that is already on screen rather than
        // stacking duplicates from a retry loop.
        if (current.some((t) => t.message === message && t.variant === variant)) return current;
        return [...current, { id, variant, message }];
      });
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      error: (message: string) => toast(message, 'error'),
      success: (message: string) => toast(message, 'success'),
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[320px] pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, className } = VARIANTS[t.variant];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                role={t.variant === 'error' ? 'alert' : 'status'}
                className={`pointer-events-auto flex items-start gap-2 rounded border p-2.5 shadow-xl backdrop-blur-sm ${className}`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed flex-1 min-w-0">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="flex-shrink-0 text-verweerd-mos hover:text-krijt transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
