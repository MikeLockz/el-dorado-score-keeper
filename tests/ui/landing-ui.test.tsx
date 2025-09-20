import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';
import type { GameRecord } from '@/lib/state/io';

const suite = typeof document === 'undefined' ? describe.skip : describe;

const noop = () => {};

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setListGamesMock = (globalThis as any).__setListGamesMock as (
  fn: () => Promise<GameRecord[]>,
) => void;

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
    };
    state.players = { a: 'Alice', b: 'Bob' } as AppState['players'];
    state.scores = { a: 5, b: 0 } as AppState['scores'];
    state.rounds[1] = {
      ...state.rounds[1],
      state: 'bidding',
      bids: { a: 2 },
      made: { a: null },
    };
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

    const scoreSection = div.querySelector(
      'section[aria-label="Open score card for in-person tallying"]',
    )!;
    const scoreButtons = Array.from(scoreSection.querySelectorAll('button, a'));
    expect(scoreButtons.some((el) => /Resume Score Card/i.test(el.textContent || ''))).toBe(true);
    expect(scoreButtons.some((el) => /Start a new score card/i.test(el.textContent || ''))).toBe(
      true,
    );

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
