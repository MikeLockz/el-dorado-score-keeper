import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import type { AppState, RoundData } from '@/lib/state/types';

const append = vi.fn(async () => undefined);
const appendMany = vi.fn(async () => undefined);

const rosterId = 'responsive-roster';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;

const createState = (): AppState => {
  const rounds: Record<number, RoundData> = {};
  for (let r = 0; r <= 10; r++) rounds[r] = { state: 'locked', bids: {}, made: {} };
  rounds[0] = {
    state: 'playing',
    bids: { human: 1, bot1: 0 },
    made: { human: null, bot1: null },
  };
  return {
    players: { human: 'Human Player', bot1: 'Bot Alpha' },
    playerDetails: {},
    scores: { human: 5, bot1: 2 },
    rounds,
    rosters: {
      [rosterId]: {
        name: 'Responsive',
        playersById: { human: 'Human Player', bot1: 'Bot Alpha' },
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
      trickCounts: { human: 0, bot1: 0 },
      trumpBroken: false,
      leaderId: 'bot1',
      reveal: null,
      handPhase: 'idle',
      lastTrickSnapshot: null,
      summaryEnteredAt: null,
      sessionSeed: 42,
    },
    display_order: { human: 0, bot1: 1 },
  } satisfies AppState;
};

let stateRef: AppState = createState();

const originalMatchMedia = typeof window !== 'undefined' ? window.matchMedia : undefined;

const installMatchMedia = (matches: boolean) => {
  if (typeof window === 'undefined') return;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList: MediaQueryList = {
    matches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: (_event: string, listener: (ev: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: (ev: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (_listener: (ev: MediaQueryListEvent) => void) => {
      /* legacy no-op */
    },
    removeListener: (_listener: (ev: MediaQueryListEvent) => void) => {
      /* legacy no-op */
    },
    dispatchEvent: (event: MediaQueryListEvent) => {
      listeners.forEach((listener) => listener(event));
      return true;
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQueryList),
  });
};

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SinglePlayerPage responsive selection', () => {
  let container: HTMLDivElement | null = null;
  let root: ReactDOM.Root | null = null;

  beforeEach(() => {
    append.mockClear();
    appendMany.mockClear();
    stateRef = createState();
    setMockAppState({
      state: stateRef,
      append,
      appendMany,
      isBatchPending: false,
      ready: true,
      height: 600,
      previewAt: async () => stateRef,
      warnings: [],
      clearWarnings: () => {},
      timeTravelHeight: null,
      setTimeTravelHeight: () => {},
      timeTraveling: false,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    if (root) root.unmount();
    if (container) container.remove();
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    } else {
      delete (window as any).matchMedia;
    }
    container = null;
    root = null;
  });

  it('renders desktop view when media query matches', async () => {
    installMatchMedia(true);
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    root!.render(<SinglePlayerPage />);
    await waitFor(() => {
      const roundOverview = container!.querySelector('[aria-label="Round overview"]');
      expect(roundOverview).not.toBeNull();
      expect(container!.textContent).toMatch(/Single Player/);
    });
  });

  it('defaults to mobile view without matchMedia support', async () => {
    delete (window as any).matchMedia;
    const { default: SinglePlayerPage } = await import('@/app/single-player/page');
    root!.render(<SinglePlayerPage />);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const roundOverview = container!.querySelector('[aria-label="Round overview"]');
    expect(roundOverview).toBeNull();
    expect(container!.textContent).toMatch(/Details/);
  });
});
