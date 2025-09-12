import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state/types';

// Build a minimal SP state with reveal active and totals meeting tricksForRound
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
    phase: 'playing',
    roundNo: 10,
    dealerId: 'p1',
    order: ['p1', 'p2'],
    trump: 'spades',
    trumpCard: { suit: 'spades', rank: 14 },
    hands: { p1: [], p2: [] },
    trickPlays: [
      // Keep the last trick visible during reveal (two plays shown)
      { playerId: 'p1', card: { suit: 'clubs', rank: 2 } },
      { playerId: 'p2', card: { suit: 'clubs', rank: 3 } },
    ],
    trickCounts: { p1: 1, p2: 0 }, // meets tricksForRound(10)=1
    trumpBroken: false,
    leaderId: 'p1',
    reveal: { winnerId: 'p1' },
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

// Mock bots to avoid any side effects
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

// Skip when no DOM environment is available (no jsdom)
const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('UI reveal gating', () => {
  it('shows Next Round on reveal and only clears trick on click', async () => {
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(SinglePlayerPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Ensure nothing was finalized automatically while reveal is active
    expect(appendMany).not.toHaveBeenCalled();

    // Find the reveal bar button by its text
    const btns = Array.from(div.querySelectorAll('button'));
    const nxt = btns.find((b) => /Next Round/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(nxt).toBeTruthy();

    // Click to clear trick; should batch clear + leader + reveal-clear only
    nxt.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(appendMany).toHaveBeenCalledTimes(1);
    const batch = appendMany.mock.calls[0]?.[0] as any[];
    const types = batch.map((e) => e.type);
    expect(types).toEqual(['sp/trick/cleared', 'sp/leader-set', 'sp/trick/reveal-clear']);

    root.unmount();
    div.remove();
  });
});
