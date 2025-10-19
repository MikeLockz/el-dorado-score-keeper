import { mulberry32 } from '@/lib/single-player/rng';
import type { Suit } from '@/lib/single-player/types';
import { uuid } from '@/lib/utils';
import { tricksForRound } from '@/lib/state/logic';
import { events } from '@/lib/state/events';
import {
  INITIAL_STATE,
  reduce,
  type AppState,
  type KnownAppEvent,
  type RoundState,
} from '@/lib/state/types';
import {
  summarizeState,
  SUMMARY_METADATA_VERSION,
  type GameRecord,
  type SummaryMetadata,
} from '@/lib/state/io';

type Rng = () => number;

const NAME_REGISTRY = [
  { id: '585a8ad2-0dfb-4c32-9f92-0b2d1a7f3d51', displayName: 'bob', avatarSeed: 'bob' },
  { id: 'a0c69b29-914f-4ec1-9c0e-7f5471a2c4b5', displayName: 'sue', avatarSeed: 'sue' },
  { id: '6b7f6d21-e8a1-4d6c-9dc1-1c6c73bb8e5c', displayName: 'pat', avatarSeed: 'pat' },
  { id: '4b1cf7a5-8f20-4e2d-9c9f-3a48f351aa19', displayName: 'amy', avatarSeed: 'amy' },
  { id: 'f68fb18b-82d5-45f8-8c83-40e501cdb525', displayName: 'rex', avatarSeed: 'rex' },
  { id: '7e8bd9b3-0ba8-4fae-8c9c-5c881f0cc3bf', displayName: 'liv', avatarSeed: 'liv' },
  { id: 'c918e1b6-3f2a-4f3c-8a96-1c4c24c6e219', displayName: 'gus', avatarSeed: 'gus' },
  { id: '1fb0a0ad-d3ea-4688-9c6f-4753a91fd5ab', displayName: 'uma', avatarSeed: 'uma' },
  { id: 'b5f54233-54fe-4b4a-8de5-4c43d945350f', displayName: 'ned', avatarSeed: 'ned' },
  { id: 'd72a5f4f-b771-4f29-86bd-3e9c5587039d', displayName: 'ivy', avatarSeed: 'ivy' },
] as const;

const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const ROUND_SEQUENCE_DEFAULT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type PlayerStyle = 'cautious' | 'balanced' | 'aggressive';

export type GeneratedRosterEntry = Readonly<{
  id: string;
  displayName: string;
  avatarSeed: string | null;
  seat: number;
  isBot: boolean;
  style: PlayerStyle;
  isCurrentUser: boolean;
}>;

export type CurrentUserProfile = Readonly<{
  id: string;
  displayName: string;
  avatarSeed?: string | null;
}>;

export type RosterOptions = Readonly<{
  playerCount?: number;
  currentUser: CurrentUserProfile;
  rng?: Rng;
}>;

export type RoundDescriptor = Readonly<{
  roundNumber: number;
  targetTricks: number;
  bids: Readonly<Record<string, number>>;
  tricksTaken: Readonly<Record<string, number>>;
  totalBid: number;
  totalTricksTaken: number;
  zeroBidPlayerIds: ReadonlyArray<string>;
  highBidPlayerIds: ReadonlyArray<string>;
  perfectBidPlayerIds: ReadonlyArray<string>;
}>;

export type RoundGenerationOptions = Readonly<{
  roster: ReadonlyArray<GeneratedRosterEntry>;
  rng?: Rng;
  roundCount?: number;
}>;

export type GeneratedGameOptions = Readonly<{
  currentUser: CurrentUserProfile;
  playerCount?: number;
  seed?: string;
  roundCount?: number;
  startTimestamp?: number;
}>;

export type RoundTallies = Readonly<Record<number, Readonly<Record<string, number>>>>;

export type GeneratedGamePayload = Readonly<{
  roster: ReadonlyArray<GeneratedRosterEntry>;
  rounds: ReadonlyArray<RoundDescriptor>;
  events: ReadonlyArray<KnownAppEvent>;
  roundTallies: RoundTallies;
  gameRecord: GameRecord;
}>;

