import * as React from 'react';
import { archiveCurrentGameAndReset } from '@/lib/state';
import type { AppState } from '@/lib/state';
import { useAppState } from '@/components/state-provider';

const DEFAULT_CONFIRM_MESSAGE =
  'You have an in-progress game. Starting a new one will archive current progress and reset scores.';

export type ConfirmHandler = (context: {
  reason: 'in-progress';
  state: AppState;
}) => boolean | Promise<boolean>;

export type UseNewGameRequestOptions = {
  /**
   * Optional database name if the consumer operates on a non-default store.
   * Defaults to the application DB (`app-db`).
   */
  dbName?: string;
  /**
   * Custom confirmation handler. If omitted, falls back to `window.confirm` where available.
   */
  confirm?: ConfirmHandler;
  /**
   * Custom confirmation copy when using the default confirmation handler.
   */
  confirmMessage?: string;
  /**
   * When set, blocks the reset while the app is processing a batch.
   */
  requireIdle?: boolean;
  /** Invoked immediately before the archive/reset runs. */
  onBeforeStart?: () => void | Promise<void>;
  /** Invoked after a successful archive/reset. */
  onSuccess?: () => void;
  /** Invoked when the confirmation dialog is skipped or rejected. */
  onCancelled?: () => void;
  /** Invoked when the archive/reset rejects. */
  onError?: (error: unknown) => void;
};

export type StartNewGameResult = {
  startNewGame: () => Promise<boolean>;
  pending: boolean;
};

export function hasInProgressGame(state: AppState): boolean {
  const anyScores = Object.values(state.scores ?? {}).some(
    (score) => typeof score === 'number' && score !== 0,
  );

  const anyRoundActivity = Object.values(state.rounds ?? {}).some((round) => {
    if (!round) return false;
    if (round.state === 'locked') return false;
    const bids = Object.values(round.bids ?? {});
    const made = Object.values(round.made ?? {});
    const bidsActive = bids.some((b) => b != null && b !== 0);
    const madeActive = made.some((m) => m != null);
    return bidsActive || madeActive;
  });

  const sp = state.sp;
  const spPhase = sp?.phase;
  const spActive = Boolean(
    spPhase &&
      spPhase !== 'setup' &&
      spPhase !== 'game-summary' &&
      spPhase !== 'done' &&
      ((sp?.trickPlays?.length ?? 0) > 0 || Object.keys(sp?.hands ?? {}).length > 0),
  );

  return anyScores || anyRoundActivity || spActive;
}

function defaultConfirm(message: string): Promise<boolean> {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    try {
      return Promise.resolve(window.confirm(message));
    } catch {}
  }
  return Promise.resolve(true);
}

export function useNewGameRequest(options: UseNewGameRequestOptions = {}): StartNewGameResult {
  const {
    confirm,
    confirmMessage = DEFAULT_CONFIRM_MESSAGE,
    dbName = 'app-db',
    requireIdle = false,
    onBeforeStart,
    onSuccess,
    onCancelled,
    onError,
  } = options;
  const app = useAppState();
  const { state, timeTraveling, isBatchPending } = app;
  const [pending, setPending] = React.useState(false);
  const liveStateRef = React.useRef<AppState>(state);

  React.useEffect(() => {
    if (!timeTraveling) {
      liveStateRef.current = state;
    }
  }, [state, timeTraveling]);

  const resetPending = React.useCallback(() => {
    setPending((prev) => (prev ? false : prev));
  }, []);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === `app-events:signal:${dbName}` && event.newValue === 'reset') {
        resetPending();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    let bc: BroadcastChannel | null = null;
    const handleMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === 'reset') {
        resetPending();
      }
    };
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('app-events');
        if (typeof bc.addEventListener === 'function') {
          bc.addEventListener('message', handleMessage);
        } else {
          bc.onmessage = handleMessage;
        }
      }
    } catch {
      bc = null;
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
      if (bc) {
        try {
          if (typeof bc.removeEventListener === 'function') {
            bc.removeEventListener('message', handleMessage);
          }
        } catch {}
        try {
          bc.close();
        } catch {}
      }
    };
  }, [dbName, resetPending]);

  const startNewGame = React.useCallback(async () => {
    if (pending) return false;
    if (requireIdle && isBatchPending) return false;

    const effectiveState = timeTraveling ? liveStateRef.current : state;
    const needsConfirmation = hasInProgressGame(effectiveState);

    if (needsConfirmation) {
      const handler = confirm ?? (() => defaultConfirm(confirmMessage));
      let allowed = false;
      try {
        allowed = await Promise.resolve(handler({ reason: 'in-progress', state: effectiveState }));
      } catch (error) {
        onError?.(error);
        return false;
      }
      if (!allowed) {
        onCancelled?.();
        return false;
      }
    }

    try {
      setPending(true);
      await onBeforeStart?.();
      await archiveCurrentGameAndReset();
      onSuccess?.();
      return true;
    } catch (error) {
      onError?.(error);
      return false;
    } finally {
      setPending(false);
    }
  }, [
    isBatchPending,
    confirm,
    confirmMessage,
    onBeforeStart,
    onCancelled,
    onError,
    onSuccess,
    pending,
    requireIdle,
    state,
    timeTraveling,
  ]);

  return { startNewGame, pending };
}
