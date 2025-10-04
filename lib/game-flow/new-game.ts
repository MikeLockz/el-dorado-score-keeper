'use client';

import * as React from 'react';
import type { AppState } from '@/lib/state';
import * as clientLog from '@/lib/client-log';
import { useAppState } from '@/components/state-provider';
import { useNewGameConfirm } from '@/components/dialogs/NewGameConfirm';
import { trackGameStarted, type AnalyticsGameMode } from '@/lib/observability/events';

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
  /** Optional telemetry configuration for confirm/cancel metrics. */
  telemetry?: NewGameTelemetryConfig;
  /** Internal/testing override: force the has-progress detection result. */
  forceHasProgress?: boolean;
  /** Default analytics metadata for subsequent `startNewGame` calls. */
  analytics?: NewGameAnalyticsContext;
};

export type StartNewGameOptions = {
  /**
   * Skip the confirmation dialog even when in-progress state is detected.
   * Useful for completed sessions where the next game starts immediately.
   */
  skipConfirm?: boolean;
  /** Analytics overrides scoped to this invocation. */
  analytics?: NewGameAnalyticsContext;
};

export type StartNewGameResult = {
  startNewGame: (options?: StartNewGameOptions) => Promise<boolean>;
  pending: boolean;
};

export type NewGameTelemetryEvent = 'confirm' | 'cancel' | 'skip' | 'error';

export type NewGameTelemetryPayload = {
  dbName: string;
  requireIdle: boolean;
  skipConfirm: boolean;
  hasProgress: boolean;
  timeTraveling: boolean;
  result: 'confirmed' | 'cancelled' | 'skipped' | 'error';
  durationMs?: number;
  errorName?: string;
  errorMessage?: string;
  skipReason?: 'explicit' | 'no-progress';
};

export type NewGameTelemetryConfig = {
  /** When false, suppresses telemetry even if provided. Defaults to true when config exists. */
  enabled?: boolean;
  /** Override event names when falling back to the default tracker. */
  events?: Partial<Record<NewGameTelemetryEvent, string | null>>;
  /** Custom tracker invoked instead of `logEvent`. */
  track?: (event: NewGameTelemetryEvent, payload: NewGameTelemetryPayload) => void;
};

export type NewGameAnalyticsContext = {
  source?: string;
  mode?: AnalyticsGameMode;
};

const DEFAULT_TELEMETRY_EVENT_NAMES: Record<NewGameTelemetryEvent, string> = {
  confirm: 'new_game_confirmed',
  cancel: 'new_game_cancelled',
  skip: 'new_game_skipped',
  error: 'new_game_error',
};

async function archiveCurrentGameAndResetLive(): Promise<void> {
  const mod = await import('@/lib/state');
  await mod.archiveCurrentGameAndReset();
}

export function hasScorecardProgress(state: AppState): boolean {
  const anyScores = Object.values(state.scores ?? {}).some(
    (score) => typeof score === 'number' && score !== 0,
  );

  const anyRoundActivity = Object.values(state.rounds ?? {}).some((round) => {
    if (!round) return false;
    const bids = Object.values(round.bids ?? {});
    const made = Object.values(round.made ?? {});
    const bidsActive = bids.some((b) => b != null && b !== 0);
    const madeActive = made.some((m) => m != null);
    const presenceChanged = Object.values(round.present ?? {}).some((p) => p === false);
    const stateActive = round.state !== 'locked' && round.state !== 'bidding';
    return stateActive || bidsActive || madeActive || presenceChanged;
  });

  return anyScores || anyRoundActivity;
}

export function hasSinglePlayerProgress(state: AppState): boolean {
  const sp = state.sp;
  const spPhase = sp?.phase;
  if (!spPhase) return false;
  if (spPhase === 'setup' || spPhase === 'game-summary' || spPhase === 'done') return false;
  const trickPlays = sp?.trickPlays ?? [];
  const hands = sp?.hands ?? {};
  const hasHands = Object.values(hands).some((cards) => (cards?.length ?? 0) > 0);
  const hasTricks = trickPlays.length > 0;
  return hasHands || hasTricks;
}