export function getRng(seed?: string): Rng {
  const normalizedSeed = typeof seed === 'string' && seed.trim().length > 0 ? seed.trim() : null;
  const sourceSeed = normalizedSeed ?? randomSeedString();
  const hash = hashSeed(sourceSeed);
  return mulberry32(hash);
}

export function generateRoster(options: RosterOptions): GeneratedRosterEntry[] {
  const playerCount = clamp(Math.trunc(options.playerCount ?? 4), 2, NAME_REGISTRY.length);
  const rng = options.rng ?? getRng();
  const currentUser = normalizeCurrentUser(options.currentUser);

  const sampled = sampleRegistry(playerCount - 1, rng, currentUser.id);
  const seats: GeneratedRosterEntry[] = [];
  seats.push(
    createRosterEntry({
      base: currentUser,
      seat: 0,
      isBot: false,
      isCurrentUser: true,
      rng,
    }),
  );

  for (const [index, reg] of sampled.entries()) {
    seats.push(
      createRosterEntry({
        base: reg,
        seat: index + 1,
        isBot: true,
        isCurrentUser: false,
        rng,
      }),
    );
  }

  return seats;
}

export function generateRoundPlan(options: RoundGenerationOptions): RoundDescriptor[] {
  const roster = Array.isArray(options.roster) ? options.roster : [];
  if (roster.length === 0) return [];

  const rng = options.rng ?? getRng();
  const roundCount = Math.max(
    1,
    Math.min(ROUND_SEQUENCE_DEFAULT.length, Math.trunc(options.roundCount ?? 10)),
  );
  const roundsToPlay = ROUND_SEQUENCE_DEFAULT.slice(0, roundCount);

  const styleByPlayer = new Map<string, PlayerStyle>();
  for (const player of roster) {
    styleByPlayer.set(player.id, player.style);
  }

  const descriptors: RoundDescriptor[] = [];
  const previousBids = new Map<string, number>();
  for (const roundNumber of roundsToPlay) {
    const baseTricks = tricksForRound(roundNumber);
    const targetTricks = deriveTargetTricks(rng, baseTricks);

    const { bids, zeroBidPlayerIds, highBidPlayerIds, totalBid } = generateBids({
      roster,
      rng,
      styleByPlayer,
      previousBids,
      targetTricks,
      roundNumber,
    });

    const { tricksTaken, totalTricksTaken } = generateTricksTaken({
      bids,
      rng,
      targetTricks,
      roster,
    });

    const perfectBidPlayerIds = Object.keys(bids).filter((pid) => bids[pid] === tricksTaken[pid]);

    descriptors.push({
      roundNumber,
      targetTricks,
      bids,
      tricksTaken,
      totalBid,
      totalTricksTaken,
      zeroBidPlayerIds,
      highBidPlayerIds,
      perfectBidPlayerIds,
    });

    for (const [pid, bid] of Object.entries(bids)) {
      previousBids.set(pid, bid);
    }
  }

  return descriptors;
}

