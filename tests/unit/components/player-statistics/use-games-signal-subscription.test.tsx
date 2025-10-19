import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GamesSignal } from '@/lib/state/game-signals';
import * as gameSignals from '@/lib/state/game-signals';
import { useGamesSignalSubscription } from '@/components/hooks';

const subscribeToGamesSignalMock = vi.spyOn(gameSignals, 'subscribeToGamesSignal');

describe('useGamesSignalSubscription', () => {
  beforeEach(() => {
    subscribeToGamesSignalMock.mockReset();
    subscribeToGamesSignalMock.mockImplementation(() => () => {});
  });

  it('subscribes and forwards signals to the handler', async () => {
    const handler = vi.fn();
    const unsubscribe = vi.fn();
    let capturedHandler: ((signal: GamesSignal) => void) | null = null;
    subscribeToGamesSignalMock.mockImplementation((next) => {
      capturedHandler = next;
      return unsubscribe;
    });

    const { unmount } = renderHook(() => useGamesSignalSubscription(handler));

    await waitFor(() => {
      expect(subscribeToGamesSignalMock).toHaveBeenCalledTimes(1);
      expect(capturedHandler).toBeTruthy();
    });

    const signal: GamesSignal = { type: 'added', gameId: 'g1', timestamp: Date.now() };
    act(() => {
      capturedHandler?.(signal);
    });
    expect(handler).toHaveBeenCalledWith(signal);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('skips subscription when disabled', () => {
    const handler = vi.fn();
    renderHook(() => useGamesSignalSubscription(handler, { enabled: false }));
    expect(subscribeToGamesSignalMock).not.toHaveBeenCalled();
  });

  it('keeps a stable subscription across handler updates', async () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    let capturedHandler: ((signal: GamesSignal) => void) | null = null;
    const unsubscribe = vi.fn();
    subscribeToGamesSignalMock.mockImplementation((next) => {
      capturedHandler = next;
      return unsubscribe;
    });

    const { rerender, unmount } = renderHook(({ handler }) => useGamesSignalSubscription(handler), {
      initialProps: { handler: firstHandler },
    });

    await waitFor(() => {
      expect(subscribeToGamesSignalMock).toHaveBeenCalledTimes(1);
      expect(capturedHandler).toBeTruthy();
    });

    const signal: GamesSignal = { type: 'deleted', gameId: 'g2', timestamp: Date.now() };
    act(() => {
      capturedHandler?.(signal);
    });
    expect(firstHandler).toHaveBeenCalledWith(signal);

    rerender({ handler: secondHandler });
    const nextSignal: GamesSignal = { type: 'added', gameId: 'g3', timestamp: Date.now() };
    act(() => {
      capturedHandler?.(nextSignal);
    });
    expect(secondHandler).toHaveBeenCalledWith(nextSignal);
    expect(subscribeToGamesSignalMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
