'use client';
import React from 'react';
import { StateProvider } from '@/components/state-provider';
import { NewGameConfirmProvider } from '@/components/dialogs/NewGameConfirm';

export default function StateRoot({ children }: { children: React.ReactNode }) {
  const onWarn = React.useCallback((code: string, info?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[state warn]', code, info);
    }
  }, []);
  return (
    <StateProvider onWarn={onWarn}>
      <NewGameConfirmProvider>{children}</NewGameConfirmProvider>
    </StateProvider>
  );
}