export function generateGameData(options: GeneratedGameOptions): GeneratedGamePayload {
  const rng = getRng(options.seed);
  const roster = generateRoster({
    currentUser: options.currentUser,
    ...(typeof options.playerCount === 'number' ? { playerCount: options.playerCount } : {}),
    rng,
  });
  const rounds = generateRoundPlan({
    roster,
    rng,
    ...(typeof options.roundCount === 'number' ? { roundCount: options.roundCount } : {}),
  });

  const startTimestamp =
    typeof options.startTimestamp === 'number' && Number.isFinite(options.startTimestamp)
      ? Math.max(0, Math.trunc(options.startTimestamp))
      : synthesizeStartTimestamp(rounds.length, rng);

  const {
    state,
    events: eventStream,
    roundTallies,
    summaryEnteredAt,
  } = buildEventStream({
    roster,
    rounds,
    rng,
    startTimestamp,
  });

  const baseSummary = summarizeState(state);
  const scores = computeFinalScores(state, roster);
  const version = SUMMARY_METADATA_VERSION;
  const durationMs = Math.max(0, summaryEnteredAt - startTimestamp);

  const spSummary = enrichSinglePlayerSummary(baseSummary, roundTallies);
  const updatedSummary = {
    ...baseSummary,
    mode: 'single-player' as const,
    id: baseSummary?.id ?? state?.sp?.sessionSeed?.toString() ?? uuid(),
    startedAt: startTimestamp,
    updatedAt: summaryEnteredAt,
    summaryEnteredAt,
    roundsCompleted: rounds.length,
    finalScores: scores,
    durationMs,
    version,
    metadata: enrichSummaryMetadata(baseSummary?.metadata, summaryEnteredAt, version),
    ...(spSummary ? { sp: spSummary } : {}),
  };

  const gameId = uuid();
  const gameRecord: GameRecord = {
    id: gameId,
    title: buildGameTitle(startTimestamp, roster),
    createdAt: startTimestamp,
    finishedAt: summaryEnteredAt,
    lastSeq: eventStream.length,
    summary: { ...updatedSummary, id: gameId },
    bundle: {
      latestSeq: eventStream.length,
      events: [...eventStream],
    },
  };

  return {
    roster,
    rounds,
    events: eventStream,
    roundTallies,
    gameRecord,
  };
}

function randomSeedString(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const array = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(array);
    return array[0]!.toString(36);
  }
  return `${Math.random()}`.slice(2);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCurrentUser(profile: CurrentUserProfile): CurrentUserProfile {
  const id = typeof profile.id === 'string' && profile.id.trim().length ? profile.id.trim() : null;
  if (!id) throw new Error('Current user id is required');
  const displayName =
    typeof profile.displayName === 'string' && profile.displayName.trim().length
      ? profile.displayName.trim()
      : 'Player';
  return {
    id,
    displayName,
    avatarSeed: profile.avatarSeed ?? null,
  };
}

type RegistryEntry = (typeof NAME_REGISTRY)[number];

function sampleRegistry(count: number, rng: Rng, forbiddenId: string): RegistryEntry[] {
  if (count <= 0) return [];
  const pool = NAME_REGISTRY.filter((entry) => entry.id !== forbiddenId);
  const indices = pool.map((_entry, index) => index);
  shuffle(indices, rng);
  return indices.slice(0, count).map((idx) => pool[idx]!);
}

function shuffle<T>(indices: T[], rng: Rng): void {
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
}

type CreateRosterEntryInput = {
  base: { id: string; displayName: string; avatarSeed?: string | null };
  seat: number;
  isBot: boolean;
  isCurrentUser: boolean;
  rng: Rng;
};

function createRosterEntry(input: CreateRosterEntryInput): GeneratedRosterEntry {
  return {
    id: input.base.id,
    displayName: input.base.displayName,
    avatarSeed: input.base.avatarSeed ?? null,
    seat: input.seat,
    isBot: input.isBot,
    style: assignStyle(input.rng),
    isCurrentUser: input.isCurrentUser,
  };
}

function assignStyle(rng: Rng): PlayerStyle {
  const roll = rng();
  if (roll < 0.33) return 'cautious';
  if (roll < 0.66) return 'balanced';
  return 'aggressive';
}

type GenerateBidsInput = {
  roster: ReadonlyArray<GeneratedRosterEntry>;
  rng: Rng;
  styleByPlayer: Map<string, PlayerStyle>;
  previousBids: Map<string, number>;
  targetTricks: number;
  roundNumber: number;
};

type GenerateBidsResult = {
  bids: Record<string, number>;
  zeroBidPlayerIds: string[];
  highBidPlayerIds: string[];
  totalBid: number;
};

