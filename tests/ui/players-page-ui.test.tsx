import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AppState } from '@/lib/state';
import { INITIAL_STATE } from '@/lib/state';

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);
const startNewGame = vi.fn(async () => true);

const suite = typeof document === 'undefined' ? describe.skip : describe;

type MockAppStateHook = ReturnType<typeof import('@/components/state-provider')['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;

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

function buildState(): AppState {
  return {
    players: { p1: 'Alice', p2: 'Bot Bob' },
    playerDetails: {
      p1: {
        name: 'Alice',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      p2: {
        name: 'Bot Bob',
        type: 'bot',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      p3: {
        name: 'Archived Joe',
        type: 'human',
        archived: true,
        archivedAt: 10,
        createdAt: 0,
        updatedAt: 10,
      },
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
    setMockAppState(mockAppState);
  });

  async function renderWithProviders(element: React.ReactElement) {
    const { PromptDialogProvider } = await import('@/components/dialogs/PromptDialog');
    const { ConfirmDialogProvider } = await import('@/components/dialogs/ConfirmDialog');
    const { ToastProvider } = await import('@/components/ui/toast');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(
        ConfirmDialogProvider,
        null,
        React.createElement(
          PromptDialogProvider,
          null,
          React.createElement(ToastProvider, null, element),
        ),
      ),
    );
    return { div, root };
  }

  it('renders sections for players and rosters', async () => {
    const { default: PlayersPage } = await import('@/app/players/page');
    const { div, root } = await renderWithProviders(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(div.textContent || '').toMatch(/Players/);
    expect(div.textContent || '').toMatch(/Rosters/);

    root.unmount();
    div.remove();
  });

  it('adds a player via button interaction', async () => {
    const { default: PlayersPage } = await import('@/app/players/page');
    const { div, root } = await renderWithProviders(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const addButton = Array.from(div.querySelectorAll('button')).find((el) =>
      /Add Player/i.test(el.textContent || ''),
    )!;
    addButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialog = div.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(dialog).toBeTruthy();

    const input = dialog.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'Charlie';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((el) =>
      /Add player/i.test(el.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'player/added' }));

    root.unmount();
    div.remove();
  });

  it('renames a player via modal interaction', async () => {
    const { default: PlayersPage } = await import('@/app/players/page');
    const { div, root } = await renderWithProviders(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const renameButton = div.querySelector('[data-testid="rename-player-p1"]') as HTMLButtonElement;
    expect(renameButton).toBeTruthy();
    renameButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialog = div.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(dialog).toBeTruthy();

    const input = dialog.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'Alice Renamed';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((el) =>
      /Save name/i.test(el.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'player/renamed' }));

    root.unmount();
    div.remove();
  });

  it('renames a roster via modal interaction', async () => {
    const { default: PlayersPage } = await import('@/app/players/page');
    const { div, root } = await renderWithProviders(React.createElement(PlayersPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const renameButton = div.querySelector('[data-testid="rename-roster-r1"]') as HTMLButtonElement;
    expect(renameButton).toBeTruthy();
    renameButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const dialog = div.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(dialog).toBeTruthy();

    const input = dialog.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'Roster Renamed';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((el) =>
      /Save name/i.test(el.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'roster/renamed' }));

    root.unmount();
    div.remove();
  });

  it('loads a roster into score card through the new game flow', async () => {
    window.confirm = vi.fn(() => true);
    const { default: PlayersPage } = await import('@/app/players/page');
    const { div, root } = await renderWithProviders(React.createElement(PlayersPage));

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
