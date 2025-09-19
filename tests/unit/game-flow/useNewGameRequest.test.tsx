import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AppState } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';

type ConfirmHandler = (context: {
  reason: 'in-progress';
  state: AppState;
}) => boolean | Promise<boolean>;

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

vi.mock('@/components/state-provider', () => ({
  useAppState: vi.fn(),
}));

vi.mock('@/lib/state', () => ({
  archiveCurrentGameAndReset: vi.fn(async () => null),
}));

const { useNewGameRequest } = await import('@/lib/game-flow');
const { useAppState } = await import('@/components/state-provider');
const { archiveCurrentGameAndReset } = await import('@/lib/state');

const useAppStateMock = useAppState as unknown as Mock;
const archiveCurrentGameAndResetMock = archiveCurrentGameAndReset as unknown as Mock;

function cloneState(): Mutable<AppState> {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as Mutable<AppState>;
}

describe('useNewGameRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStateMock.mockReturnValue({
      state: cloneState(),
      timeTraveling: false,
      isBatchPending: false,
    });
    archiveCurrentGameAndResetMock.mockResolvedValue(null);
    if (typeof window !== 'undefined') {
      (window as typeof window & { confirm?: (message?: string) => boolean }).confirm = vi.fn(
        () => true,
      );
    }
  });

  it('runs without confirmation when no progress is detected', async () => {
    const state = cloneState();
    useAppStateMock.mockReturnValue({
      state,
      timeTraveling: false,
      isBatchPending: false,
    });

    const { result } = renderHook(() => useNewGameRequest());

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(true);
    });

    expect(archiveCurrentGameAndReset).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('requests confirmation when progress exists and honours cancellation', async () => {
    const state = cloneState();
    state.scores = { alice: 5 } as AppState['scores'];
    useAppStateMock.mockReturnValue({
      state,
      timeTraveling: false,
      isBatchPending: false,
    });

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(false);
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useNewGameRequest({ confirm: confirmSpy, onCancelled }));

    await act(async () => {
      const ok = await result.current.startNewGame();
      expect(ok).toBe(false);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(archiveCurrentGameAndResetMock).not.toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('blocks when requireIdle is true and a batch is pending', async () => {
    const state = cloneState();
    useAppStateMock.mockReturnValue({
      state,
      timeTraveling: false,
      isBatchPending: true,
    });

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
    useAppStateMock.mockReturnValue({
      state,
      timeTraveling: false,
      isBatchPending: false,
    });

    const confirmSpy: ConfirmHandler = vi.fn().mockResolvedValue(true);
    const deferred = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      return Object.assign(promise, { resolve });
    })();
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
});