function generateBids(input: GenerateBidsInput): GenerateBidsResult {
  const bids: Record<string, number> = {};
  const zeroBidPlayerIds: string[] = [];
  const highBidPlayerIds: string[] = [];

  const rosterIds = input.roster.map((player) => player.id);
  const zeroBidRound = input.rng() < 0.55;
  const highBidRound = input.rng() < 0.17;
  const zeroBidPlayerId = zeroBidRound
    ? pickZeroBidPlayer(rosterIds, input, zeroBidPlayerIds)
    : null;
  const highBidPlayerId = highBidRound
    ? pickHighBidPlayer(rosterIds, input, zeroBidPlayerId)
    : null;

  let runningTotal = 0;
  const maxBid = Math.max(1, tricksForRound(input.roundNumber));
  for (const player of input.roster) {
    const pid = player.id;
    if (pid === zeroBidPlayerId) {
      bids[pid] = 0;
      zeroBidPlayerIds.push(pid);
      continue;
    }

    const previousBid = input.previousBids.get(pid) ?? null;
    const style = input.styleByPlayer.get(pid) ?? 'balanced';

    const baseBid = deriveBid({ style, rng: input.rng, previousBid, maxBid });
    let bid = baseBid;
    if (pid === highBidPlayerId) {
      bid = clamp(baseBid + Math.floor(input.rng() * 3), 2, maxBid);
      highBidPlayerIds.push(pid);
    }

    bid = clamp(Math.trunc(bid), 0, Math.max(maxBid, input.targetTricks + 2));
    bids[pid] = bid;
    runningTotal += bid;
  }

  const { totalBid, adjustedBids } = adjustBidTotals({
    bids,
    rosterIds,
    rng: input.rng,
    targetTricks: input.targetTricks,
  });

  return {
    bids: adjustedBids,
    zeroBidPlayerIds,
    highBidPlayerIds,
    totalBid,
  };
}

function pickZeroBidPlayer(
  rosterIds: string[],
  input: GenerateBidsInput,
  zeroBidPlayerIds: string[],
): string | null {
  const cautiousPlayers = rosterIds.filter(
    (pid) => input.styleByPlayer.get(pid) === 'cautious' && !zeroBidPlayerIds.includes(pid),
  );
  if (cautiousPlayers.length > 0) {
    return cautiousPlayers[Math.floor(input.rng() * cautiousPlayers.length)] ?? null;
  }
  return rosterIds[Math.floor(input.rng() * rosterIds.length)] ?? null;
}

function pickHighBidPlayer(
  rosterIds: string[],
  input: GenerateBidsInput,
  zeroBidPlayerId: string | null,
): string | null {
  const aggressivePlayers = rosterIds.filter(
    (pid) => pid !== zeroBidPlayerId && input.styleByPlayer.get(pid) === 'aggressive',
  );
  if (aggressivePlayers.length > 0) {
    return aggressivePlayers[Math.floor(input.rng() * aggressivePlayers.length)] ?? null;
  }
  const eligible = rosterIds.filter((pid) => pid !== zeroBidPlayerId);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(input.rng() * eligible.length)] ?? null;
}

function deriveBid({
  style,
  rng,
  previousBid,
  maxBid,
}: {
  style: PlayerStyle;
  rng: Rng;
  previousBid: number | null;
  maxBid: number;
}): number {
  const ranges: Record<PlayerStyle, { min: number; max: number }> = {
    cautious: { min: 0, max: Math.min(2, maxBid) },
    balanced: { min: Math.min(1, maxBid), max: Math.min(4, maxBid) },
    aggressive: { min: Math.min(2, maxBid), max: Math.min(5, maxBid) },
  };
  const { min, max } = ranges[style];
  let bid = clamp(min + Math.floor(rng() * (max - min + 1)), 0, maxBid);

  if (previousBid != null && rng() < 0.6) {
    const delta = Math.floor(rng() * 3) - 1;
    bid = clamp(previousBid + delta, 0, maxBid);
  }
  return bid;
}

type AdjustBidTotalsInput = {
  bids: Record<string, number>;
  rosterIds: string[];
  rng: Rng;
  targetTricks: number;
};

