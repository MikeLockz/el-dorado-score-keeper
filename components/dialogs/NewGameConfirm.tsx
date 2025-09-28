'use client';

import * as React from 'react';
import clsx from 'clsx';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import styles from './new-game-confirm.module.scss';

export type NewGameConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

const DEFAULT_COPY: NewGameConfirmCopy = {
  title: 'Start a new game?',
  description:
    'You have an in-progress game. Starting a new game will archive the current session and reset scores.',
  confirmLabel: 'Archive & start new',
  cancelLabel: 'Continue current game',
};

export type NewGameConfirmRequest = {
  copy?: Partial<NewGameConfirmCopy>;
};

type NewGameConfirmContextValue = {
  show: (options?: NewGameConfirmRequest) => Promise<boolean>;
};

const NewGameConfirmContext = React.createContext<NewGameConfirmContextValue | null>(null);

export function useNewGameConfirm() {
  return React.useContext(NewGameConfirmContext);
}

type DialogState = {
  copy: Partial<NewGameConfirmCopy> | null;
};

function NewGameConfirmDialog({
  open,
  copy,
  onCancel,
  onConfirm,
  pending,
}: {
  open: boolean;
  copy: Partial<NewGameConfirmCopy> | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const merged = React.useMemo(() => ({ ...DEFAULT_COPY, ...(copy ?? {}) }), [copy]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false} className={styles.content}>
        <DialogHeader>
          <DialogTitle>{merged.title}</DialogTitle>
          <DialogDescription className={styles.description}>
            {merged.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {merged.cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={clsx(pending && styles.confirmPending)}
            autoFocus
          >
            {pending ? 'Archiving…' : merged.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewGameConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = React.useState<DialogState | null>(null);
  const [locking, setLocking] = React.useState(false);
  const resolverRef = React.useRef<((accepted: boolean) => void) | null>(null);

  const show = React.useCallback((options?: NewGameConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialogState({ copy: options?.copy ?? null });
      setLocking(false);
    });
  }, []);

  const settle = React.useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialogState(null);
    if (resolver) {
      resolver(result);
    }
  }, []);

  const handleCancel = React.useCallback(() => {
    if (locking) return;
    settle(false);
  }, [locking, settle]);

  const handleConfirm = React.useCallback(() => {
    if (locking) return;
    setLocking(true);
    settle(true);
  }, [locking, settle]);

  const value = React.useMemo<NewGameConfirmContextValue>(
    () => ({
      show,
    }),
    [show],
  );

  return (
    <NewGameConfirmContext.Provider value={value}>
      {children}
      <NewGameConfirmDialog
        open={dialogState != null}
        copy={dialogState?.copy ?? null}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        pending={locking}
      />
    </NewGameConfirmContext.Provider>
  );
}
