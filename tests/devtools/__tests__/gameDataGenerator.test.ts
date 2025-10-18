import { describe, expect, it } from 'vitest';

import {
  generateGameData,
  generateRoster,
  generateRoundPlan,
  getRng,
  type GeneratedRosterEntry,
} from '@/lib/devtools/generator/gameDataGenerator';
import { tricksForRound } from '@/lib/state/logic';

function collectRandomValues(seed: string): number[] {
  const rng = getRng(seed);
  return Array.from({ length: 5 }, () => rng());
}

describe('getRng', () => {
  it('is deterministic for a given seed', () => {
    const valuesA = collectRandomValues('seed-123');
    const valuesB = collectRandomValues('seed-123');
    expect(valuesA).toEqual(valuesB);
  });

  it('produces different sequences for different seeds', () => {
    const valuesA = collectRandomValues('seed-123');
    const valuesB = collectRandomValues('seed-456');
    expect(valuesA).not.toEqual(valuesB);
  });
});

describe('generateRoster', () => {
  const currentUser = { id: 'current-user', displayName: 'You', avatarSeed: 'you' };

  it('includes the current user with seat 0 and non-bot flag', () => {
    const roster = generateRoster({ currentUser, rng: getRng('roster-seed') });
    const me = roster.find((player) => player.id === currentUser.id);
    expect(me).toBeDefined();
    expect(me?.seat).toBe(0);
    expect(me?.isBot).toBe(false);
    expect(me?.isCurrentUser).toBe(true);
  });

  it('fills remaining seats with unique ids sampled from registry', () => {
    const roster = generateRoster({
      currentUser,
      playerCount: 6,
      rng: getRng('roster-seed'),
    });
    const uniqueIds = new Set(roster.map((player) => player.id));
    expect(uniqueIds.size).toBe(roster.length);
  });
});

describe('generateRoundPlan', () => {
  const currentUser = { id: 'current-user', displayName: 'You', avatarSeed: 'you' };

  function makeRoster(): GeneratedRosterEntry[] {
    return generateRoster({
      currentUser,
      playerCount: 5,
      rng: getRng('rounds-roster'),
    });
  }

  it('keeps sum of bids within ±2 of target tricks', () => {
    const roster = makeRoster();
    const rounds = generateRoundPlan({
      roster,
      rng: getRng('rounds-seed'),
      roundCount: 6,
    });

    expect(rounds).toHaveLength(6);
    for (const [index, descriptor] of rounds.entries()) {
      expect(descriptor.roundNumber).toBe(index + 1);
      const expectedTricks = tricksForRound(descriptor.roundNumber);
      expect(Math.abs(descriptor.targetTricks - expectedTricks)).toBeLessThanOrEqual(1);
      const diff = Math.abs(descriptor.totalBid - descriptor.targetTricks);
      expect(diff).toBeLessThanOrEqual(2);
      const totalTricks = Object.values(descriptor.tricksTaken).reduce(
        (acc, value) => acc + value,
        0,
      );
      expect(descriptor.totalTricksTaken).toBe(totalTricks);
    }
  });

  it('preserves roster player ids in bid map', () => {
    const roster = makeRoster();
    const rounds = generateRoundPlan({ roster, rng: getRng('rounds-seed-2'), roundCount: 3 });
    for (const descriptor of rounds) {
      expect(Object.keys(descriptor.bids)).toEqual(roster.map((player) => player.id));
    }
  });
});

describe('generateGameData', () => {
  const currentUser = { id: 'current-user', displayName: 'Dev', avatarSeed: 'dev' };

  it('produces monotonic event timestamps and aligned summaries', () => {
    const { events, roundTallies, gameRecord } = generateGameData({
      currentUser,
      seed: 'game-seed',
      playerCount: 4,
    });

    expect(events.length).toBeGreaterThan(0);
    const ts = events.map((event) => event.ts);
    for (let i = 1; i < ts.length; i += 1) {
      expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]!);
    }

    const summary = gameRecord.summary;
    expect(summary.roundsCompleted).toBeGreaterThan(0);
    expect(summary.finalScores?.length).toBe(summary.players);
    expect(summary.startedAt).toBeLessThan(summary.summaryEnteredAt ?? Infinity);
    expect(summary.durationMs).toBeGreaterThan(0);
    expect(summary.id).toBe(gameRecord.id);
    expect(summary.mode).toBe('single-player');
    expect(gameRecord.bundle.events).toEqual(events);

    for (const [roundKey, tallies] of Object.entries(roundTallies)) {
      const round = Number(roundKey);
      const total = Object.values(tallies ?? {}).reduce((acc, value) => acc + value, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(tricksForRound(round) + 2);
    }
  });
});
