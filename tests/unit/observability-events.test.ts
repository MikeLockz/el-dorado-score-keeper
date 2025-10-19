import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/observability/browser', () => ({
  trackBrowserEvent: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  uuid: vi.fn(() => 'uuid-mock'),
}));

import * as analyticsEvents from '@/lib/observability/events';
import { trackBrowserEvent } from '@/lib/observability/browser';
import { uuid } from '@/lib/utils';

const trackBrowserEventMock = trackBrowserEvent as unknown as vi.Mock;
const uuidMock = uuid as unknown as vi.Mock;

const originalWindow = (globalThis as { window?: Window }).window;
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

const {
  trackGameStarted,
  trackPlayersAdded,
  trackRoundFinalized,
  applyRoundAnalyticsFromEvents,
  getCurrentGameId,
  clearGameSessionId,
  markRoundStart,
  trackSinglePlayerView,
  trackScorecardView,
  trackPlayersView,
  trackPlayerDetailView,
  trackRostersView,
  trackRosterDetailView,
  trackGamesListView,
  trackGameDetailView,
  trackSinglePlayerNewView,
} = analyticsEvents;

beforeEach(() => {
  trackBrowserEventMock.mockClear();
  uuidMock.mockReset();
  uuidMock.mockReturnValue('uuid-1');
  clearGameSessionId();
  const storage = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => (storage.has(key) ? storage.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => storage.clear()),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    get length() {
      return storage.size;
    },
  } as unknown as Storage;

  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: localStorageMock,
  } as Window;
  (globalThis as unknown as { localStorage?: Storage }).localStorage = localStorageMock;
  localStorageMock.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  if (originalWindow) {
    (globalThis as any).window = originalWindow;
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  if (originalLocalStorage) {
    (globalThis as any).localStorage = originalLocalStorage;
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

describe('trackGameStarted', () => {
  it('stores session id and emits payload', () => {
    trackGameStarted({
      mode: 'scorecard',
      playerCount: 4,
      source: 'test',
      hasExistingProgress: true,
    });

    expect(trackBrowserEventMock).toHaveBeenCalledTimes(1);
    expect(trackBrowserEventMock).toHaveBeenCalledWith(
      'game.started',
      expect.objectContaining({
        game_id: 'uuid-1',
        mode: 'scorecard',
        player_count: 4,
        source: 'test',
        has_existing_progress: true,
      }),
    );
    expect(getCurrentGameId()).toBe('uuid-1');
  });

  it('updates session id on subsequent calls', () => {
    uuidMock.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');

    trackGameStarted({ mode: 'scorecard', playerCount: 4 });
    trackBrowserEventMock.mockClear();
    trackGameStarted({ mode: 'single-player', playerCount: 2 });

    expect(getCurrentGameId()).toBe('uuid-2');
    expect(trackBrowserEventMock).toHaveBeenCalledWith(
      'game.started',
      expect.objectContaining({ game_id: 'uuid-2', mode: 'single-player' }),
    );
  });
});

describe('trackPlayersAdded', () => {
  beforeEach(() => {
    trackGameStarted({ mode: 'scorecard', playerCount: 4 });
    trackBrowserEventMock.mockClear();
  });

  it('emits event when game id present', () => {
    trackPlayersAdded({
      addedCount: 2,
      totalPlayers: 6,
      inputMethod: 'manual',
      source: 'unit-test',
      mode: 'scorecard',
    });

    expect(trackBrowserEventMock).toHaveBeenCalledTimes(1);
    expect(trackBrowserEventMock).toHaveBeenCalledWith(
      'players.added',
      expect.objectContaining({
        game_id: 'uuid-1',
        added_count: 2,
        total_players: 6,
        input_method: 'manual',
        source: 'unit-test',
        mode: 'scorecard',
      }),
    );
  });

  it('skips emission when missing game id', () => {
    clearGameSessionId();
    trackBrowserEventMock.mockClear();

    trackPlayersAdded({ addedCount: 1, totalPlayers: 5, inputMethod: 'manual' });

    expect(trackBrowserEventMock).not.toHaveBeenCalled();
  });
});

describe('trackRoundFinalized', () => {
  beforeEach(() => {
    trackGameStarted({ mode: 'scorecard', playerCount: 4 });
    trackBrowserEventMock.mockClear();
  });

  it('derives duration from marked start time', () => {
    markRoundStart(2);
    vi.advanceTimersByTime(5000);

    trackRoundFinalized({
      roundNumber: 2,
      scoringVariant: 'scorecard',
      playerCount: 4,
      source: 'unit-test',
    });

    expect(trackBrowserEventMock).toHaveBeenCalledWith(
      'round.finalized',
      expect.objectContaining({
        game_id: 'uuid-1',
        round_number: 2,
        scoring_variant: 'scorecard',
        player_count: 4,
        duration_seconds: 5,
        source: 'unit-test',
      }),
    );
  });
});

describe('applyRoundAnalyticsFromEvents', () => {
  beforeEach(() => {
    trackGameStarted({ mode: 'single-player', playerCount: 3 });
    trackBrowserEventMock.mockClear();
  });

  it('marks bidding rounds and emits finalize analytics', () => {
    const events = [
      { type: 'round/state-set', payload: { round: 3, state: 'bidding' } },
      { type: 'round/finalize', payload: { round: 3 } },
      { type: 'round/finalize', payload: { round: 3 } },
    ];

    applyRoundAnalyticsFromEvents(events, {
      mode: 'single-player',
      playerCount: 3,
      source: 'batch-test',
    });

    expect(trackBrowserEventMock).toHaveBeenCalledWith(
      'round.finalized',
      expect.objectContaining({
        scoring_variant: 'single-player',
        source: 'batch-test',
      }),
    );
  });
});

describe('view instrumentation', () => {
  beforeEach(() => {
    trackBrowserEventMock.mockClear();
  });

  it('emits single-player view when id present', () => {
    trackSinglePlayerView({ gameId: 'game-123', view: 'summary', source: 'unit-test' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('single-player.viewed', {
      game_id: 'game-123',
      view: 'summary',
      source: 'unit-test',
    });
  });

  it('emits scorecard view events with view name', () => {
    trackScorecardView({ scorecardId: 'score-1', view: 'summary' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('scorecard.viewed', {
      scorecard_id: 'score-1',
      view: 'summary',
      source: 'route',
    });
  });

  it('emits players list view', () => {
    trackPlayersView({ filter: 'archived', source: 'unit' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('players.viewed', {
      filter: 'archived',
      source: 'unit',
    });
  });

  it('emits player detail view with archive flag', () => {
    trackPlayerDetailView({ playerId: 'p-1', archived: true });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('player.detail.viewed', {
      player_id: 'p-1',
      archived: true,
      source: 'route',
    });
  });

  it('emits roster detail view', () => {
    trackRosterDetailView({ rosterId: 'r-1', archived: false, source: 'unit' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('roster.detail.viewed', {
      roster_id: 'r-1',
      archived: false,
      source: 'unit',
    });
  });

  it('emits games list view', () => {
    trackGamesListView();
    expect(trackBrowserEventMock).toHaveBeenCalledWith('games.list.viewed', {
      source: 'route',
    });
  });

  it('emits game detail view with id', () => {
    trackGameDetailView({ gameId: 'g-123', source: 'modal-test' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('game.detail.viewed', {
      game_id: 'g-123',
      source: 'modal-test',
    });
  });

  it('emits new single-player page view with progress flag', () => {
    trackSinglePlayerNewView({ hasProgress: true, source: 'unit' });
    expect(trackBrowserEventMock).toHaveBeenCalledWith('single-player.new.viewed', {
      has_progress: true,
      source: 'unit',
    });
  });

  it('skips events when identifiers missing', () => {
    trackBrowserEventMock.mockClear();
    trackSinglePlayerView({ gameId: '', view: 'live' });
    trackScorecardView({ scorecardId: '', view: 'live' });
    trackPlayerDetailView({ playerId: null });
    trackRosterDetailView({ rosterId: undefined });
    trackGameDetailView({ gameId: '   ' });
    expect(trackBrowserEventMock).not.toHaveBeenCalled();
  });
});
