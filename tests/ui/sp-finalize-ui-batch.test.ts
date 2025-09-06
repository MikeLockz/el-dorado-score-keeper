import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state/types';

// Build a minimal state with round 10 done in SP runtime but not yet scored in scorekeeper
const baseState: AppState = {
  players: { p1: 'Human', p2: 'Bot' },
  scores: {},
  rounds: {
    1: { state: 'scored', bids: {}, made: {} },
    2: { state: 'scored', bids: {}, made: {} },
    3: { state: 'scored', bids: {}, made: {} },
    4: { state: 'scored', bids: {}, made: {} },
    5: { state: 'scored', bids: {}, made: {} },
    6: { state: 'scored', bids: {}, made: {} },
    7: { state: 'scored', bids: {}, made: {} },
    8: { state: 'scored', bids: {}, made: {} },
    9: { state: 'locked', bids: {}, made: {} },
    10: {
      state: 'playing',
      bids: { p1: 1, p2: 0 },
      made: { p1: null, p2: null },
    },
  },
  sp: {
    phase: 'done',
    roundNo: 10,
    dealerId: 'p1',
    order: ['p1', 'p2'],
    trump: 'spades',
    trumpCard: { suit: 'spades', rank: 14 },
    hands: { p1: [], p2: [] },
    trickPlays: [],
    trickCounts: { p1: 1, p2: 0 }, // meets tricksForRound(10)=1
    trumpBroken: false,
    leaderId: 'p1',
  },
  display_order: { p1: 0, p2: 1 },
};

// Mock useAppState to control state and intercept appends
const appendMany = vi.fn(async () => 1);
const append = vi.fn(async () => 1);

vi.mock('@/components/state-provider', async () => {
  return {
    useAppState: () => ({
      state: baseState,
      height: 0,
      ready: true,
      append,
      appendMany,
      isBatchPending: false,
      previewAt: async () => baseState,
      warnings: [],
      clearWarnings: () => {},
    }),
  };
});

// Mock bots to avoid any side effects if invoked
vi.mock('@/lib/single-player', async () => {
  return {
    bots: {
      botBid: () => 0,
      botPlay: () => ({ suit: 'clubs', rank: 2 }),
    },
    startRound: vi.fn(),
    winnerOfTrick: vi.fn(),
  };
});

// Skip this UI test when no DOM environment is available (no jsdom)
const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('UI finalize (round 10) batches single appendMany', () => {
  it('calls appendMany once including r9->bidding alignment', async () => {
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(SinglePlayerPage));

    // Let effects run
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Ensure only a single batched write from the finalize effect
    expect(appendMany).toHaveBeenCalledTimes(1);
    expect(append).not.toHaveBeenCalled();

    const batchArg = appendMany.mock.calls[0]?.[0] as any[];
    const types = batchArg.map((e) => e.type);
    // Contains made/set for both, sp/phase-set done, round/finalize, and round 9 -> bidding
    expect(types).toContain('made/set');
    expect(types).toContain('sp/phase-set');
    expect(types).toContain('round/finalize');
    expect(types).toContainEqual('round/state-set');
    // Verify the round 9 alignment write is part of the same batch
    const r9 = batchArg.find((e) => e.type === 'round/state-set');
    expect(r9?.payload?.round).toBe(9);
    expect(r9?.payload?.state).toBe('bidding');

    root.unmount();
    div.remove();
  });
});
