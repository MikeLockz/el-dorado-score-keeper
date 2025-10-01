import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';

import type { AppState, RoundData } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;

function cloneState<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function createDefaultMockContext(): MockAppStateHook {
  const state = cloneState(INITIAL_STATE);
  return {
    state,
    height: 0,
    ready: true,
    append: vi.fn(async () => 0),
    appendMany: vi.fn(async () => 0),
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: () => {},
    timeTravelHeight: null,
    setTimeTravelHeight: () => {},
    timeTraveling: false,
  } as MockAppStateHook;
}

const mockBatch = [{ type: 'sp/trick/cleared', payload: {} }];

const append = vi.fn(async () => undefined);
const appendMany = vi.fn(async () => undefined);

const rosterId = 'roster-desktop';

const makeDesktopState = (): AppState => {
  const rounds: Record<number, RoundData> = {};
  for (let r = 0; r <= 10; r++) {
    rounds[r] = { state: 'locked', bids: {}, made: {} };
  }
  rounds[0] = {
    state: 'playing',
    bids: { human: 2, bot1: 1 },
    made: { human: null, bot1: null },
  };

  return {
    players: { human: 'Alice H', bot1: 'Bot Bob' },
    playerDetails: {
      human: {
        name: 'Alice H',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      bot1: {
        name: 'Bot Bob',
        type: 'bot',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    },
    scores: { human: 12, bot1: 4 },
    rounds,
    rosters: {
      [rosterId]: {
        name: 'Desktop Test',
        playersById: { human: 'Alice H', bot1: 'Bot Bob' },
        playerTypesById: { human: 'human', bot1: 'bot' },
        displayOrder: { human: 0, bot1: 1 },
        type: 'single',
        createdAt: 0,
        archivedAt: null,
      },
    },
    activeScorecardRosterId: null,
    activeSingleRosterId: rosterId,
    humanByMode: { single: 'human' },
    sp: {
      phase: 'playing',
      roundNo: 0,
      dealerId: 'bot1',
      order: ['bot1', 'human'],
      trump: 'spades',
      trumpCard: { suit: 'spades', rank: 14 },
      hands: {
        human: [
          { suit: 'spades', rank: 14 },
          { suit: 'hearts', rank: 13 },
        ],
        bot1: [{ suit: 'spades', rank: 13 }],
      },
      trickPlays: [],
      trickCounts: { human: 1, bot1: 0 },
      trumpBroken: false,
      leaderId: 'bot1',
      reveal: null,
      handPhase: 'idle',
      lastTrickSnapshot: null,
      summaryEnteredAt: null,
      sessionSeed: 321,
    },
    display_order: { human: 0, bot1: 1 },
  } satisfies AppState;
};

let stateRef: AppState = makeDesktopState();

vi.mock('@/lib/single-player', async () => ({
  computeAdvanceBatch: vi.fn(() => mockBatch),
  bots: {
    botBid: vi.fn(() => 1),
    botPlay: vi.fn(() => ({ suit: 'clubs', rank: 2 })),
  },
}));

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SinglePlayerDesktop view', () => {
  let container: HTMLDivElement | null = null;
  let root: ReactDOM.Root | null = null;
  let mockContext: MockAppStateHook;

  beforeEach(() => {
    append.mockClear();
    appendMany.mockClear();
    stateRef = makeDesktopState();
    mockContext = {
      state: stateRef,
      height: 480,
      append,
      appendMany,
      isBatchPending: false,
      ready: true,
      previewAt: async () => stateRef,
      warnings: [],
      clearWarnings: () => {},
      timeTravelHeight: null,
      setTimeTravelHeight: () => {},
      timeTraveling: false,
    } as MockAppStateHook;
    setMockAppState(mockContext);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    if (root) root.unmount();
    if (container) container.remove();
    container = null;
    root = null;
    setMockAppState(createDefaultMockContext());
  });

  it('renders desktop overview and routes actions through shared view model', async () => {
    const { default: SinglePlayerDesktop } = await import('@/components/views/SinglePlayerDesktop');

    root!.render(<SinglePlayerDesktop humanId="human" rng={() => 0.42} />);
    await waitFor(() => {
      const textContent = container!.textContent ?? '';
      expect(textContent).toMatch(/Single Player/);
      expect(textContent).toMatch(/Round 1/);
      expect(textContent).toMatch(/Round Overview/);
    });

    const buttons = Array.from(container!.querySelectorAll('button')) as HTMLButtonElement[];
    const text = container!.textContent ?? '';
    expect(text).toMatch(/Broken: No/);
    expect(append).not.toHaveBeenCalled();

    const cta = buttons.find((btn) =>
      /(Continue|Next Hand|Next Round|New Game)/i.test(btn.textContent ?? ''),
    );
    expect(cta).toBeTruthy();
    cta!.click();
    await Promise.resolve();
    expect(appendMany).toHaveBeenCalled();
    expect(appendMany.mock.calls[0]?.[0]).toBe(mockBatch);
  });
});
