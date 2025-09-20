import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SP First-Run Modal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows setup UI when no SP roster exists and clones Score Card', async () => {
    const appendMany = vi.fn(async () => {});
    const state: MockAppStateHook['state'] = {
      players: { p1: 'A', p2: 'B' },
      scores: {},
      rounds: {},
      rosters: {
        rsc: {
          name: 'Score Card',
          playersById: { p1: 'A', p2: 'B' },
          displayOrder: { p1: 0, p2: 1 },
          type: 'scorecard',
          createdAt: 1,
        },
      },
      activeScorecardRosterId: 'rsc',
      activeSingleRosterId: null,
      humanByMode: {},
      sp: {
        phase: 'setup',
        roundNo: null,
        dealerId: null,
        order: [],
        trump: null,
        trumpCard: null,
        hands: {},
        trickPlays: [],
        trickCounts: {},
        trumpBroken: false,
        leaderId: null,
        reveal: null,
        handPhase: 'idle',
        lastTrickSnapshot: null,
        sessionSeed: null,
      },
      display_order: {},
    };
    setMockAppState({
      state,
      appendMany,
      append: vi.fn(),
      ready: true,
      height: 0,
      isBatchPending: false,
      previewAt: async () => state,
      warnings: [],
      clearWarnings: () => {},
      timeTravelHeight: null,
      setTimeTravelHeight: () => {},
      timeTraveling: false,
    });
    const { default: Page } = await import('@/app/single-player/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(Page));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Should render the first-run UI
    const text = div.textContent || '';
    expect(text).toMatch(/Set up Single Player/i);
    const btn = Array.from(div.querySelectorAll('button')).find((b) =>
      /Use Score Card players/i.test(b.textContent || ''),
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(appendMany).toHaveBeenCalled();

    root.unmount();
    div.remove();
  });
});