export function hasInProgressGame(state: AppState): boolean {
  return hasScorecardProgress(state) || hasSinglePlayerProgress(state);
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
    telemetry,
    forceHasProgress,
    analytics: analyticsDefaults,
  } = options;
  const app = useAppState();
  const confirmController = useNewGameConfirm();
  const { state, timeTraveling } = app;
  const [pending, setPending] = React.useState(false);
  const liveStateRef = React.useRef<AppState>(state);
  const telemetryRef = React.useRef<NewGameTelemetryConfig | undefined>(telemetry);
  const analyticsRef = React.useRef<NewGameAnalyticsContext | undefined>(analyticsDefaults);
  const appRef = React.useRef(app);
  appRef.current = app;

  React.useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  React.useEffect(() => {
    analyticsRef.current = analyticsDefaults;
  }, [analyticsDefaults]);

  React.useEffect(() => {
    if (!timeTraveling) {
      liveStateRef.current = state;
    }
  }, [state, timeTraveling]);

  const resetPending = React.useCallback(() => {
    setPending((prev) => (prev ? false : prev));
  }, []);

  const emitTelemetry = React.useCallback(
    (
      event: NewGameTelemetryEvent,
      details: Omit<NewGameTelemetryPayload, 'dbName' | 'requireIdle'>,
    ) => {
      const config = telemetryRef.current;
      if (!config) return;
      if (config.enabled === false) return;

      const payload: NewGameTelemetryPayload = {
        dbName,
        requireIdle,
        ...details,
      };

      try {
        if (config.track) {
          config.track(event, payload);
          return;
        }
        const eventName = config.events?.[event] ?? DEFAULT_TELEMETRY_EVENT_NAMES[event];
        if (!eventName) return;
        clientLog.logEvent(eventName, payload);
      } catch {}
    },
    [dbName, requireIdle],
  );

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

  const startNewGame = React.useCallback(
    async (requestOptions: StartNewGameOptions = {}) => {
      const { skipConfirm = false, analytics: analyticsOverride } = requestOptions;
      if (pending) return false;
      const latestApp = appRef.current ?? app;
      if (requireIdle && latestApp?.isBatchPending) return false;

      const effectiveState = timeTraveling ? liveStateRef.current : state;
      const hasProgress = forceHasProgress ?? hasInProgressGame(effectiveState);
      const needsConfirmation = !skipConfirm && hasProgress;
      let skipReason: NewGameTelemetryPayload['skipReason'] | null = null;
      const analyticsContext: NewGameAnalyticsContext = {
        ...(analyticsRef.current ?? {}),
        ...(analyticsOverride ?? {}),
      };

      if (needsConfirmation) {
        const handler: ConfirmHandler =
          confirm ??
          (confirmController
            ? () =>
                confirmController.show({
                  copy: {
                    description: confirmMessage,
                  },
                })
            : () => defaultConfirm(confirmMessage));
        let allowed = false;
        try {
          allowed = await Promise.resolve(
            handler({ reason: 'in-progress', state: effectiveState }),
          );
        } catch (error) {
          onError?.(error);
          const details: Omit<NewGameTelemetryPayload, 'dbName' | 'requireIdle'> = {
            skipConfirm,
            hasProgress,
            timeTraveling,
            result: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
          };
          if (error instanceof Error && error.name) {
            details.errorName = error.name;
          }
          emitTelemetry('error', details);
          return false;
        }
        if (!allowed) {
          onCancelled?.();
          emitTelemetry('cancel', {
            skipConfirm,
            hasProgress,
            timeTraveling,
            result: 'cancelled',
          });
          return false;
        }
      } else {
        skipReason = skipConfirm && hasProgress ? 'explicit' : 'no-progress';
      }

      try {
        setPending(true);
        await onBeforeStart?.();
        const mark = () => {
          if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
          }
          return Date.now();
        };
        const startedAt = mark();
        await archiveCurrentGameAndResetLive();
        const finishedAt = mark();
        const durationMs = Math.max(0, finishedAt - startedAt);

        const resolvedMode: AnalyticsGameMode =
          analyticsContext.mode ??
          (hasSinglePlayerProgress(effectiveState) ? 'single-player' : 'scorecard');
        const playerCount = Object.keys(effectiveState.players ?? {}).length;
        const source = analyticsContext.source ?? 'unknown';

        trackGameStarted({
          mode: resolvedMode,
          playerCount,
          source,
          hasExistingProgress: hasProgress,
        });

        if (skipReason) {
          emitTelemetry('skip', {
            skipConfirm,
            hasProgress,
            timeTraveling,
            result: 'skipped',
            durationMs,
            skipReason,
          });
        } else {
          emitTelemetry('confirm', {
            skipConfirm,
            hasProgress,
            timeTraveling,
            result: 'confirmed',
            durationMs,
          });
        }
        onSuccess?.();
        return true;
      } catch (error) {
        onError?.(error);
        const details: Omit<NewGameTelemetryPayload, 'dbName' | 'requireIdle'> = {
          skipConfirm,
          hasProgress,
          timeTraveling,
          result: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        if (skipReason) {
          details.skipReason = skipReason;
        }
        if (error instanceof Error && error.name) {
          details.errorName = error.name;
        }
        emitTelemetry('error', details);
        return false;
      } finally {
        setPending(false);
      }
    },
    [
      confirm,
      confirmMessage,
      onBeforeStart,
      onCancelled,
      onError,
      onSuccess,
      pending,
      forceHasProgress,
      requireIdle,
      state,
      timeTraveling,
      app,
      confirmController,
      emitTelemetry,
    ],
  );

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const globalTarget = globalThis as typeof globalThis & {
      __START_NEW_GAME__?: ((options?: StartNewGameOptions) => Promise<boolean>) | undefined;
    };
    const delegate = (options?: StartNewGameOptions) => startNewGame(options);
    try {
      globalTarget.__START_NEW_GAME__ = delegate;
    } catch {}
    return () => {
      if (globalTarget.__START_NEW_GAME__ === delegate) {
        try {
          delete globalTarget.__START_NEW_GAME__;
        } catch {
          globalTarget.__START_NEW_GAME__ = undefined;
        }
      }
    };
  }, [startNewGame]);

  return { startNewGame, pending };
}
