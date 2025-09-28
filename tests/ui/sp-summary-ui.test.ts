import { afterAll, describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state/types';

const baseSummaryState = (roundNo = 1): AppState => ({
  players: { p1: 'Human', p2: 'Bot' },
  scores: { p1: 10, p2: 5 },
  rounds: {
    [roundNo]: {
      state: 'scored',
      bids: { p1: 1, p2: 0 },
      made: { p1: true, p2: false },
    },
  } as any,
  sp: {
    phase: 'summary',
    roundNo,
    dealerId: 'p1',
    order: ['p1', 'p2'],
    trump: 'spades',
    trumpCard: { suit: 'spades', rank: 14 },
    hands: { p1: [], p2: [] },
    trickPlays: [],
    trickCounts: { p1: 1, p2: 0 },
    trumpBroken: false,
    leaderId: 'p1',
    reveal: null,
    handPhase: 'idle',
    lastTrickSnapshot: null,
    summaryEnteredAt: Date.now(),
  },
  display_order: { p1: 0, p2: 1 },
});

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);

if (typeof document !== 'undefined') {
  vi.mock('@/components/state-provider', async () => {
    return {
      useAppState: () => ({
        state: baseSummaryState(1),
        height: 0,
        ready: true,
        append,
        appendMany,
        isBatchPending: false,
        previewAt: async () => baseSummaryState(1),
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
      startRound: vi.fn((cfg: any) => ({
        order: cfg.players,
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 12 },
        hands: { p1: [], p2: [] },
        firstToAct: cfg.players[0],
      })),
      winnerOfTrick: vi.fn(),
      computeAdvanceBatch: (s: AppState) => [
        {
          type: 'sp/deal',
          payload: {
            roundNo: (s.sp.roundNo ?? 0) + 1,
            dealerId: 'p2',
            order: ['p1', 'p2'],
            trump: 'hearts',
            trumpCard: { suit: 'hearts', rank: 12 },
            hands: { p1: [], p2: [] },
          },
        },
        { type: 'sp/leader-set', payload: { leaderId: 'p1' } },
        { type: 'sp/phase-set', payload: { phase: 'bidding' } },
        { type: 'round/state-set', payload: { round: (s.sp.roundNo ?? 0) + 1, state: 'bidding' } },
      ],
    };
  });
}

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Summary UI', () => {
  beforeEach(() => {
    append.mockClear();
    appendMany.mockClear();
  });

  it('renders per-player summary and continues to next round on click', async () => {
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(SinglePlayerPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const text = div.textContent || '';
    expect(text).toMatch(/Round 1 Summary/);
    expect(text).toMatch(/Human/);
    expect(text).toMatch(/Bot/);

    const btns = Array.from(div.querySelectorAll('button'));
    const next = btns.find((b) => /Next Round/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(next).toBeTruthy();
    next.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(appendMany).toHaveBeenCalled();
    const types = (appendMany.mock.calls[0]?.[0] as any[]).map((e) => e.type);
    expect(types).toContain('sp/deal');

    root.unmount();
    div.remove();
  });
});

afterAll(() => {
  vi.resetModules();
});
