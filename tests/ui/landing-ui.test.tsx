import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';
import type { GameRecord } from '@/lib/state/io';

const suite = typeof document === 'undefined' ? describe.skip : describe;

const noop = () => {};

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type RouterStub = ReturnType<(typeof import('next/navigation'))['useRouter']>;
type NewGameConfirmSetter = (impl: { show: ReturnType<typeof vi.fn> }) => void;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setListGamesMock = (globalThis as any).__setListGamesMock as (
  fn: () => Promise<GameRecord[]>,
) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (router: RouterStub) => void;
const setNewGameConfirm = (globalThis as any).__setNewGameConfirm as NewGameConfirmSetter;

function mockAppState(
  state: AppState,
  { height = 0, ready = true }: { height?: number; ready?: boolean } = {},
) {
  setMockAppState({
    state,
    height,
    ready,
    append: async () => 0,
    appendMany: async () => 0,
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: noop,
    timeTraveling: false,
  });
}

suite('Landing Page UI', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setListGamesMock(async () => []);
  });

  it('renders hero copy and default new game actions', async () => {
    const baseState = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    mockAppState(baseState, { height: 0 });
    const { default: LandingPage } = await import('@/app/landing/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(NewGameConfirmProvider, null, React.createElement(LandingPage)),
    );

    await waitFor(() => {
      expect(div.textContent || '').toMatch(/Set Out for El Dorado/);
    });

    const hero = div.textContent || '';
    expect(hero).toMatch(/Set Out for El Dorado/);

    const singleSection = div.querySelector('section[aria-label="Single player mode actions"]')!;
    const singlePrimary = singleSection.querySelector('button')!;
    expect(singlePrimary.textContent).toMatch(/New Game/i);

    const scoreSection = div.querySelector(
      'section[aria-label="Open score card for in-person tallying"]',
    )!;
    const scorePrimary = scoreSection.querySelector('button')!;
    expect(scorePrimary.textContent).toMatch(/New Score Card/i);

    root.unmount();
    div.remove();
  });

  it('renders resume actions when progress exists', async () => {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'spades', rank: 10 }] },
      trickPlays: [],
      currentGameId: 'sp-current-123',
    } as AppState['sp'];
    state.players = { a: 'Alice', b: 'Bob' } as AppState['players'];
    state.scores = { a: 5, b: 0 } as AppState['scores'];
    state.rounds[1] = {
      ...state.rounds[1],
      state: 'bidding',
      bids: { a: 2 },
      made: { a: null },
    };
    state.activeScorecardRosterId = 'scorecard-789';
    mockAppState(state, { height: 12 });
    const { default: LandingPage } = await import('@/app/landing/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(NewGameConfirmProvider, null, React.createElement(LandingPage)),
    );

    await waitFor(() => {
      const singleSection = div.querySelector('section[aria-label="Single player mode actions"]');
      expect(singleSection).not.toBeNull();
    });

    const singleSection = div.querySelector('section[aria-label="Single player mode actions"]')!;
    const singleButtons = Array.from(singleSection.querySelectorAll('button, a'));
    expect(singleButtons.some((el) => /Resume Game/i.test(el.textContent || ''))).toBe(true);
    expect(singleButtons.some((el) => /Start a new game/i.test(el.textContent || ''))).toBe(true);
    const singleResumeAnchor = singleButtons.find((el) => el.tagName === 'A') as
      | HTMLAnchorElement
      | undefined;
    expect(singleResumeAnchor?.getAttribute('href')).toBe('/single-player/sp-current-123');

    const scoreSection = div.querySelector(
      'section[aria-label="Open score card for in-person tallying"]',
    )!;
    const scoreButtons = Array.from(scoreSection.querySelectorAll('button, a'));
    expect(scoreButtons.some((el) => /Resume Score Card/i.test(el.textContent || ''))).toBe(true);
    expect(scoreButtons.some((el) => /Start a new score card/i.test(el.textContent || ''))).toBe(
      true,
    );
    const resumeAnchor = scoreButtons.find((el) => el.tagName === 'A') as
      | HTMLAnchorElement
      | undefined;
    expect(resumeAnchor?.getAttribute('href')).toBe('/scorecard/scorecard-789');

    root.unmount();
    div.remove();
  });

  it('routes to the active single player game when cancelling the new game confirmation', async () => {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'clubs', rank: 7 }] },
      trickPlays: [],
      currentGameId: 'sp-active-555',
    } as AppState['sp'];
    state.players = { a: 'Ava', b: 'Ben' } as AppState['players'];
    state.scores = { a: 3, b: 1 } as AppState['scores'];
    mockAppState(state, { height: 5 });

    const push = vi.fn();
    setMockRouter({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      forward: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
    });

    const confirmShow = vi.fn<(options?: unknown) => Promise<boolean>>().mockResolvedValue(false);
    setNewGameConfirm({ show: confirmShow });

    const { default: LandingPage } = await import('@/app/landing/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(NewGameConfirmProvider, null, React.createElement(LandingPage)),
    );

    const singleSection = await waitFor(() => {
      const section = div.querySelector('section[aria-label="Single player mode actions"]');
      expect(section).toBeTruthy();
      return section as HTMLElement;
    });

    const newGameButton = Array.from(singleSection.querySelectorAll('button')).find((btn) =>
      /Start a new game/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(newGameButton).toBeTruthy();

    newGameButton.click();

    await waitFor(() => {
      expect(confirmShow).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/single-player/sp-active-555');
    });

    root.unmount();
    div.remove();
  });

  it('renders recent games with mode, players, and resume', async () => {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    mockAppState(state, { height: 1 });
    setListGamesMock(async () => [
      {
        id: 'rec-1',
        title: 'Single Player Adventure',
        createdAt: 100,
        finishedAt: 200,
        lastSeq: 4,
        summary: {
          players: 3,
          scores: {},
          playersById: { a: 'Alice', b: 'Bot', c: 'Cara' },
          winnerId: null,
          winnerName: null,
          winnerScore: null,
          mode: 'single-player',
          sp: {
            phase: 'playing',
            roundNo: 3,
            dealerId: 'a',
            leaderId: 'a',
            order: ['a', 'b', 'c'],
            trump: null,
            trumpCard: null,
            trickCounts: {},
            trumpBroken: false,
          },
        },
        bundle: { latestSeq: 0, events: [] },
      },
    ]);
    const { default: LandingPage } = await import('@/app/landing/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(NewGameConfirmProvider, null, React.createElement(LandingPage)),
    );

    const recentRow = await waitFor(() => {
      const row = div.querySelector('[role="button"][aria-label^="Resume"]');
      expect(row).toBeTruthy();
      return row as HTMLElement;
    });
    expect(recentRow?.textContent || '').toMatch(/Single Player/);
    expect(recentRow?.textContent || '').toMatch(/Hand 3/);
    expect(recentRow?.textContent || '').toMatch(/3 players/);
    const resumeButton = recentRow?.querySelector('button');
    expect(resumeButton?.textContent || '').toMatch(/Resume/);

    root.unmount();
    div.remove();
  });

  it('shows empty copy without recents', async () => {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    mockAppState(state, { height: 0 });
    const { default: LandingPage } = await import('@/app/landing/page');
    const { NewGameConfirmProvider } = await import('@/components/dialogs/NewGameConfirm');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(NewGameConfirmProvider, null, React.createElement(LandingPage)),
    );

    await waitFor(() => {
      const text = div.textContent || '';
      expect(text).toMatch(/Your games will appear here\./i);
    });

    root.unmount();
    div.remove();
  });
});
