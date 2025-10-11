import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppState } from '@/lib/state';
import { INITIAL_STATE } from '@/lib/state';

const setMockAppState = (globalThis as any).__setMockAppState as (
  value: ReturnType<(typeof import('@/components/state-provider'))['useAppState']>,
) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (
  router: ReturnType<typeof createRouterStub>,
) => void;

const stateModule = await import('@/lib/state');
const { PlayerStatisticsView } = await import(
  '@/app/players/[playerId]/statistics/PlayerStatisticsView'
);

const loadPlayerStatisticsSummaryMock = vi.spyOn(
  stateModule,
  'loadPlayerStatisticsSummary',
);
type PlayerStatisticsSummaryPromise = ReturnType<
  typeof stateModule.loadPlayerStatisticsSummary
>;

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

function cloneState<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function createRouterStub() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAppState(stateOverrides?: Partial<AppState>): MockAppStateHook {
  const state = cloneState(INITIAL_STATE) as AppState;
  if (stateOverrides) {
    Object.assign(state, stateOverrides);
  }
  const context: MockAppStateHook = {
    state,
    ready: true,
    height: 0,
    append: vi.fn(async () => 0),
    appendMany: vi.fn(async () => 0),
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: () => {},
    timeTravelHeight: null,
    setTimeTravelHeight: () => {},
    timeTraveling: false,
    context: { mode: null, gameId: null, scorecardId: null },
  };
  return context;
}

function buildStateWithPlayer(): AppState {
  const state = cloneState(INITIAL_STATE) as AppState;
  state.players = { p1: 'Alice' };
  state.playerDetails = {
    p1: {
      name: 'Alice',
      type: 'human',
      archived: false,
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
    },
  };
  state.display_order = { p1: 0 };
  return state;
}

describe('PlayerStatisticsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPlayerStatisticsSummaryMock.mockReset();
    setMockRouter(createRouterStub());
  });

  afterEach(() => {
    loadPlayerStatisticsSummaryMock.mockReset();
  });

  it('renders skeleton placeholders while loading statistics', async () => {
    const state = buildStateWithPlayer();
    setMockAppState(createMockAppState(state));

    let resolveSummary!: (value: Awaited<PlayerStatisticsSummaryPromise>) => void;
    const summaryPromise = new Promise<Awaited<PlayerStatisticsSummaryPromise>>((resolve) => {
      resolveSummary = resolve;
    });
    loadPlayerStatisticsSummaryMock.mockReturnValue(
      summaryPromise as PlayerStatisticsSummaryPromise,
    );

    render(<PlayerStatisticsView playerId="p1" />);

    expect(loadPlayerStatisticsSummaryMock).toHaveBeenCalledWith({ playerId: 'p1' });
    expect(screen.getByText(/Primary metrics/i)).toBeTruthy();
    expect(
      screen.queryByText(/Primary statistics will appear here once calculations are connected/i),
    ).toBeNull();

    resolveSummary(
      stateModule.createEmptyPlayerStatisticsSummary('p1'),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Primary statistics will appear here once calculations are connected/i),
      ).toBeTruthy();
    });
  });

  it('shows an error card when statistics fail to load', async () => {
    const state = buildStateWithPlayer();
    setMockAppState(createMockAppState(state));
    loadPlayerStatisticsSummaryMock.mockRejectedValue(new Error('boom'));

    render(<PlayerStatisticsView playerId="p1" />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load statistics/i)).toBeTruthy();
      expect(screen.getByText(/boom/i)).toBeTruthy();
    });
  });

  it('renders the empty state when no players exist', () => {
    const state = cloneState(INITIAL_STATE) as AppState;
    state.players = {};
    state.playerDetails = {};
    setMockAppState(createMockAppState(state));

    render(<PlayerStatisticsView playerId="" />);

    expect(screen.getByText(/No players yet/i)).toBeTruthy();
    expect(loadPlayerStatisticsSummaryMock).not.toHaveBeenCalled();
  });
});
