'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { cn, uuid } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastHandle = string;

type ToastState = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
};

type ToastContextValue = {
  toast: (options: ToastOptions) => ToastHandle;
  dismiss: (id: ToastHandle) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const value = React.useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within a ToastProvider');
  return value;
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  default: 'bg-card text-card-foreground border border-border shadow-lg dark:border-border/50',
  success:
    'bg-status-complete-surface text-status-complete-foreground border border-status-complete shadow-lg',
  warning:
    'bg-status-bidding-surface text-status-bidding-foreground border border-status-bidding/70 shadow-lg',
  destructive: 'bg-destructive text-destructive-foreground border border-destructive/70 shadow-lg',
};

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = React.useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    },
    [clearTimer],
  );

  const scheduleRemoval = React.useCallback(
    (id: string, duration: number) => {
      clearTimer(id);
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, duration),
      );
    },
    [clearTimer, dismiss],
  );

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = uuid();
      const duration = options.duration ?? DEFAULT_DURATION;
      const next: ToastState = {
        id,
        title: options.title,
        variant: options.variant ?? 'default',
        duration,
        ...(options.description !== undefined ? { description: options.description } : {}),
      };
      setToasts((prev) => [...prev, next]);
      scheduleRemoval(id, duration);
      return id;
    },
    [scheduleRemoval],
  );

  React.useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastState[];
  onDismiss: (id: string) => void;
}) {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4">
      <ul className="flex w-full max-w-sm flex-col gap-3" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <li key={toast.id} className="pointer-events-auto">
            <ToastCard toast={toast} onDismiss={onDismiss} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastState; onDismiss: (id: string) => void }) {
  const { id, title, description, variant = 'default' } = toast;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border px-4 py-3 shadow-lg transition-[transform,opacity] focus-within:ring-2 focus-within:ring-ring/50 focus:outline-none',
        VARIANT_CLASS[variant] ?? VARIANT_CLASS.default,
      )}
      role="alert"
    >
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-sm text-current/70 transition hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="pr-6 text-sm">
        <p className="font-semibold">{title}</p>
        {description ? <p className="mt-1 text-[13px] text-current/80">{description}</p> : null}
      </div>
    </div>
  );
}
