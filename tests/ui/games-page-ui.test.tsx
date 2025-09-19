import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state';

const archiveCurrentGameAndReset = vi.fn(async () => {});
const listGames = vi.fn(async () => [
  {
    id: 'game-1',
    title: 'Weekend Match',
    createdAt: Date.parse('2024-02-10T12:00:00Z'),
    finishedAt: Date.parse('2024-02-10T15:00:00Z'),
    lastSeq: 10,
    summary: {
      players: 4,
      scores: { a: 120, b: 110 },
      playersById: { a: 'Alice', b: 'Bob', c: 'Carla', d: 'Drew' },
      winnerId: 'a',
      winnerName: 'Alice',
      winnerScore: 120,
      scorecard: { activeRound: 7 },
      sp: {
        phase: 'setup',
        roundNo: null,
        dealerId: null,
        leaderId: null,
        order: [],
        trump: null,
        trumpCard: null,
        trickCounts: {},
        trumpBroken: false,
      },
    },
    bundle: { latestSeq: 10, events: [] },
  },
]);
const deleteGame = vi.fn(async () => {});
const restoreGame = vi.fn(async () => {});

vi.mock('@/lib/state', async () => {
  const actual = await import('@/lib/state');
  return {
    ...actual,
    archiveCurrentGameAndReset,
    listGames,
    deleteGame,
    restoreGame,
  };
});

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);

const inProgressState: AppState = {
  players: { a: 'Alice', b: 'Bob' },
  scores: { a: 10, b: 5 },
  rounds: {
    1: {
      state: 'playing',
      bids: { a: 1, b: 2 },
      made: { a: null, b: null },
    },
  } as any,
  display_order: { a: 0, b: 1 },
  sp: {
    phase: 'playing',
    roundNo: 1,
    dealerId: 'a',
    order: ['a', 'b'],
    trump: 'spades',
    trumpCard: { suit: 'spades', rank: 12 },
    hands: { a: [{ suit: 'spades', rank: 9 }], b: [] },
    trickPlays: [{ playerId: 'a', card: { suit: 'spades', rank: 9 } }],
    trickCounts: { a: 0, b: 0 },
    trumpBroken: false,
    leaderId: 'a',
    reveal: null,
    handPhase: 'playing',
    lastTrickSnapshot: null,
    summaryEnteredAt: Date.now(),
  },
};

const defaultHookValue = {
  state: inProgressState,
  height: 42,
  ready: true,
  append,
  appendMany,
  isBatchPending: false,
  previewAt: async () => inProgressState,
  warnings: [],
  clearWarnings: () => {},
  timeTraveling: false,
};

const useAppStateMock = vi.fn(() => defaultHookValue);

vi.mock('@/components/state-provider', () => ({
  useAppState: useAppStateMock,
}));

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Games page new game flow', () => {
  beforeEach(() => {
    archiveCurrentGameAndReset.mockClear();
    listGames.mockClear();
    deleteGame.mockClear();
    restoreGame.mockClear();
    push.mockClear();
    append.mockClear();
    appendMany.mockClear();
    useAppStateMock.mockReturnValue(defaultHookValue);
  });

  it('confirms before starting a new game and navigates on success', async () => {
    const { default: GamesPage } = await import('@/app/games/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(NewGameConfirmProvider, null, React.createElement(GamesPage)));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(listGames).toHaveBeenCalledTimes(1);

    const newGameButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      /New Game/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(newGameButton).toBeTruthy();

    newGameButton.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialogContent = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(dialogContent).toBeTruthy();

    const [cancelButton] = Array.from(
      dialogContent.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    cancelButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(archiveCurrentGameAndReset).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    newGameButton.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialogContent2 = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    const buttons = Array.from(dialogContent2.querySelectorAll('button')) as HTMLButtonElement[];
    const confirmButton = buttons[1];
    confirmButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(archiveCurrentGameAndReset).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/');

    root.unmount();
    container.remove();
  });
});
