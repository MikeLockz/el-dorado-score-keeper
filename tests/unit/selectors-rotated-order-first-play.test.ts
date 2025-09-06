import { describe, it, expect } from 'vitest';
import { selectSpRotatedOrder, type AppState } from '@/lib/state';

function stateWith(
  order: string[],
  leaderId: string | null,
  trickPlays: Array<{ playerId: string }>,
): AppState {
  return {
    players: Object.fromEntries(order.map((id, i) => [id, `P${i + 1}`])),
    scores: {},
    rounds: {},
    sp: {
      phase: 'playing',
      roundNo: 4,
      dealerId: order[0] ?? null,
      order,
      trump: 'hearts',
      trumpCard: { suit: 'hearts', rank: 2 },
      hands: Object.fromEntries(order.map((id) => [id, []])) as any,
      trickPlays: trickPlays.map((p) => ({
        playerId: p.playerId,
        card: { suit: 'clubs', rank: 2 },
      })),
      trickCounts: {},
      trumpBroken: false,
      leaderId,
    },
    display_order: {},
  } as AppState;
}

describe('selectSpRotatedOrder prefers first play as leader for current trick', () => {
  it('uses leaderId when no plays', () => {
    const order = ['p1', 'p2', 'p3'];
    const s = stateWith(order, 'p2', []);
    expect(selectSpRotatedOrder(s)).toEqual(['p2', 'p3', 'p1']);
  });
  it('uses first play when present (even if different from leaderId)', () => {
    const order = ['p1', 'p2', 'p3'];
    const s = stateWith(order, 'p1', [{ playerId: 'p3' }]);
    expect(selectSpRotatedOrder(s)).toEqual(['p3', 'p1', 'p2']);
  });
});
