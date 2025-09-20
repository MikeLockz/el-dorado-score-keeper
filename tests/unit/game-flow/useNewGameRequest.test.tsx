import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';

type ConfirmHandler = (context: {
  reason: 'in-progress';
  state: AppState;
}) => boolean | Promise<boolean>;

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

type NewGameConfirmSetter = (impl: { show: (options?: any) => Promise<boolean> }) => void;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setNewGameConfirm = (globalThis as any).__setNewGameConfirm as NewGameConfirmSetter;

vi.restoreAllMocks();

const stateModule = await import('@/lib/state');
const archiveCurrentGameAndResetMock = vi
  .spyOn(stateModule, 'archiveCurrentGameAndReset')
  .mockResolvedValue(null);

const clientLogModule = await import('@/lib/client-log');
const logEventMock = vi.spyOn(clientLogModule, 'logEvent').mockImplementation(() => {});

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
    ...overrides,
  } as MockAppStateHook;
  return context;
}

describe('useNewGameRequest', () => {
  let context: MockAppStateHook;
  let newGameConfirmShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
  });

  it('runs without confirmation when no progress is detected', async () => {
    const state = cloneState();
    context.state = state;

    const { result } = renderHook(() => useNewGameRequest());

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(true);
    });

    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('requests confirmation when progress exists and honours cancellation', async () => {
    const state = cloneState();
    state.scores = { alice: 5 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(false);
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useNewGameRequest({ confirm: confirmSpy, onCancelled }));

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).not.toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('blocks when requireIdle is true and a batch is pending', async () => {
    context.isBatchPending = true;
    setMockAppState(context);

    const { result } = renderHook(() => useNewGameRequest({ requireIdle: true }));

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(archiveCurrentGameAndResetMock).not.toHaveBeenCalled();
  });

  it('clears pending when a reset storage event fires', async () => {
    const state = cloneState();
    state.scores = { alice: 5 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const deferred = createDeferred();
    archiveCurrentGameAndResetMock.mockReturnValueOnce(deferred);

    const { result } = renderHook(() => useNewGameRequest({ confirm: confirmSpy }));

    let startPromise: Promise<boolean> | undefined;
    await act(async () => {
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
  });

  it('skips confirmation when skipConfirm option is provided', async () => {
    const state = cloneState();
    state.scores = { alice: 12 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useNewGameRequest({ confirm: confirmSpy }));

    await act(async () => {
      const ok = await result.current.startNewGame({ skipConfirm: true });
      expect(ok).toBe(true);
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(newGameConfirmShow).not.toHaveBeenCalled();
    expect(archiveCurrentGameAndResetMock).toHaveBeenCalledTimes(1);
  });

  it('emits telemetry for confirmed requests when enabled', async () => {
    const state = cloneState();
    state.scores = { alice: 7 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useNewGameRequest({ confirm: confirmSpy, telemetry: { enabled: true } }),
    );

    await act(async () => {
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
  });

  it('emits telemetry when a confirmation is cancelled', async () => {
    const state = cloneState();
    state.scores = { alice: 11 } as AppState['scores'];
    context.state = state;
    setMockAppState(context);

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(false);
    const onCancelled = vi.fn();
    const { result } = renderHook(() =>
      useNewGameRequest({ confirm: confirmSpy, onCancelled, telemetry: { enabled: true } }),
    );

    await act(async () => {
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

      const { result, unmount } = renderHook(() => useNewGameRequest({ confirm: confirmSpy }));

      let startPromise: Promise<boolean> | undefined;
      await act(async () => {
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
