import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type RouterStub = ReturnType<(typeof import('next/navigation'))['useRouter']>;
type NewGameConfirmSetter = (impl: { show: ReturnType<typeof vi.fn> }) => void;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (router: RouterStub) => void;
const setNewGameConfirm = (globalThis as any).__setNewGameConfirm as NewGameConfirmSetter;

const stateMocks = vi.hoisted(() => ({
  listGames: vi.fn(async () => [
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
  ]),
  deleteGame: vi.fn(async () => {}),
  restoreGame: vi.fn(async () => {}),
}));

vi.restoreAllMocks();

const stateModule = await import('@/lib/state');
vi.spyOn(stateModule, 'listGames').mockImplementation(
  async (...args: Parameters<typeof stateModule.listGames>) => stateMocks.listGames(...args),
);
vi.spyOn(stateModule, 'deleteGame').mockImplementation(
  async (...args: Parameters<typeof stateModule.deleteGame>) => stateMocks.deleteGame(...args),
);
vi.spyOn(stateModule, 'restoreGame').mockImplementation(
  async (...args: Parameters<typeof stateModule.restoreGame>) => stateMocks.restoreGame(...args),
);

const gameFlowModule = await import('@/lib/game-flow');
const startNewGameSpy = vi.hoisted(() => vi.fn(async () => true));
vi.spyOn(gameFlowModule, 'useNewGameRequest').mockImplementation(() => ({
  startNewGame: startNewGameSpy,
  pending: false,
}));

const push = vi.fn();

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);

function createInProgressContext(): MockAppStateHook {
  const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
  state.players = { a: 'Alice', b: 'Bob' } as AppState['players'];
  state.scores = { a: 10, b: 5 } as AppState['scores'];
  state.rounds[1] = {
    ...state.rounds[1],
    state: 'playing',
    bids: { a: 1, b: 2 },
    made: { a: null, b: null },
  };
  state.sp = {
    ...state.sp,
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
    handPhase: 'playing',
  } as AppState['sp'];

  return {
    state,
    height: 42,
    ready: true,
    append,
    appendMany,
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: () => {},
    timeTravelHeight: null,
    setTimeTravelHeight: () => {},
    timeTraveling: false,
  };
}

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Games page new game flow', () => {
  beforeEach(() => {
    stateMocks.listGames.mockClear();
    stateMocks.deleteGame.mockClear();
    stateMocks.restoreGame.mockClear();
    push.mockClear();
    append.mockClear();
    appendMany.mockClear();
    startNewGameSpy.mockClear();
    setMockAppState(createInProgressContext());
    setMockRouter({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      forward: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('confirms before starting a new game and navigates on success', async () => {
    const confirmShow = vi.fn<(options?: unknown) => Promise<boolean>>().mockResolvedValue(true);
    setNewGameConfirm({ show: confirmShow });

    const { default: GamesPage } = await import('@/app/games/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(NewGameConfirmProvider, null, React.createElement(GamesPage)));

    await waitFor(() => {
      expect(stateMocks.listGames).toHaveBeenCalledTimes(1);
    });

    const newGameButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      /New Game/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(newGameButton).toBeTruthy();

    newGameButton.click();

    await waitFor(() => {
      expect(startNewGameSpy).toHaveBeenCalledTimes(1);
    });
    expect(push).toHaveBeenCalledWith('/');

    root.unmount();
    container.remove();
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
