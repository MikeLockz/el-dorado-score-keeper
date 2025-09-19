import { describe, it, expect } from 'vitest';
import { listGames, GAMES_DB_NAME } from '@/lib/state/io';
import { storeNames } from '@/lib/state/db';

function makeDbName(prefix = 'glf') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function seedGamesDbWithoutIndex(name: string) {
  // Create a v2 DB with a games store but WITHOUT the 'createdAt' index.
  const open = indexedDB.open(name, 2);
  open.onupgradeneeded = () => {
    const db = open.result;
    // minimal schema for games only; no index
    if (!(db.objectStoreNames as DOMStringList).contains(storeNames.GAMES)) {
      db.createObjectStore(storeNames.GAMES, { keyPath: 'id' });
    }
  };
  await new Promise<void>((res, rej) => {
    open.onsuccess = () => res();
    open.onerror = () => rej(open.error);
  });
  const db = open.result;
  // Insert a couple of records out of order by createdAt to verify manual sort
  const tx = db.transaction([storeNames.GAMES], 'readwrite');
  const store = tx.objectStore(storeNames.GAMES);
  store.put({
    id: 'a',
    title: 'A',
    createdAt: 100,
    finishedAt: 200,
    lastSeq: 1,
    summary: {
      players: 0,
      scores: {},
      playersById: {},
      winnerId: null,
      winnerName: null,
      winnerScore: null,
      mode: 'scorecard',
      scorecard: { activeRound: null },
      sp: {
        phase: 'setup',
        roundNo: null,
        dealerId: null,
        leaderId: null,
        order: [],
        trump: null,
        trumpCard: null,
        trickCounts: {},
        trumpBroken: false,
      },
    },
    bundle: { latestSeq: 1, events: [] },
  });
  store.put({
    id: 'b',
    title: 'B',
    createdAt: 300,
    finishedAt: 400,
    lastSeq: 1,
    summary: {
      players: 0,
      scores: {},
      playersById: {},
      winnerId: null,
      winnerName: null,
      winnerScore: null,
      mode: 'scorecard',
      scorecard: { activeRound: null },
      sp: {
        phase: 'setup',
        roundNo: null,
        dealerId: null,
        leaderId: null,
        order: [],
        trump: null,
        trumpCard: null,
        trickCounts: {},
        trumpBroken: false,
      },
    },
    bundle: { latestSeq: 1, events: [] },
  });
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

describe('listGames without createdAt index', () => {
  it('falls back to cursor and sorts by createdAt desc', async () => {
    const gamesDb = makeDbName();
    await seedGamesDbWithoutIndex(gamesDb);
    const out = await listGames(gamesDb);
    expect(out.map((g) => g.id)).toEqual(['b', 'a']);
  });
});
