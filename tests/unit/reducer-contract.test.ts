import { describe, it, expect } from 'vitest';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { roundDelta } from '@/lib/state/logic';
import { payloadSchemas, validateEventStrict } from '@/lib/state/validation';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>) =>
  makeEvent(type, payload, { ts: now, eventId: `${type}-${JSON.stringify(payload)}` });

describe('reducer contract: payload schemas', () => {
  it('has a schema for each event type used by reducer', () => {
    const types = Object.keys(payloadSchemas);
    // sanity: ensure we didn't forget to cover a new type
    expect(types.sort()).toEqual(
      [
        'roster/activated',
        'roster/created',
        'roster/player/added',
        'roster/player/removed',
        'roster/player/renamed',
        'roster/player/type-set',
        'roster/players/reordered',
        'roster/renamed',
        'roster/reset',
        'roster/archived',
        'roster/restored',
        'bid/set',
        'made/set',
        'player/added',
        'player/dropped',
        'player/restored',
        'player/removed',
        'player/renamed',
        'player/type-set',
        'player/resumed',
        'players/reordered',
        'round/finalize',
        'round/state-set',
        'score/added',
        // single-player runtime
        'sp/reset',
        'sp/deal',
        'sp/phase-set',
        'sp/trick/played',
        'sp/trick/cleared',
        'sp/trick/reveal-set',
        'sp/trick/reveal-clear',
        'sp/trump-broken-set',
        'sp/leader-set',
        'sp/summary-entered-set',
        'sp/round-tally-set',
        'sp/seed-set',
      ].sort(),
    );
  });

  describe('player/added', () => {
    it('accepts valid payload and updates players', () => {
      const payload = { id: 'p1', name: 'Alice', type: 'bot' as const };
      const parsed = payloadSchemas['player/added'].safeParse(payload);
      expect(parsed.success).toBe(true);
      const e = validateEventStrict(ev('player/added', payload));
      const s = reduce(INITIAL_STATE, e);
      expect(s.players.p1).toBe('Alice');
      expect(s.playerDetails.p1?.type).toBe('bot');
      expect(s.playerDetails.p1?.archived).toBe(false);
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { id: '', name: '' },
        { id: 123 as any, name: 'A' },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('player/added', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('player/renamed', () => {
    it('accepts valid payload and renames an existing player', () => {
      const eAdd = validateEventStrict(ev('player/added', { id: 'p1', name: 'Old' }));
      const eRename = validateEventStrict(ev('player/renamed', { id: 'p1', name: 'New' }));
      let s: AppState = reduce(INITIAL_STATE, eAdd);
      s = reduce(s, eRename);
      expect(s.players.p1).toBe('New');
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { id: '', name: '' },
        { id: 'p1', name: '' },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('player/renamed', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('player/removed', () => {
    it('accepts valid payload and removes player data', () => {
      const eAdd = validateEventStrict(ev('player/added', { id: 'p2', name: 'Bob' }));
      const eRem = validateEventStrict(ev('player/removed', { id: 'p2' }));
      let s: AppState = reduce(INITIAL_STATE, eAdd);
      s = reduce(s, eRem);
      expect(s.players.p2).toBeUndefined();
      expect(s.playerDetails.p2?.archivedAt).toBeTypeOf('number');
      expect(s.playerDetails.p2?.archived).toBe(true);
    });
    it('rejects invalid payloads', () => {
      const invalids = [{ id: '' }, {}];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('player/removed', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('score/added', () => {
    it('accepts valid payload and adjusts score', () => {
      const e = validateEventStrict(ev('score/added', { playerId: 'p3', delta: 3 }));
      const s = reduce(INITIAL_STATE, e);
      expect(s.scores.p3).toBe(3);
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { playerId: 'p1', delta: Number.POSITIVE_INFINITY },
        { playerId: 1 as any, delta: 3 },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('score/added', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('round/state-set', () => {
    it('accepts valid payload and sets state for round', () => {
      const e = validateEventStrict(ev('round/state-set', { round: 2, state: 'bidding' }));
      const s = reduce(INITIAL_STATE, e);
      expect(s.rounds[2].state).toBe('bidding');
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { round: -1, state: 'bidding' },
        { round: 1, state: 'not-a-state' as any },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('round/state-set', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('bid/set', () => {
    it('accepts valid payload and records bid (clamped separately by logic)', () => {
      const e = validateEventStrict(ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }));
      const s = reduce(INITIAL_STATE, e);
      expect(s.rounds[1].bids.p1).toBe(2);
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { round: 1.2, playerId: 'p1', bid: 2 },
        { round: 1, playerId: 'p1', bid: -1 },
        { round: 1, playerId: 'p1', bid: 1.3 },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('bid/set', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('made/set', () => {
    it('accepts valid payload and records outcome', () => {
      const e = validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: true }));
      const s = reduce(INITIAL_STATE, e);
      expect(s.rounds[1].made.p1).toBe(true);
    });
    it('allows clearing outcome with null', () => {
      const eTrue = validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: true }));
      const eClear = validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: null }));
      let s = reduce(INITIAL_STATE, eTrue);
      s = reduce(s, eClear);
      expect(s.rounds[1].made.p1).toBeNull();
    });
    it('rejects invalid payloads', () => {
      const invalids = [
        { round: -2, playerId: 'p1', made: false },
        { round: 1, playerId: 'p1', made: 'yes' as any },
      ];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('made/set', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });

  describe('round/finalize', () => {
    it('accepts valid payload and finalizes/scored round, advances next', () => {
      const eAdd1 = validateEventStrict(ev('player/added', { id: 'p1', name: 'A' }));
      const eAdd2 = validateEventStrict(ev('player/added', { id: 'p2', name: 'B' }));
      const eBid1 = validateEventStrict(ev('bid/set', { round: 1, playerId: 'p1', bid: 1 }));
      const eBid2 = validateEventStrict(ev('bid/set', { round: 1, playerId: 'p2', bid: 0 }));
      const eMade1 = validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: true }));
      const eMade2 = validateEventStrict(ev('made/set', { round: 1, playerId: 'p2', made: false }));
      const eFin = validateEventStrict(ev('round/finalize', { round: 1 }));
      let s: AppState = INITIAL_STATE;
      for (const e of [eAdd1, eAdd2, eBid1, eBid2, eMade1, eMade2, eFin]) s = reduce(s, e);
      expect(s.rounds[1].state).toBe('scored');
      expect(s.rounds[2].state).toBe('bidding');
      expect(Object.keys(s.scores)).toEqual(['p1', 'p2']);
    });
    it('finalizes even when some made values are unset', () => {
      const eAdd1 = validateEventStrict(ev('player/added', { id: 'p1', name: 'A' }));
      const eAdd2 = validateEventStrict(ev('player/added', { id: 'p2', name: 'B' }));
      const eBid1 = validateEventStrict(ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }));
      const eBid2 = validateEventStrict(ev('bid/set', { round: 1, playerId: 'p2', bid: 3 }));
      const eMade1 = validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: true }));
      const eFin = validateEventStrict(ev('round/finalize', { round: 1 }));

      let s: AppState = INITIAL_STATE;
      for (const e of [eAdd1, eAdd2, eBid1, eBid2, eMade1, eFin]) s = reduce(s, e);

      expect(s.rounds[1].state).toBe('scored');
      expect(s.scores.p1).toBe(roundDelta(2, true));
      expect(s.scores.p2).toBe(roundDelta(3, false));
    });
    it('rejects invalid payloads', () => {
      const invalids = [{ round: -1 }, {}];
      for (const bad of invalids) {
        expect(() => validateEventStrict(ev('round/finalize', bad as any))).toThrowError(
          /InvalidEventPayload/,
        );
      }
    });
  });
});
describe('player/restored', () => {
  it('restores an archived player', () => {
    const eAdd = validateEventStrict(ev('player/added', { id: 'p5', name: 'Eva' }));
    const eRem = validateEventStrict(ev('player/removed', { id: 'p5' }));
    const eRes = validateEventStrict(ev('player/restored', { id: 'p5' }));
    let s: AppState = reduce(INITIAL_STATE, eAdd);
    s = reduce(s, eRem);
    s = reduce(s, eRes);
    expect(s.players.p5).toBe('Eva');
    expect(s.playerDetails.p5?.archivedAt).toBeNull();
    expect(s.playerDetails.p5?.archived).toBe(false);
  });
});

describe('player/type-set', () => {
  it('updates the recorded type', () => {
    const eAdd = validateEventStrict(ev('player/added', { id: 'p7', name: 'George' }));
    const eType = validateEventStrict(ev('player/type-set', { id: 'p7', type: 'bot' }));
    let s: AppState = reduce(INITIAL_STATE, eAdd);
    s = reduce(s, eType);
    expect(s.playerDetails.p7?.type).toBe('bot');
  });
});
