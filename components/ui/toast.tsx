'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import styles from './toast.module.scss';
import { uuid } from '@/lib/utils';

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
    <div className={styles.viewport}>
      <ul className={styles.list} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <li key={toast.id} className={styles.item}>
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
    <div className={styles.toastCard} data-variant={variant} role="alert">
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className={styles.dismissButton}
        aria-label="Dismiss notification"
      >
        <X aria-hidden="true" />
      </button>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
    </div>
  );
}
