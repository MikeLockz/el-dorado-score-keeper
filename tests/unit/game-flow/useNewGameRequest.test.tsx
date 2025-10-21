import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';
import { cleanupDevelopmentGlobals, clearTimeoutsAndIntervals } from '../../utils/component-lifecycle';

type ConfirmHandler = (context: {
  reason: 'in-progress';
  state: AppState;
}) => boolean | Promise<boolean>;

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

type NewGameConfirmSetter = (impl: { show: (options?: any) => Promise<boolean> }) => void;
const setNewGameConfirm = (globalThis as any).__setNewGameConfirm as NewGameConfirmSetter;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;

const stateModule = await import('@/lib/state');
const archiveCurrentGameAndResetMock = vi
  .spyOn(stateModule, 'archiveCurrentGameAndReset')
  .mockResolvedValue(null);

const clientLogModule = await import('@/lib/client-log');
const logEventMock = vi.spyOn(clientLogModule, 'logEvent').mockImplementation(() => {});

const analyticsEventsModule = await import('@/lib/observability/events');
const trackGameStartedMock = vi
  .spyOn(analyticsEventsModule, 'trackGameStarted')
  .mockImplementation(() => {});

const { useNewGameRequest } = await import('@/lib/game-flow');

function cloneState(): Mutable<AppState> {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as Mutable<AppState>;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return Object.assign(promise, { resolve });
}

function createAppContext(overrides: Partial<MockAppStateHook> = {}): MockAppStateHook {
  const state = cloneState();
  const context: MockAppStateHook = {
    state,
    timeTraveling: false,
    isBatchPending: false,
    ready: true,
    height: 0,
    append: vi.fn(),
    appendMany: vi.fn(),
    previewAt: async () => context.state,
    warnings: [],
    clearWarnings: () => {},
    timeTravelHeight: null,
    setTimeTravelHeight: () => {},
    context: { mode: null, gameId: null, scorecardId: null },
    ...overrides,
  } as MockAppStateHook;
  return context;
}

