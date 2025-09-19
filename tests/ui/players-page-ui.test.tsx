import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state';
import { INITIAL_STATE } from '@/lib/state';

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);
const startNewGame = vi.fn(async () => true);

const suite = typeof document === 'undefined' ? describe.skip : describe;

vi.mock('@/lib/game-flow', () => ({
  useNewGameRequest: () => ({ startNewGame, pending: false }),
}));

type MockContext = {
  state: AppState;
  ready: boolean;
  height: number;
  append: typeof append;
  appendMany: typeof appendMany;
  isBatchPending: boolean;
  previewAt: () => Promise<AppState>;
  warnings: [];
  clearWarnings: () => void;
  timeTravelHeight: null;
  setTimeTravelHeight: () => void;
  timeTraveling: boolean;
};

let mockAppState: MockContext;

vi.mock('@/components/state-provider', () => ({
  useAppState: () => mockAppState,
}));

function buildState(): AppState {
  return {
    players: { p1: 'Alice', p2: 'Bot Bob' },
    playerDetails: {
      p1: { name: 'Alice', type: 'human', archivedAt: null, createdAt: 0, updatedAt: 0 },
      p2: { name: 'Bot Bob', type: 'bot', archivedAt: null, createdAt: 0, updatedAt: 0 },
      p3: { name: 'Archived Joe', type: 'human', archivedAt: 10, createdAt: 0, updatedAt: 10 },
    },
    scores: {},
    rounds: {},
    rosters: {
      r1: {
        name: 'Roster A',
        playersById: { p1: 'Alice', p2: 'Bot Bob' },
        playerTypesById: { p1: 'human', p2: 'bot' },
        displayOrder: { p1: 0, p2: 1 },
        type: 'scorecard',
        createdAt: 0,
        archivedAt: null,
      },
    },
    activeScorecardRosterId: 'r1',
    activeSingleRosterId: null,
    humanByMode: {},
    sp: { ...INITIAL_STATE.sp },
    display_order: { p1: 0, p2: 1 },
  } as AppState;
}

suite('PlayersPage UI', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const state = buildState();
    mockAppState = {
      state,
      ready: true,
      height: 10,
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
  });

  it('renders sections for players and rosters', async () => {
    const { default: PlayersPage } = await import('@/app/players/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(div.textContent || '').toMatch(/Players/);
    expect(div.textContent || '').toMatch(/Rosters/);

    root.unmount();
    div.remove();
  });

  it('adds a player via button interaction', async () => {
    window.prompt = vi.fn(() => 'Charlie');
    const { default: PlayersPage } = await import('@/app/players/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const addButton = Array.from(div.querySelectorAll('button')).find((el) =>
      /Add Player/i.test(el.textContent || ''),
    )!;
    addButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'player/added' }));

    root.unmount();
    div.remove();
  });

  it('loads a roster into score card through the new game flow', async () => {
    window.confirm = vi.fn(() => true);
    const { default: PlayersPage } = await import('@/app/players/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const loadButton = Array.from(div.querySelectorAll('button')).find((el) =>
      /Load Score Card/i.test(el.textContent || ''),
    )!;
    loadButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(startNewGame).toHaveBeenCalled();
    expect(appendMany).toHaveBeenCalled();

    root.unmount();
    div.remove();
  });
});
