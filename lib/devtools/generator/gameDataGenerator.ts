import { mulberry32 } from '@/lib/single-player/rng';

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

const ROUND_SEQUENCE_DEFAULT = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export function getRng(seed?: string): Rng {
  const normalizedSeed = typeof seed === 'string' && seed.length ? seed : null;
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
    Math.min(ROUND_SEQUENCE_DEFAULT.length, Math.trunc(options.roundCount ?? roster.length + 6)),
  );
  const roundsToPlay = ROUND_SEQUENCE_DEFAULT.slice(0, roundCount);

  const styleByPlayer = new Map<string, PlayerStyle>();
  for (const player of roster) {
    styleByPlayer.set(player.id, player.style);
  }

  const descriptors: RoundDescriptor[] = [];
  const previousBids = new Map<string, number>();
  for (const roundNumber of roundsToPlay) {
    const targetTricks = deriveTargetTricks(rng);

    const { bids, zeroBidPlayerIds, highBidPlayerIds, totalBid } = generateBids({
      roster,
      rng,
      styleByPlayer,
      previousBids,
      targetTricks,
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
  for (const player of input.roster) {
    const pid = player.id;
    if (pid === zeroBidPlayerId) {
      bids[pid] = 0;
      zeroBidPlayerIds.push(pid);
      continue;
    }

    const previousBid = input.previousBids.get(pid) ?? null;
    const style = input.styleByPlayer.get(pid) ?? 'balanced';

    const baseBid = deriveBid({ style, rng: input.rng, previousBid });
    let bid = baseBid;
    if (pid === highBidPlayerId) {
      bid = Math.max(5, baseBid + Math.floor(input.rng() * 3));
      highBidPlayerIds.push(pid);
    }

    bid = clamp(Math.trunc(bid), 0, Math.max(10, input.targetTricks + 2));
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
}: {
  style: PlayerStyle;
  rng: Rng;
  previousBid: number | null;
}): number {
  const ranges: Record<PlayerStyle, { min: number; max: number }> = {
    cautious: { min: 0, max: 2 },
    balanced: { min: 1, max: 4 },
    aggressive: { min: 2, max: 5 },
  };
  const { min, max } = ranges[style];
  let bid = min + Math.floor(rng() * (max - min + 1));

  if (previousBid != null && rng() < 0.6) {
    const delta = Math.floor(rng() * 3) - 1;
    bid = clamp(previousBid + delta, min, max + 2);
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
  const minTotal = input.targetTricks - 2;
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

function deriveTargetTricks(rng: Rng): number {
  const jitter = Math.floor(rng() * 3) - 1; // -1, 0, 1
  return clamp(10 + jitter, 8, 12);
}
