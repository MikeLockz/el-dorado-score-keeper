import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import { tricksForRound } from '@/lib/state/logic';
import { selectRoundInfo } from '@/lib/state/selectors';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  id: string,
): AppEvent => makeEvent(type, payload, { eventId: id, ts: now });

function replay(events: AppEvent[], base: AppState = INITIAL_STATE): AppState {
  return events.reduce((s, e) => reduce(s, e), base);
}

// Property-like checks over many rounds and bid shapes.
describe('bid sums vs tricks (under/match/over)', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;

  function seedPlayers(state: AppState): AppState {
    return replay(
      players.map((id, i) => ev('player/added', { id, name: `P${i + 1}` }, `pl-${id}`)),
      state,
    );
  }

  it('classifies under for all rounds when bids clamp to 0', () => {
    // Negative and fractional bids clamp to 0, so sum=0 < tricks for all rounds 1..10
    let s = seedPlayers(INITIAL_STATE);
    for (let r = 1; r <= 10; r++) {
      const events: AppEvent[] = [];
      for (const id of players) {
        events.push(ev('bid/set', { round: r, playerId: id, bid: -3.7 }, `u-${r}-${id}`));
      }
      s = replay(events, s);
      const info = selectRoundInfo(s, r);
      expect(info.sumBids).toBe(0);
      expect(info.tricks).toBe(tricksForRound(r));
      expect(info.overUnder).toBe('under');
    }
  });

  it('classifies match when sum of clamped bids equals tricks', () => {
    let s = seedPlayers(INITIAL_STATE);
    for (let r = 1; r <= 10; r++) {
      const t = tricksForRound(r);
      // Make p1 bid t, others bid fractional <1 which clamp to 0
      const events: AppEvent[] = [ev('bid/set', { round: r, playerId: 'p1', bid: t }, `m-${r}-p1`)];
      for (const id of players.slice(1)) {
        events.push(ev('bid/set', { round: r, playerId: id, bid: 0.9 }, `m-${r}-${id}`));
      }
      s = replay(events, s);
      const info = selectRoundInfo(s, r);
      expect(info.sumBids).toBe(t);
      expect(info.overUnder).toBe('match');
    }
  });

  it('classifies over when sum exceeds tricks by at least 1', () => {
    let s = seedPlayers(INITIAL_STATE);
    for (let r = 1; r <= 10; r++) {
      const t = tricksForRound(r);
      const events: AppEvent[] = [];
      // p1 bids t (max clamp), p2 bids 1 -> sum = t + 1 > tricks (for r>=1)
      events.push(ev('bid/set', { round: r, playerId: 'p1', bid: t }, `o-${r}-p1`));
      events.push(ev('bid/set', { round: r, playerId: 'p2', bid: 1 }, `o-${r}-p2`));
      // Add noise: p3 fractional (1.9 -> 1), p4 negative (-2 -> 0), p5 large (999 -> clamps per-player but already over)
      events.push(ev('bid/set', { round: r, playerId: 'p3', bid: 1.9 }, `o-${r}-p3`));
      events.push(ev('bid/set', { round: r, playerId: 'p4', bid: -2 }, `o-${r}-p4`));
      events.push(ev('bid/set', { round: r, playerId: 'p5', bid: 999 }, `o-${r}-p5`));
      s = replay(events, s);
      const info = selectRoundInfo(s, r);
      // Minimum sum is t + 1 (p1 + p2); any extra only increases it
      expect(info.sumBids).toBeGreaterThan(t);
      expect(info.overUnder).toBe('over');
    }
  });
});
