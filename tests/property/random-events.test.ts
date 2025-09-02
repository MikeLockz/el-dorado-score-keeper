import { describe, it, expect } from 'vitest';
import { reduce, INITIAL_STATE, type AppEvent, type AppState } from '@/lib/state/types';
import { createInstance } from '@/lib/state/instance';
import { makeTestDB } from '@/tests/utils/helpers';
import { exportBundle, importBundle } from '@/lib/state/io';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

// Simple deterministic PRNG (Mulberry32)
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const now = 1_700_000_000_000;
function ev<T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string): AppEvent {
  return makeEvent(type, payload, { eventId: id, ts: now });
}

function genEvents(seed: number, count: number) {
  const rnd = mulberry32(seed);
  const events: AppEvent[] = [];
  const players: string[] = [];
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const playerCount = 2 + Math.floor(rnd() * 4); // 2..5 players
  for (let i = 0; i < playerCount; i++) {
    const id = `p${i + 1}`;
    players.push(id);
    events.push(ev('player/added', { id, name: names[i] }, `seed${seed}-p${i}`));
  }
  let eid = 0;
  for (let i = 0; i < count; i++) {
    const choice = rnd();
    const pid = players[Math.floor(rnd() * players.length)];
    if (choice < 0.5) {
      const delta = Math.floor(rnd() * 11) - 5; // -5..+5
      events.push(ev('score/added', { playerId: pid, delta }, `seed${seed}-s${eid++}`));
    } else if (choice < 0.8) {
      const round = 1 + Math.floor(rnd() * 10);
      const bid = Math.floor(rnd() * 12); // over-range to test clamp
      events.push(ev('bid/set', { round, playerId: pid, bid }, `seed${seed}-b${eid++}`));
    } else if (choice < 0.95) {
      const round = 1 + Math.floor(rnd() * 10);
      const made = rnd() < 0.5;
      events.push(ev('made/set', { round, playerId: pid, made }, `seed${seed}-m${eid++}`));
    } else {
      const round = 1 + Math.floor(rnd() * 10);
      events.push(ev('round/finalize', { round }, `seed${seed}-f${eid++}`));
    }
  }
  return events;
}

function replay(events: AppEvent[], base: AppState = INITIAL_STATE) {
  return events.reduce((s, e) => reduce(s, e), base);
}

async function snapshotLowerBound(dbName: string, h: number): Promise<number> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(dbName);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(['snapshots'], 'readonly');
  const curReq = tx.objectStore('snapshots').openCursor(IDBKeyRange.upperBound(h), 'prev');
  const snapH = await new Promise<number>((res) => {
    curReq.onsuccess = () => {
      const c = curReq.result;
      if (!c) return res(0);
      res((c.value as any).height ?? 0);
    };
    curReq.onerror = () => res(0);
  });
  db.close();
  return snapH;
}

describe('property-like randomized checks', () => {
  it('incremental fold equals full replay; export/import preserves state', async () => {
    const seeds = [1, 2, 3, 42, 99];
    for (const seed of seeds) {
      const events = genEvents(seed, 120);
      const full = replay(events);
      let inc = INITIAL_STATE;
      for (const e of events) inc = reduce(inc, e);
      expect(inc).toEqual(full);

      const dbName = makeTestDB(`prop-${seed}`);
      const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
      for (const e of events) await inst.append(e);
      expect(inst.getHeight()).toBe(events.length);
      expect(inst.getState()).toEqual(full);

      const bundle = await exportBundle(dbName);
      inst.close();
      const dbName2 = `${dbName}-imp`;
      await importBundle(dbName2, bundle);
      const inst2 = await createInstance({ dbName: dbName2, channelName: `chan-${dbName2}` });
      expect(inst2.getHeight()).toBe(bundle.latestSeq);
      expect(inst2.getState()).toEqual(full);
      inst2.close();
    }
  });

  it('preview bounded by snapshot interval (<= 20 tail events)', async () => {
    const seed = 123;
    const events = genEvents(seed, 150);
    const dbName = `snap-${Math.random().toString(36).slice(2)}`;
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    for (const e of events) await inst.append(e);
    const H = inst.getHeight();
    inst.close();

    // pick a few random heights and assert snapshot lower bound is within 20
    const rnd = mulberry32(seed);
    for (let i = 0; i < 5; i++) {
      const h = Math.floor(rnd() * H);
      const lower = await snapshotLowerBound(dbName, h);
      expect(lower).toBeLessThanOrEqual(h);
      expect(h - lower).toBeLessThanOrEqual(20);
    }
  });
});
