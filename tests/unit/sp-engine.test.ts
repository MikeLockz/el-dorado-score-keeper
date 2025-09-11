import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { makeEvent, events } from '@/lib/state/events';
import {
  prefillPrecedingBotBids,
  computeBotPlay,
  resolveCompletedTrick,
  finalizeRoundIfDone,
} from '@/lib/single-player/engine';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('sp-engine', () => {
  it('prefillPrecedingBotBids emits bid/set for bots before the human', () => {
    const s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'p1'),
      ev('player/added', { id: 'b', name: 'B' }, 'p2'),
      ev('player/added', { id: 'c', name: 'C' }, 'p3'),
      ev('player/added', { id: 'd', name: 'D' }, 'p4'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b', 'c', 'd'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 14 },
          hands: { a: [], b: [], c: [], d: [] },
        },
        'd1',
      ),
    ]);
    const batch = prefillPrecedingBotBids(s, 1, 'c', () => 0.5);
    // Bids for a and b only
    const types = batch.map((e) => e.type);
    expect(types.every((t) => t === 'bid/set')).toBe(true);
    const pids = batch.map((e: any) => (e as any).payload.playerId);
    expect(pids).toEqual(['a', 'b']);
  });

  it("computeBotPlay emits one 'sp/trick/played' when it's the bot's turn", () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'bp1'),
      ev('player/added', { id: 'b', name: 'B' }, 'bp2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 10 },
          hands: {
            a: [
              { suit: 'hearts', rank: 2 },
              { suit: 'clubs', rank: 3 },
            ],
            b: [{ suit: 'hearts', rank: 3 }],
          },
        },
        'bd1',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'lead'),
      ev('sp/phase-set', { phase: 'playing' }, 'ph'),
    ]);
    const out = computeBotPlay(s, 'a', () => 0.4);
    expect(out.length).toBe(1);
    expect(out[0]!.type).toBe('sp/trick/played');
    expect((out[0] as any).payload.playerId).toBe('a');
  });

  it('resolveCompletedTrick enters reveal; marks trump broken on off-suit trump', () => {
    // Two players, hearts led by a, b trumps in with spade
    const s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'cp1'),
      ev('player/added', { id: 'b', name: 'B' }, 'cp2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 14 },
          hands: { a: [], b: [] },
        },
        'cd1',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'clead'),
      ev('sp/phase-set', { phase: 'playing' }, 'cph'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 5 } }, 'p1'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'spades', rank: 2 } }, 'p2'),
    ]);
    const out = resolveCompletedTrick(s);
    const types = out.map((e) => e.type);
    expect(types).toContain('sp/trump-broken-set');
    expect(types).toContain('sp/trick/reveal-set');
    const reveal = out.find((e) => e.type === 'sp/trick/reveal-set') as any;
    expect(reveal.payload.winnerId).toBe('b');
  });

  it('computeBotPlay returns [] while reveal is active', () => {
    const s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'rp1'),
      ev('player/added', { id: 'b', name: 'B' }, 'rp2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 10 },
          hands: { a: [{ suit: 'hearts', rank: 2 }], b: [{ suit: 'spades', rank: 3 }] },
        },
        'rpd',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'rplead'),
      ev('sp/phase-set', { phase: 'playing' }, 'rpph'),
      // Simulate completed trick reveal before any clear
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 2 } }, 'rpp1'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'spades', rank: 3 } }, 'rpp2'),
      ev('sp/trick/reveal-set', { winnerId: 'b' }, 'rprev'),
    ]);
    const out = computeBotPlay(s, 'a', () => 0.5);
    expect(out.length).toBe(0);
  });

  it('finalizeRoundIfDone emits made/set and finalize; also prepares next deal when applicable', () => {
    // Round 1: two players, 10 tricks total; both bid 5 and both win 5
    const s0 = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'fp1'),
      ev('player/added', { id: 'b', name: 'B' }, 'fp2'),
      ev('round/state-set', { round: 1, state: 'playing' }, 'rs1'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { a: [], b: [] },
        },
        'fd1',
      ),
      ev('bid/set', { round: 1, playerId: 'a', bid: 5 }, 'b1'),
      ev('bid/set', { round: 1, playerId: 'b', bid: 5 }, 'b2'),
      // Build 10 complete tricks (2 plays + clear each) → 5 wins each
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 2 } }, 'p1a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 'p1b'),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'w1'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 4 } }, 'p2a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 5 } }, 'p2b'),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'w2'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 6 } }, 'p3a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 7 } }, 'p3b'),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'w3'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 8 } }, 'p4a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 9 } }, 'p4b'),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'w4'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 10 } }, 'p5a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 11 } }, 'p5b'),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'w5'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 'p6a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 3 } }, 'p6b'),
      ev('sp/trick/cleared', { winnerId: 'b' }, 'w6'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 4 } }, 'p7a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 5 } }, 'p7b'),
      ev('sp/trick/cleared', { winnerId: 'b' }, 'w7'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 6 } }, 'p8a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 7 } }, 'p8b'),
      ev('sp/trick/cleared', { winnerId: 'b' }, 'w8'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 8 } }, 'p9a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 9 } }, 'p9b'),
      ev('sp/trick/cleared', { winnerId: 'b' }, 'w9'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 10 } }, 'p10a'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 11 } }, 'p10b'),
      ev('sp/trick/cleared', { winnerId: 'b' }, 'w10'),
      ev('sp/phase-set', { phase: 'playing' }, 'ph'),
    ]);
    const out = finalizeRoundIfDone(s0, { now: now });
    const types = out.map((e) => e.type);
    expect(types).toContain('made/set');
    expect(types).toContain('round/finalize');
    expect(types).toContain('sp/phase-set');
    // Since next round < 10, expect a new sp/deal batch too
    expect(types).toContain('sp/deal');
    expect(types).toContain('sp/leader-set');
    expect(types).toContain('round/state-set');
  });

  it("computeBotPlay returns [] when it's not the player's turn", () => {
    const s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'nt1'),
      ev('player/added', { id: 'b', name: 'B' }, 'nt2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { a: [], b: [] },
        },
        'ntd',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'ntlead'),
      ev('sp/phase-set', { phase: 'playing' }, 'ntph'),
      // a has not played yet; so it is a's turn, not b's
    ]);
    const out = computeBotPlay(s, 'b', () => 0.5);
    expect(out.length).toBe(0);
  });

  it('resolveCompletedTrick returns [] when trick not complete or empty', () => {
    const base = [
      ev('player/added', { id: 'a', name: 'A' }, 'rc1'),
      ev('player/added', { id: 'b', name: 'B' }, 'rc2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 10 },
          hands: { a: [], b: [] },
        },
        'rcd',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'rclead'),
      ev('sp/phase-set', { phase: 'playing' }, 'rcph'),
    ];
    // No plays yet
    const s0 = replay(base);
    expect(resolveCompletedTrick(s0).length).toBe(0);
    // One play (not complete)
    const s1 = replay([
      ...base,
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 2 } }, 'p'),
    ]);
    expect(resolveCompletedTrick(s1).length).toBe(0);
  });

  it('finalizeRoundIfDone returns [] when not done or already scored', () => {
    // Not done (counts < needed)
    const s1 = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'fd1'),
      ev('player/added', { id: 'b', name: 'B' }, 'fd2'),
      ev('round/state-set', { round: 1, state: 'playing' }, 'rfd'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'clubs',
          trumpCard: { suit: 'clubs', rank: 9 },
          hands: { a: [], b: [] },
        },
        'fdd',
      ),
      ev('sp/trick/cleared', { winnerId: 'a' }, 'only1'),
      ev('sp/phase-set', { phase: 'playing' }, 'phx'),
    ]);
    expect(finalizeRoundIfDone(s1).length).toBe(0);
    // Already scored
    const s2 = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'ad1'),
      ev('round/state-set', { round: 1, state: 'scored' }, 'scored'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 9 },
          hands: { a: [] },
        },
        'rdx',
      ),
      ev('sp/phase-set', { phase: 'playing' }, 'ph2'),
    ]);
    expect(finalizeRoundIfDone(s2).length).toBe(0);
  });
});