type AdjustBidTotalsResult = {
  adjustedBids: Record<string, number>;
  totalBid: number;
};

function adjustBidTotals(input: AdjustBidTotalsInput): AdjustBidTotalsResult {
  const bids = { ...input.bids };
  let totalBid = Object.values(bids).reduce((acc, value) => acc + value, 0);
  const minTotal = Math.max(0, input.targetTricks - 2);
  const maxTotal = input.targetTricks + 2;

  while (totalBid > maxTotal) {
    const candidate = pickHighestBidder(input.rosterIds, bids, input.rng);
    if (!candidate) break;
    bids[candidate] = Math.max(0, bids[candidate]! - 1);
    totalBid -= 1;
  }

  while (totalBid < minTotal) {
    const candidate = pickBidderToIncrease(input.rosterIds, bids, input.rng);
    if (!candidate) break;
    bids[candidate] = bids[candidate]! + 1;
    totalBid += 1;
  }

  return { adjustedBids: bids, totalBid };
}

function pickHighestBidder(
  rosterIds: string[],
  bids: Record<string, number>,
  rng: Rng,
): string | null {
  const maxBid = Math.max(...rosterIds.map((pid) => bids[pid] ?? 0));
  const candidates = rosterIds.filter((pid) => (bids[pid] ?? 0) === maxBid && maxBid > 0);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}

function pickBidderToIncrease(
  rosterIds: string[],
  bids: Record<string, number>,
  rng: Rng,
): string | null {
  const minBid = Math.min(...rosterIds.map((pid) => bids[pid] ?? 0));
  const candidates = rosterIds.filter((pid) => bids[pid] === minBid);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}

type GenerateTricksTakenInput = {
  bids: Record<string, number>;
  rng: Rng;
  targetTricks: number;
  roster: ReadonlyArray<GeneratedRosterEntry>;
};

type GenerateTricksTakenResult = {
  tricksTaken: Record<string, number>;
  totalTricksTaken: number;
};

function generateTricksTaken(input: GenerateTricksTakenInput): GenerateTricksTakenResult {
  const tricks: Record<string, number> = {};
  const rosterIds = input.roster.map((player) => player.id);
  const bidEntries = Object.entries(input.bids);

  for (const [pid, bid] of bidEntries) {
    const delta = Math.floor(input.rng() * 3) - 1; // -1, 0, or +1
    tricks[pid] = Math.max(0, bid + delta);
  }

  let totalTricks = Object.values(tricks).reduce((acc, value) => acc + value, 0);

  const ensureAtLeastOne = rosterIds[Math.floor(input.rng() * rosterIds.length)];
  if (ensureAtLeastOne && totalTricks === 0) {
    tricks[ensureAtLeastOne] = 1;
    totalTricks = 1;
  }

  if (totalTricks > input.targetTricks) {
    let excess = totalTricks - input.targetTricks;
    while (excess > 0) {
      const candidate = pickHighestBidder(rosterIds, tricks, input.rng);
      if (!candidate) break;
      if (tricks[candidate]! === 0) break;
      tricks[candidate] = tricks[candidate]! - 1;
      excess -= 1;
    }
  } else if (totalTricks < input.targetTricks) {
    let deficit = input.targetTricks - totalTricks;
    while (deficit > 0) {
      const candidate = pickBidderToIncrease(rosterIds, tricks, input.rng);
      if (!candidate) break;
      tricks[candidate] = tricks[candidate]! + 1;
      deficit -= 1;
    }
  }

  totalTricks = Object.values(tricks).reduce((acc, value) => acc + value, 0);

  return { tricksTaken: tricks, totalTricksTaken: totalTricks };
}

function deriveTargetTricks(rng: Rng, baseTricks: number): number {
  const jitter = Math.floor(rng() * 3) - 1; // -1, 0, 1
  return clamp(baseTricks + jitter, Math.max(1, baseTricks - 1), Math.max(1, baseTricks + 1));
}

