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
    lastTrickSnapshot: null,
    summaryEnteredAt: Date.now(),
  },
  display_order: { p1: 0, p2: 1 },
};

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);
const archiveCurrentGameAndReset = vi.fn(async () => {});

type StateHook = {
  state: AppState;
  height: number;
  ready: boolean;
  append: typeof append;
  appendMany: typeof appendMany;
  isBatchPending: boolean;
  previewAt: (height: number) => Promise<AppState>;
  warnings: [];
  clearWarnings: () => void;
  timeTraveling: boolean;
};

const defaultHookValue: StateHook = {
  state: baseGameSummaryState,
  height: 0,
  ready: true,
  append,
  appendMany,
  isBatchPending: false,
  previewAt: async () => baseGameSummaryState,
  warnings: [],
  clearWarnings: () => {},
  timeTraveling: false,
};

const useAppStateMock = vi.fn(() => defaultHookValue);

vi.mock('@/components/state-provider', async () => {
  return {
    useAppState: useAppStateMock,
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
    useAppStateMock.mockReturnValue(defaultHookValue);
  });

  it('renders totals without the Play Again button', async () => {
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
    const playAgain = btns.find((b) => /Play Again/i.test(b.textContent || ''));
    expect(playAgain).toBeUndefined();

    root.unmount();
    div.remove();
  });

  it('shows confirmation dialog when starting a new game mid-progress', async () => {
    const { useNewGameRequest } = await import('@/lib/game-flow');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');

    const inProgressState: AppState = {
      ...baseGameSummaryState,
      scores: { p1: 10, p2: 5 },
      rounds: {
        10: {
          state: 'playing',
          bids: { p1: 2, p2: 1 },
          made: { p1: null, p2: null },
        },
      } as any,
      sp: {
        ...baseGameSummaryState.sp,
        phase: 'playing',
        trickPlays: [
          {
            playerId: 'p1',
            card: { suit: 'spades', rank: 10 },
          },
        ],
        hands: {
          p1: [
            { suit: 'spades', rank: 9 },
            { suit: 'hearts', rank: 12 },
          ],
        },
      },
    };

    useAppStateMock.mockReturnValue({
      ...defaultHookValue,
      state: inProgressState,
      previewAt: async () => inProgressState,
    });

    function Trigger() {
      const { startNewGame, pending } = useNewGameRequest();
      return React.createElement(
        'button',
        {
          'data-testid': 'launch',
          disabled: pending,
          onClick: () => {
            void startNewGame();
          },
        },
        'Launch',
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(NewGameConfirmProvider, null, React.createElement(Trigger)));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const launch = container.querySelector('[data-testid="launch"]') as HTMLButtonElement;
    expect(launch).toBeTruthy();
    launch.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialogContent = document.querySelector(
      '[data-slot="dialog-content"]',
    ) as HTMLElement | null;
    expect(dialogContent?.textContent || '').toMatch(/Start a new game/i);

    const [cancelButton, confirmButton] = Array.from(
      dialogContent!.querySelectorAll('button'),
    ) as HTMLButtonElement[];

    cancelButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(archiveCurrentGameAndReset).not.toHaveBeenCalled();

    // Trigger again and confirm
    launch.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialogContent2 = document.querySelector(
      '[data-slot="dialog-content"]',
    ) as HTMLElement | null;
    expect(dialogContent2).not.toBeNull();
    const [, confirmButton2] = Array.from(
      dialogContent2!.querySelectorAll('button'),
    ) as HTMLButtonElement[];

    confirmButton2.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(archiveCurrentGameAndReset).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });
});
