import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state/types';

// State with reveal active and final trick already counted
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
      { playerId: 'p1', card: { suit: 'clubs', rank: 2 } },
      { playerId: 'p2', card: { suit: 'clubs', rank: 3 } },
    ],
    trickCounts: { p1: 1, p2: 0 },
    trumpBroken: false,
    leaderId: 'p1',
    reveal: { winnerId: 'p1' },
  },
  display_order: { p1: 0, p2: 1 },
};

// Spy that simulates engine finalize after clear batch
const append = vi.fn(async () => 1);
const appendMany = vi.fn(async (batch: any[]) => {
  // When the UI clears the trick during reveal, simulate engine finalize next tick
  const hasClear = batch.some((e) => e?.type === 'sp/trick/cleared');
  if (hasClear) {
    setTimeout(() => {
      appendMany(
        [
          { type: 'made/set', payload: { round: 10, playerId: 'p1', made: true } },
          { type: 'made/set', payload: { round: 10, playerId: 'p2', made: true } },
          { type: 'sp/phase-set', payload: { phase: 'done' } },
          { type: 'round/finalize', payload: { round: 10 } },
        ] as any[],
        0,
      );
    });
  }
  return 1;
});

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

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('UI reveal → clear → finalize flow', () => {
  it('after clicking Next Round, a second batch finalizes the round', async () => {
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(SinglePlayerPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Click the reveal button
    const btns = Array.from(div.querySelectorAll('button'));
    const nxt = btns.find((b) => /Next Round/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(nxt).toBeTruthy();
    nxt.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // First call: clear/leader/reveal-clear
    expect(appendMany).toHaveBeenCalled();
    const first = appendMany.mock.calls[0]?.[0] as any[];
    const firstTypes = first.map((e) => e.type);
    expect(firstTypes).toEqual(['sp/trick/cleared', 'sp/leader-set', 'sp/trick/reveal-clear']);

    // Second call: finalize batch from simulated engine
    await new Promise((r) => setTimeout(r, 0));
    expect(appendMany).toHaveBeenCalledTimes(2);
    const second = appendMany.mock.calls[1]?.[0] as any[];
    const secondTypes = second.map((e) => e.type);
    expect(secondTypes).toContain('made/set');
    expect(secondTypes).toContain('round/finalize');
    expect(secondTypes).toContain('sp/phase-set');

    root.unmount();
    div.remove();
  });
});
