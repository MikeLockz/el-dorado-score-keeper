import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state/types';

const baseGameSummaryState: AppState = {
  players: { p1: 'Human', p2: 'Bot' },
  scores: { p1: 42, p2: 35 },
  rounds: {
    10: { state: 'scored', bids: { p1: 2, p2: 0 }, made: { p1: true, p2: false } },
  } as any,
  sp: {
    phase: 'game-summary',
    roundNo: 10,
    dealerId: 'p2',
    order: ['p1', 'p2'],
    trump: 'spades',
    trumpCard: { suit: 'spades', rank: 14 },
    hands: { p1: [], p2: [] },
    trickPlays: [],
    trickCounts: { p1: 2, p2: 0 },
    trumpBroken: false,
    leaderId: 'p1',
    reveal: null,
    handPhase: 'idle',
    ack: 'none',
    lastTrickSnapshot: null,
    summaryEnteredAt: Date.now(),
  },
  display_order: { p1: 0, p2: 1 },
};

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);
const archiveCurrentGameAndReset = vi.fn(async () => {});

vi.mock('@/components/state-provider', async () => {
  return {
    useAppState: () => ({
      state: baseGameSummaryState,
      height: 0,
      ready: true,
      append,
      appendMany,
      isBatchPending: false,
      previewAt: async () => baseGameSummaryState,
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
    computeAdvanceBatch: vi.fn(() => []),
  };
});

vi.mock('@/lib/state', async (orig) => {
  const mod = await (orig as any)();
  return {
    ...mod,
    archiveCurrentGameAndReset,
  };
});

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Game Summary UI', () => {
  beforeEach(() => {
    append.mockClear();
    appendMany.mockClear();
    archiveCurrentGameAndReset.mockClear();
  });

  it('renders totals and triggers Play Again', async () => {
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(SinglePlayerPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const text = div.textContent || '';
    expect(text).toMatch(/Game Summary/);
    expect(text).toMatch(/Winner/);

    const btns = Array.from(div.querySelectorAll('button'));
    const playAgain = btns.find((b) =>
      /Play Again/i.test(b.textContent || ''),
    ) as HTMLButtonElement;
    expect(playAgain).toBeTruthy();
    playAgain.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(archiveCurrentGameAndReset).toHaveBeenCalled();

    root.unmount();
    div.remove();
  });
});
