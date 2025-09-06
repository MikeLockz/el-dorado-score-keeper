import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';
import {
  archiveCurrentGameAndReset,
  restoreGame,
  listGames,
  getGame,
  deleteGame,
  GAMES_DB_NAME,
  DEFAULT_DB_NAME,
} from '@/lib/state/io';

function makeDbName(prefix = 'arch') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('archive and restore flows', () => {
  it('archives current game and seeds roster; restore replaces state', async () => {
    const dbName = makeDbName();
    // Build a simple game
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    await inst.append(events.playerAdded({ id: 'p1', name: 'Alice' }));
    await inst.append(events.playerAdded({ id: 'p2', name: 'Bob' }));
    await inst.append(events.scoreAdded({ playerId: 'p1', delta: 5 }));
    await inst.append(events.scoreAdded({ playerId: 'p2', delta: 3 }));
    const endState = inst.getState();
    const endHeight = inst.getHeight();

    // Archive
    const rec = await archiveCurrentGameAndReset(dbName, { title: 'Match #1' });
    // There was content; record returned
    expect(rec).not.toBeNull();
    expect(rec!.id).toBeTypeOf('string');
    expect(rec!.lastSeq).toBe(endHeight);
    expect(rec!.summary.winnerId === 'p1' || rec!.summary.winnerId === 'p2').toBe(true);
    // SP snapshot present (default initial snapshot when no SP events)
    expect(rec!.summary.sp).toBeDefined();
    // Current DB is reset to roster only (seeded playerAdded per final roster)
    // Rehydrate to pick up DB changes in this process environment
    await inst.rehydrate();
    // Height may exceed seed count due to IDB autoincrement not resetting on clear.
    expect(inst.getHeight()).toBeGreaterThanOrEqual(2);
    const roster = Object.keys(inst.getState().players);
    expect(roster.length).toBe(2);
    // Scores should be reset/empty
    const scores = inst.getState().scores;
    expect(
      Object.keys(scores).length === 0 || roster.every((id) => (scores as any)[id] === 0),
    ).toBe(true);

    // listGames returns the archive
    const games = await listGames(GAMES_DB_NAME);
    expect(games.length).toBe(1);
    expect(games[0]!.id).toBe(rec!.id);

    // Restore from archive and verify state matches archived end state
    await restoreGame(dbName, rec!.id);
    await inst.rehydrate();
    expect(inst.getHeight()).toBe(rec!.lastSeq);
    expect(inst.getState()).toEqual(endState);

    // getGame returns record; deleteGame removes it
    const got = await getGame(GAMES_DB_NAME, rec!.id);
    expect(got?.id).toBe(rec!.id);
    await deleteGame(GAMES_DB_NAME, rec!.id);
    const gamesAfter = await listGames(GAMES_DB_NAME);
    expect(gamesAfter.length).toBe(0);

    inst.close();
  });

  it('archive with empty DB returns null and resets DB', async () => {
    const dbName = makeDbName('empty');
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    expect(inst.getHeight()).toBe(0);
    const rec = await archiveCurrentGameAndReset(dbName);
    expect(rec).toBeNull();
    // Still reset state; height 0 and empty roster
    expect(inst.getHeight()).toBe(0);
    expect(Object.keys(inst.getState().players).length).toBe(0);
    inst.close();
  });
});