type BuildEventStreamInput = {
  roster: ReadonlyArray<GeneratedRosterEntry>;
  rounds: ReadonlyArray<RoundDescriptor>;
  rng: Rng;
  startTimestamp: number;
};

type BuildEventStreamOutput = {
  state: AppState;
  events: KnownAppEvent[];
  roundTallies: RoundTallies;
  summaryEnteredAt: number;
};

function buildEventStream(input: BuildEventStreamInput): BuildEventStreamOutput {
  let state: AppState = INITIAL_STATE;
  const eventsOut: KnownAppEvent[] = [];
  const roundTallies: Record<number, Record<string, number>> = {};

  let currentTs = input.startTimestamp;
  let lastTs = currentTs;

  const pushEvent = <T extends keyof typeof events>(
    factory: (typeof events)[T],
    payload: Parameters<(typeof events)[T]>[0],
    advance: { min: number; max: number } = { min: 30_000, max: 90_000 },
  ) => {
    const event = factory(payload as never, { ts: currentTs });
    eventsOut.push(event);
    state = reduce(state, event);
    lastTs = event.ts;
    currentTs += randomBetween(input.rng, advance.min, advance.max);
  };

  for (const player of input.roster) {
    pushEvent(
      events.playerAdded,
      {
        id: player.id,
        name: player.displayName,
        type: player.isBot ? 'bot' : 'human',
      },
      { min: 3_000, max: 6_000 },
    );
  }

  pushEvent(
    events.playersReordered,
    { order: input.roster.map((player) => player.id) },
    { min: 2_000, max: 4_000 },
  );

  pushEvent(events.spReset, {}, { min: 2_000, max: 5_000 });
  pushEvent(
    events.spSeedSet,
    { seed: Math.floor(input.rng() * 10_000) },
    { min: 1_000, max: 3_000 },
  );

  let dealerIndex = 0;
  for (const round of input.rounds) {
    const roundNumber = round.roundNumber;
    pushEvent(
      events.roundStateSet,
      {
        round: roundNumber,
        state: resolveRoundState(roundNumber, state.rounds[roundNumber]?.state),
      },
      { min: 4_000, max: 9_000 },
    );

    const dealer = input.roster[dealerIndex % input.roster.length]!;
    const trumpSuit = SUITS[Math.floor(input.rng() * SUITS.length)] ?? 'hearts';
    const trumpCard = { suit: trumpSuit, rank: 11 + Math.floor(input.rng() * 3) };
    pushEvent(
      events.spDeal,
      {
        roundNo: roundNumber,
        dealerId: dealer.id,
        order: input.roster.map((player) => player.id),
        trump: trumpSuit,
        trumpCard,
        hands: buildHandsPayload(round.targetTricks, input.roster, input.rng),
      },
      { min: 15_000, max: 35_000 },
    );

    for (const player of input.roster) {
      pushEvent(
        events.bidSet,
        { round: roundNumber, playerId: player.id, bid: round.bids[player.id] ?? 0 },
        { min: 2_000, max: 6_000 },
      );
    }

    pushEvent(events.spPhaseSet, { phase: 'playing' }, { min: 3_000, max: 6_000 });

    const tallies = { ...round.tricksTaken };
    pushEvent(
      events.spRoundTallySet,
      {
        round: roundNumber,
        tallies,
      },
      { min: 10_000, max: 25_000 },
    );
    roundTallies[roundNumber] = tallies;

    for (const player of input.roster) {
      const made = (round.tricksTaken[player.id] ?? 0) === (round.bids[player.id] ?? 0);
      pushEvent(
        events.madeSet,
        { round: roundNumber, playerId: player.id, made },
        { min: 1_500, max: 4_000 },
      );
    }

    pushEvent(events.roundFinalize, { round: roundNumber }, { min: 8_000, max: 18_000 });

    const nextPhase: RoundState =
      roundNumber === input.rounds[input.rounds.length - 1]?.roundNumber ? 'scored' : 'bidding';
    if (nextPhase === 'bidding') {
      pushEvent(events.spPhaseSet, { phase: 'bidding' }, { min: 3_000, max: 6_000 });
    } else {
      pushEvent(events.spPhaseSet, { phase: 'summary' }, { min: 4_000, max: 8_000 });
    }

    dealerIndex += 1;
  }

  pushEvent(
    events.spSummaryEnteredSet,
    { at: lastTs + randomBetween(input.rng, 8_000, 16_000) },
    { min: 2_000, max: 5_000 },
  );
  pushEvent(events.spPhaseSet, { phase: 'done' }, { min: 1_000, max: 2_000 });

  const summaryEnteredEvent = eventsOut.findLast(
    (event) => event.type === 'sp/summary-entered-set',
  );
  const summaryEnteredAt =
    (summaryEnteredEvent?.payload as { at?: number } | undefined)?.at ?? lastTs;

  return { state, events: eventsOut, roundTallies, summaryEnteredAt };
}

