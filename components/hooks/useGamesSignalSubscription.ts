'use client';

import React from 'react';

import { subscribeToGamesSignal, type GamesSignal } from '@/lib/state/game-signals';

type UseGamesSignalSubscriptionOptions = Readonly<{
  enabled?: boolean;
}>;

/**
 * Subscribes to cross-tab game signals and forwards them to the provided handler.
 * Keeps the handler reference stable across renders to avoid resubscribing.
 */
export function useGamesSignalSubscription(
  handler: (signal: GamesSignal) => void,
  options: UseGamesSignalSubscriptionOptions = {},
): void {
  const { enabled = true } = options;
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!enabled) return;
    return subscribeToGamesSignal((signal) => {
      handlerRef.current(signal);
    });
  }, [enabled]);
}
