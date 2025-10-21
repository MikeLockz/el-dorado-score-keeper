import { describe, expect, it } from 'vitest';

import {
  NAME_REGISTRY,
  generateRoster,
  getRng,
  MAX_SYNTHETIC_PLAYERS,
  type Rng,
} from '@/lib/devtools/generator/playerDataGenerator';

function collectValues(rngFactory: (seed: string) => Rng, seed: string): number[] {
  const rng = rngFactory(seed);
  return Array.from({ length: 5 }, () => rng());
}

describe('getRng', () => {
  it('returns deterministic sequences for a given seed', () => {
    const a = collectValues(getRng, 'seed-1');
    const b = collectValues(getRng, 'seed-1');
    expect(a).toEqual(b);
  });

  it('yields different sequences for distinct seeds', () => {
    const a = collectValues(getRng, 'seed-1');
    const b = collectValues(getRng, 'seed-2');
    expect(a).not.toEqual(b);
  });
});

describe('NAME_REGISTRY', () => {
  it('is deeply frozen to prevent mutations', () => {
    expect(Object.isFrozen(NAME_REGISTRY)).toBe(true);
    for (const entry of NAME_REGISTRY) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('rejects runtime attempts to mutate the registry', () => {
    expect(() => {
      (NAME_REGISTRY as unknown as Array<unknown>).push({});
    }).toThrow(TypeError);

    expect(() => {
      const first = NAME_REGISTRY[0] as { displayName: string } | undefined;
      if (first) {
        first.displayName = 'changed';
      }
    }).toThrow(TypeError);
  });

  it('provides stable identifier/name/avatar triples', () => {
    expect(NAME_REGISTRY).toHaveLength(10);
    const ids = new Set(NAME_REGISTRY.map((entry) => entry.id));
    expect(ids.size).toBe(NAME_REGISTRY.length);
  });
});

describe('generateRoster', () => {
  const baseCurrentUser = { id: 'current-user', displayName: 'You', avatarSeed: 'you' } as const;

  it('places the current user at seat 0 with derived defaults', () => {
    const roster = generateRoster({
      currentUser: { id: '  tester  ', displayName: '   QA Person   ' },
      playerCount: 3,
      seed: 'roster-seed-basics',
    });

    expect(roster[0]).toMatchObject({
      id: 'tester',
      displayName: 'QA Person',
      seat: 0,
      isBot: false,
      isCurrentUser: true,
      avatarSeed: 'qa-person',
    });
  });

  it('assigns sequential seats, unique ids, and bot styles for sampled players', () => {
    const roster = generateRoster({
      currentUser: baseCurrentUser,
      playerCount: 6,
      seed: 'roster-seed-unique',
    });

    expect(roster.map((entry) => entry.seat)).toEqual([0, 1, 2, 3, 4, 5]);

    const ids = new Set(roster.map((entry) => entry.id));
    expect(ids.size).toBe(roster.length);

    const allowedStyles = new Set(['cautious', 'balanced', 'aggressive']);
    roster.slice(1).forEach((entry) => {
      expect(entry.isBot).toBe(true);
      expect(entry.isCurrentUser).toBe(false);
      expect(allowedStyles.has(entry.style)).toBe(true);
    });
  });

  it('is deterministic when seeded', () => {
    const options = { currentUser: baseCurrentUser, playerCount: 5, seed: 'deterministic-seed' };
    const first = generateRoster(options);
    const second = generateRoster(options);
    expect(second).toEqual(first);
  });

  it('clamps the player count within supported bounds', () => {
    const maxRoster = generateRoster({
      currentUser: baseCurrentUser,
      playerCount: MAX_SYNTHETIC_PLAYERS + 5,
      seed: 'clamp-max',
    });
    expect(maxRoster).toHaveLength(MAX_SYNTHETIC_PLAYERS);

    const minRoster = generateRoster({
      currentUser: baseCurrentUser,
      playerCount: 1,
      seed: 'clamp-min',
    });
    expect(minRoster).toHaveLength(2);
  });
});