function resolveRoundState(round: number, current: RoundState | undefined): RoundState {
  if (!current || current === 'locked') return 'bidding';
  return current;
}

function buildHandsPayload(
  targetTricks: number,
  roster: ReadonlyArray<GeneratedRosterEntry>,
  rng: Rng,
): Record<string, Array<{ suit: Suit; rank: number }>> {
  const handSize = Math.max(1, targetTricks);
  const createCard = (): { suit: Suit; rank: number } => ({
    suit: SUITS[Math.floor(rng() * SUITS.length)] ?? 'hearts',
    rank: clamp(2 + Math.floor(rng() * 13), 2, 14),
  });
  const out: Record<string, Array<{ suit: Suit; rank: number }>> = {};
  for (const player of roster) {
    const cards: Array<{ suit: Suit; rank: number }> = [];
    for (let i = 0; i < handSize; i += 1) cards.push(createCard());
    out[player.id] = cards;
  }
  return out;
}

function computeFinalScores(
  state: AppState,
  roster: ReadonlyArray<GeneratedRosterEntry>,
): Array<{ playerId: string; score: number }> {
  return roster.map((player) => ({
    playerId: player.id,
    score: state.scores[player.id] ?? 0,
  }));
}

function enrichSummaryMetadata(
  metadata: SummaryMetadata | undefined,
  generatedAt: number,
  version: number,
): SummaryMetadata {
  return {
    version,
    generatedAt,
    ...(metadata ?? {}),
  };
}

function enrichSinglePlayerSummary(
  summary: GameRecord['summary'],
  roundTallies: RoundTallies,
): GameRecord['summary']['sp'] | undefined {
  if (!summary.sp) return summary.sp;
  const lastRound = Math.max(
    0,
    ...Object.keys(roundTallies)
      .map((key) => Number.parseInt(key, 10))
      .filter(Number.isFinite),
  );
  const trickCounts =
    lastRound && roundTallies[lastRound]
      ? { ...roundTallies[lastRound]! }
      : (summary.sp.trickCounts ?? {});
  return {
    ...summary.sp,
    trickCounts,
    roundTallies: { ...roundTallies },
  };
}

function buildGameTitle(
  startTimestamp: number,
  roster: ReadonlyArray<GeneratedRosterEntry>,
): string {
  const formatter =
    typeof Intl !== 'undefined'
      ? new Intl.DateTimeFormat('en', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
  const when = formatter
    ? formatter.format(new Date(startTimestamp))
    : new Date(startTimestamp).toLocaleString();
  const host = roster.find((player) => !player.isBot)?.displayName ?? 'Host';
  return `${host}'s Single Player Game – ${when}`;
}

function synthesizeStartTimestamp(roundCount: number, rng: Rng): number {
  const now = Date.now();
  const totalMinutes = roundCount * (5 + rng() * 4);
  return now - Math.floor(totalMinutes * 60_000);
}

function randomBetween(rng: Rng, min: number, max: number): number {
  if (max <= min) return Math.floor(min);
  const delta = max - min;
  return Math.floor(min + rng() * delta);
}
