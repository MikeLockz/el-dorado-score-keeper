'use client';
import React from 'react';
import { StateProvider } from '@/components/state-provider';
import { NewGameConfirmProvider } from '@/components/dialogs/NewGameConfirm';
import { PromptDialogProvider } from '@/components/dialogs/PromptDialog';
import { ConfirmDialogProvider } from '@/components/dialogs/ConfirmDialog';
import { ToastProvider } from '@/components/ui/toast';
import PersistenceWarningBridge from '@/components/persistence-warnings';
import { captureBrowserMessage } from '@/lib/observability/browser';

export default function StateRoot({ children }: { children: React.ReactNode }) {
  const onWarn = React.useCallback((code: string, info?: unknown) => {
    const detail = typeof info === 'string' ? info : undefined;
    captureBrowserMessage('state.warning', {
      level: 'warn',
      attributes: {
        code,
        detail,
      },
    });
  }, []);
  return (
    <StateProvider onWarn={onWarn}>
      <NewGameConfirmProvider>
        <ConfirmDialogProvider>
          <PromptDialogProvider>
            <ToastProvider>
              <PersistenceWarningBridge />
              {children}
            </ToastProvider>
          </PromptDialogProvider>
        </ConfirmDialogProvider>
      </NewGameConfirmProvider>
    </StateProvider>
  );
}
