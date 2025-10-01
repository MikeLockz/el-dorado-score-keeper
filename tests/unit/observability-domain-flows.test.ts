import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/lib/state/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('observability domain instrumentation', () => {
  it('wraps finalizeRound with a span and injects metadata', async () => {
    const spans = await import('@/lib/observability/spans');
    const withSpanSyncMock = vi
      .spyOn(spans, 'withSpanSync')
      .mockImplementation((_name, _attrs, fn: (span: unknown) => AppState) => fn(null as never));

    const { finalizeRound } = await import('@/lib/state/logic');
    const { INITIAL_STATE } = await import('@/lib/state/types');

    const base: AppState = {
      ...INITIAL_STATE,
      players: { a: 'Alice', b: 'Bob' },
      scores: { a: 0, b: 0 },
      rounds: {
        ...INITIAL_STATE.rounds,
        1: {
          state: 'bidding',
          bids: { a: 2, b: 1 },
          made: { a: true, b: false },
        } as AppState['rounds'][number],
      },
    };

    finalizeRound(base, 1);

    expect(withSpanSyncMock).toHaveBeenCalledTimes(1);
    expect(withSpanSyncMock.mock.calls[0]?.[0]).toBe('state.finalize-round');
    expect(withSpanSyncMock.mock.calls[0]?.[1]).toEqual({ round: 1, playerCount: 2 });
    expect(withSpanSyncMock.mock.calls[0]?.[3]).toEqual({ runtime: 'browser' });
  });

  it('wraps listGames with a span containing db metadata', async () => {
    const spans = await import('@/lib/observability/spans');
    const withSpanMock = vi
      .spyOn(spans, 'withSpan')
      .mockImplementation((_name, _attrs, fn: () => Promise<unknown>) => fn());

    const { listGames } = await import('@/lib/state/io');

    await listGames('custom-games-db');

    expect(withSpanMock).toHaveBeenCalledWith(
      'state.games-list',
      { dbName: 'custom-games-db' },
      expect.any(Function),
      { runtime: 'browser' },
    );
  });

  it('wraps archiveCurrentGameAndReset with a high-level span', async () => {
    const spans = await import('@/lib/observability/spans');
    const withSpanMock = vi
      .spyOn(spans, 'withSpan')
      .mockImplementation((_name, _attrs, fn: () => Promise<unknown>) => fn());

    const { archiveCurrentGameAndReset } = await import('@/lib/state/io');

    await archiveCurrentGameAndReset('primary-db', { title: 'Championship' });

    expect(withSpanMock).toHaveBeenCalledWith(
      'state.archive-and-reset',
      { dbName: 'primary-db', hasTitle: true },
      expect.any(Function),
      { runtime: 'browser' },
    );
  });
});
