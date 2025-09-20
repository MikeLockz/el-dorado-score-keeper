'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog() {
  const context = React.useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
  }
  return context.confirm;
}

type DialogState = {
  options: ConfirmDialogOptions | null;
};

function ConfirmDialogContent({
  open,
  options,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  options: ConfirmDialogOptions | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmLabel = options?.confirmLabel ?? 'Confirm';
  const cancelLabel = options?.cancelLabel ?? 'Cancel';
  const variant = options?.variant === 'destructive' ? 'destructive' : 'default';

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description ? (
            <DialogDescription className="text-left sm:text-left whitespace-pre-line">
              {options.description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState>({ options: null });
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);
  const closingRef = React.useRef(false);

  const settle = React.useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setState({ options: null });
    if (resolver) resolver(result);
  }, []);

  const handleCancel = React.useCallback(() => {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    settle(false);
  }, [settle]);

  const handleConfirm = React.useCallback(() => {
    closingRef.current = true;
    settle(true);
  }, [settle]);

  const confirm = React.useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      closingRef.current = false;
      setState({ options });
    });
  }, []);

  const contextValue = React.useMemo<ConfirmDialogContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <ConfirmDialogContent
        open={state.options != null}
        options={state.options}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </ConfirmDialogContext.Provider>
  );
}