describe('useNewGameRequest', () => {
  let context: MockAppStateHook;
  let newGameConfirmShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Enhanced cleanup to prevent test interference
    cleanupDevelopmentGlobals();
    clearTimeoutsAndIntervals();
    vi.clearAllMocks();

    context = createAppContext();
    setMockAppState(context);
    newGameConfirmShow = vi.fn().mockResolvedValue(true);
    setNewGameConfirm({ show: newGameConfirmShow });
    archiveCurrentGameAndResetMock.mockResolvedValue(null);
    logEventMock.mockImplementation(() => {});
    if (typeof window !== 'undefined') {
      (window as typeof window & { confirm?: (message?: string) => boolean }).confirm = vi.fn(
        () => true,
      );
    }

    // Clear any pending broadcast channels or storage listeners
    if (typeof window !== 'undefined') {
      // Clear storage events
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'app-events:signal:app-db',
          newValue: null,
        }),
      );
    }
  });

  afterEach(() => {
    // Enhanced cleanup to prevent test interference
    cleanupDevelopmentGlobals();
    clearTimeoutsAndIntervals();

    // Clear any storage event listeners by triggering cleanup
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'app-events:signal:app-db',
          newValue: null,
        }),
      );
    }

    vi.clearAllMocks();
  });

  it('runs without confirmation when no progress is detected', async () => {
    const state = cloneState();
    context.state = state;

    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest();
    });

    await act(async () => {
      setMockAppState(context);
      const ok = await result.current.startNewGame();
      expect(ok).toBe(true);
    });

    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(trackGameStartedMock).toHaveBeenCalledTimes(1);
  });

  it('requests confirmation when progress exists and honours cancellation', async () => {
    const state = cloneState();
    state.scores = { alice: 5 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(false);
    const onCancelled = vi.fn();
    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest({ confirm: confirmSpy, onCancelled, forceHasProgress: true });
    });

    await act(async () => {
      setMockAppState(context);
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).not.toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(trackGameStartedMock).not.toHaveBeenCalled();
  });

  it('blocks when requireIdle is true and a batch is pending', async () => {
    // Ensure complete isolation from other tests
    const isolatedContext = createAppContext({ isBatchPending: true });
    setMockAppState(isolatedContext);

    const { result } = renderHook(() => {
      return useNewGameRequest({ requireIdle: true, forceHasProgress: true });
    });

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(archiveCurrentGameAndResetMock).not.toHaveBeenCalled();
    expect(trackGameStartedMock).not.toHaveBeenCalled();
  });

  it('clears pending when a reset storage event fires', async () => {
    const state = cloneState();
    state.scores = { alice: 5 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const deferred = createDeferred();
    archiveCurrentGameAndResetMock.mockReturnValueOnce(deferred);

    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest({ confirm: confirmSpy, forceHasProgress: true });
    });

    let startPromise: Promise<boolean> | undefined;
    await act(async () => {
      setMockAppState(context);
      startPromise = result.current.startNewGame();
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'app-events:signal:app-db',
          newValue: 'reset',
        }),
      );
    });

    expect(result.current.pending).toBe(false);

    deferred.resolve();
    await act(async () => {
      expect(await startPromise!).toBe(true);
    });

    expect(trackGameStartedMock).toHaveBeenCalledTimes(1);
  });

  it('skips confirmation when skipConfirm option is provided', async () => {
    const state = cloneState();
    state.scores = { alice: 12 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest({ confirm: confirmSpy, forceHasProgress: true });
    });

    await act(async () => {
      setMockAppState(context);
      const ok = await result.current.startNewGame({ skipConfirm: true });
      expect(ok).toBe(true);
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).toHaveBeenCalledTimes(1);
    expect(trackGameStartedMock).toHaveBeenCalledTimes(1);
  });

  it('emits telemetry for confirmed requests when enabled', async () => {
    const state = cloneState();
    state.scores = { alice: 7 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest({
        confirm: confirmSpy,
        telemetry: { enabled: true },
        forceHasProgress: true,
      });
    });

    await act(async () => {
      setMockAppState(context);
      const ok = await result.current.startNewGame();
      expect(ok).toBe(true);
    });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith(
      'new_game_confirmed',
      expect.objectContaining({
        result: 'confirmed',
        hasProgress: true,
        skipConfirm: false,
        timeTraveling: false,
      }),
    );
    expect(trackGameStartedMock).toHaveBeenCalledTimes(1);
  });

  it('emits telemetry when a confirmation is cancelled', async () => {
    const state = cloneState();
    state.scores = { alice: 11 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(false);
    const onCancelled = vi.fn();
    const { result } = renderHook(() => {
      setMockAppState(context);
      return useNewGameRequest({
        confirm: confirmSpy,
        onCancelled,
        telemetry: { enabled: true },
        forceHasProgress: true,
      });
    });

    await act(async () => {
      setMockAppState(context);
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith(
      'new_game_cancelled',
      expect.objectContaining({
        result: 'cancelled',
        hasProgress: true,
        skipConfirm: false,
      }),
    );
    expect(trackGameStartedMock).not.toHaveBeenCalled();
  });

  it('clears pending when a broadcast reset event fires', async () => {
    const state = cloneState();
    state.scores = { alice: 9 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const listeners: Array<(event: { data: unknown }) => void> = [];
    const originalBroadcastChannel = (
      globalThis as {
        BroadcastChannel?: unknown;
      }
    ).BroadcastChannel;

    class BroadcastChannelStub {
      constructor(_: string) {}
      addEventListener(type: string, handler: (event: { data: unknown }) => void) {
        if (type === 'message') listeners.push(handler);
      }
      removeEventListener(type: string, handler: (event: { data: unknown }) => void) {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      }
      close() {
        listeners.length = 0;
      }
    }

    (globalThis as any).BroadcastChannel = BroadcastChannelStub;

    try {
      const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
      const deferred = createDeferred();
      archiveCurrentGameAndResetMock.mockReturnValueOnce(deferred);

      const { result, unmount } = renderHook(() => {
        setMockAppState(context);
        return useNewGameRequest({ confirm: confirmSpy, forceHasProgress: true });
      });

      let startPromise: Promise<boolean> | undefined;
      await act(async () => {
        setMockAppState(context);
        startPromise = result.current.startNewGame();
        await Promise.resolve();
      });

      expect(result.current.pending).toBe(true);

      await act(async () => {
        for (const handler of [...listeners]) {
          handler({ data: { type: 'reset' } });
        }
        await Promise.resolve();
      });

      expect(result.current.pending).toBe(false);

      deferred.resolve();
      await act(async () => {
        expect(await startPromise!).toBe(true);
      });

      expect(trackGameStartedMock).toHaveBeenCalledTimes(1);

      unmount();
    } finally {
      if (originalBroadcastChannel) {
        (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      } else {
        delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
      }
    }
  });
});
