import { mulberry32 } from '@/lib/single-player/rng';

/**
 * Shared helpers for synthesizing deterministic single-player roster data.
 *
 * The game data generator, DevTools entry points, and automated tests depend on
 * these exports to fabricate consistent player identities without duplicating
 * registry metadata or randomization logic.
 */
export type Rng = () => number;

export type PlayerStyle = 'cautious' | 'balanced' | 'aggressive';

export type CurrentUserProfile = Readonly<{
  id: string;
  displayName: string;
  avatarSeed?: string | null;
}>;

export type GeneratedPlayerProfile = Readonly<{
  id: string;
  displayName: string;
  avatarSeed: string | null;
}>;

export type GeneratedRosterEntry = GeneratedPlayerProfile &
  Readonly<{
    seat: number;
    isBot: boolean;
    isCurrentUser: boolean;
    style: PlayerStyle;
  }>;

export type RegistryEntry = Readonly<{
  id: string;
  displayName: string;
  avatarSeed: string;
}>;

const BASE_NAME_REGISTRY = [
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
] as const satisfies readonly RegistryEntry[];

const FROZEN_NAME_REGISTRY = BASE_NAME_REGISTRY.map((entry) =>
  Object.freeze({ ...entry }),
) as ReadonlyArray<RegistryEntry>;

export const NAME_REGISTRY: ReadonlyArray<RegistryEntry> = Object.freeze([...FROZEN_NAME_REGISTRY]);

export const MAX_SYNTHETIC_PLAYERS = NAME_REGISTRY.length;

const MIN_PLAYER_COUNT = 2;
const DEFAULT_PLAYER_COUNT = 4;

export const STYLE_THRESHOLDS = Object.freeze({
  cautious: 1 / 3,
  balanced: 2 / 3,
}) satisfies Readonly<{ cautious: number; balanced: number }>;

export type GenerateRosterOptions = Readonly<{
  currentUser: CurrentUserProfile;
  playerCount?: number;
  rng?: Rng;
  seed?: string | null;
}>;

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function randomSeedString(): string {
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

export function getRng(seed?: string): Rng {
  const normalizedSeed = typeof seed === 'string' && seed.trim().length > 0 ? seed.trim() : null;
  const sourceSeed = normalizedSeed ?? randomSeedString();
  const hash = hashSeed(sourceSeed);
  return mulberry32(hash);
}

export function generateRoster(options: GenerateRosterOptions): GeneratedRosterEntry[] {
  const requestedCount = Math.trunc(options.playerCount ?? DEFAULT_PLAYER_COUNT);
  const playerCount = clamp(requestedCount, MIN_PLAYER_COUNT, MAX_SYNTHETIC_PLAYERS);
  const rng = options.rng ?? getRng(options.seed ?? undefined);
  const currentUser = normalizeCurrentUser(options.currentUser);

  const sampled = sampleRegistry(playerCount - 1, rng, currentUser.id);

  const roster: GeneratedRosterEntry[] = [];
  roster.push(
    createRosterEntry({
      base: currentUser,
      seat: 0,
      isBot: false,
      isCurrentUser: true,
      rng,
    }),
  );

  sampled.forEach((template, index) => {
    roster.push(
      createRosterEntry({
        base: template,
        seat: index + 1,
        isBot: true,
        isCurrentUser: false,
        rng,
      }),
    );
  });

  return roster;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCurrentUser(profile: CurrentUserProfile): GeneratedPlayerProfile {
  const id =
    typeof profile.id === 'string' && profile.id.trim().length > 0 ? profile.id.trim() : null;
  if (!id) throw new Error('Current user id is required');

  const displayName =
    typeof profile.displayName === 'string' && profile.displayName.trim().length > 0
      ? profile.displayName.trim()
      : 'Player';

  const seedValue = typeof profile.avatarSeed === 'string' ? profile.avatarSeed : null;
  const trimmedSeed = seedValue && seedValue.trim().length > 0 ? seedValue.trim() : null;
  const avatarSeed = trimmedSeed ?? deriveAvatarSeed(displayName);

  return { id, displayName, avatarSeed };
}

function deriveAvatarSeed(displayName: string): string | null {
  const slug = slugify(displayName);
  return slug.length > 0 ? slug : 'player';
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sampleRegistry(count: number, rng: Rng, forbiddenId: string): RegistryEntry[] {
  if (count <= 0) return [];
  const pool = NAME_REGISTRY.filter((entry) => entry.id !== forbiddenId);
  if (pool.length === 0) return [];

  const boundedCount = Math.min(count, pool.length);
  const indices = Array.from({ length: pool.length }, (_value, index) => index);
  shuffle(indices, rng);
  return indices.slice(0, boundedCount).map((idx) => pool[idx]!);
}

function shuffle<T>(values: T[], rng: Rng): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
}

type CreateRosterEntryInput = Readonly<{
  base: GeneratedPlayerProfile | RegistryEntry;
  seat: number;
  isBot: boolean;
  isCurrentUser: boolean;
  rng: Rng;
}>;

function createRosterEntry(input: CreateRosterEntryInput): GeneratedRosterEntry {
  return {
    id: input.base.id,
    displayName: input.base.displayName,
    avatarSeed: input.base.avatarSeed ?? null,
    seat: input.seat,
    isBot: input.isBot,
    isCurrentUser: input.isCurrentUser,
    style: assignStyle(input.rng),
  };
}

function assignStyle(rng: Rng): PlayerStyle {
  const roll = rng();
  if (roll < STYLE_THRESHOLDS.cautious) return 'cautious';
  if (roll < STYLE_THRESHOLDS.balanced) return 'balanced';
  return 'aggressive';
}
