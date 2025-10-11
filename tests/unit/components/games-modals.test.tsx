import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import RestoreGameModal from '@/app/games/[gameId]/@modal/restore/page';
import DeleteGameModal from '@/app/games/[gameId]/@modal/delete/page';
import { INITIAL_STATE, type AppState, type GameRecord } from '@/lib/state';
import * as stateIo from '@/lib/state/io';
import * as analytics from '@/lib/observability/events';

const setMockParams = (globalThis as any).__setMockParams as (
  params: Record<string, string>,
) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (
  router: ReturnType<typeof createRouterStub>,
) => void;
const setRestoreGameMock = (globalThis as any).__setRestoreGameMock as (fn: any) => void;
const setDeleteGameMock = (globalThis as any).__setDeleteGameMock as (fn: any) => void;
const setMockAppState = (globalThis as any).__setMockAppState as (
  value: ReturnType<(typeof import('@/components/state-provider'))['useAppState']>,
) => void;

function createRouterStub() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  };
}

const sampleGame: GameRecord = {
  id: 'game-123',
  title: 'Championship Match',
  createdAt: Date.now() - 10_000,
  finishedAt: Date.now(),
  lastSeq: 8,
  summary: {
    players: 2,
    scores: { p1: 10, p2: 7 },
    playersById: { p1: 'Alice', p2: 'Bob' },
    winnerId: 'p1',
    winnerName: 'Alice',
    winnerScore: 10,
    mode: 'single-player',
    scorecard: { activeRound: null },
    sp: {
      phase: 'playing',
      roundNo: 1,
      dealerId: 'p1',
      leaderId: 'p2',
      order: ['p1', 'p2'],
      trump: 'hearts',
      trumpCard: { suit: 'hearts', rank: 10 },
      trickCounts: {},
      trumpBroken: false,
    },
  },
  bundle: { latestSeq: 8, events: [] },
};

describe('archived game modals', () => {
  beforeEach(() => {
    setMockParams({ gameId: 'game-123' });
    const baseState = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    baseState.sp = {
      ...baseState.sp,
      phase: 'playing',
      currentGameId: 'game-123',
    } as AppState['sp'];
    setMockAppState({
      state: baseState,
      height: 10,
      ready: true,
      append: async () => 0,
      appendMany: async () => 0,
      isBatchPending: false,
      previewAt: async () => baseState,
      warnings: [],
      clearWarnings: () => {},
      timeTravelHeight: null,
      setTimeTravelHeight: () => {},
      timeTraveling: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores an archived game and tracks analytics', async () => {
    const router = createRouterStub();
    setMockRouter(router);
    const restoreMock = vi.fn(async () => undefined);
    setRestoreGameMock(restoreMock);
    const getGameSpy = vi.spyOn(stateIo, 'getGame').mockResolvedValue(sampleGame);
    const trackRestoreSpy = vi.spyOn(analytics, 'trackArchivedGameRestored');

    render(<RestoreGameModal />);

    await waitFor(() => expect(screen.getByText('Restore archived game?')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Restore game' }));

    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith(undefined, 'game-123'));

    expect(trackRestoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-123',
        mode: 'single-player',
        source: 'games.modal.restore',
      }),
    );
    expect(router.replace).toHaveBeenCalledWith('/single-player/game-123');

    getGameSpy.mockRestore();
  });

  it('deletes an archived game and tracks analytics', async () => {
    const router = createRouterStub();
    setMockRouter(router);
    const deleteMock = vi.fn(async () => undefined);
    setDeleteGameMock(deleteMock);
    const getGameSpy = vi.spyOn(stateIo, 'getGame').mockResolvedValue(sampleGame);
    const trackDeleteSpy = vi.spyOn(analytics, 'trackArchivedGameDeleted');

    render(<DeleteGameModal />);

    await waitFor(() => expect(screen.getByText('Delete archived game?')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Delete game' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(undefined, 'game-123'));

    expect(trackDeleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-123',
        mode: 'single-player',
        source: 'games.modal.delete',
      }),
    );
    expect(router.replace).toHaveBeenCalledWith('/games');

    getGameSpy.mockRestore();
  });
});
