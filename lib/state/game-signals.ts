export type GamesSignalType = 'added' | 'deleted';

export type GamesSignal = Readonly<{
  type: GamesSignalType;
  gameId: string;
  timestamp: number;
}>;

export type EmitGamesSignalPayload = Readonly<{
  type: GamesSignalType;
  gameId: string;
}>;

export const GAMES_SIGNAL_STORAGE_KEY = 'app-games:signal';
export const GAMES_SIGNAL_CHANNEL = 'app-games';

const isBrowser = () => typeof window !== 'undefined';

const makePayload = (input: EmitGamesSignalPayload): GamesSignal | null => {
  const type = input.type;
  if (type !== 'added' && type !== 'deleted') return null;
  const gameId = typeof input.gameId === 'string' ? input.gameId.trim() : '';
  if (!gameId) return null;
  const timestamp = Date.now();
  return { type, gameId, timestamp } satisfies GamesSignal;
};

const serializePayload = (payload: GamesSignal): string => JSON.stringify(payload);

export const emitGamesSignal = (input: EmitGamesSignalPayload): void => {
  if (!isBrowser()) return;
  const payload = makePayload(input);
  if (!payload) return;
  const serialized = serializePayload(payload);

  try {
    window.localStorage.setItem(GAMES_SIGNAL_STORAGE_KEY, serialized);
    try {
      const StorageEventCtor = window.StorageEvent as unknown as {
        new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
      };
      const event = new StorageEventCtor('storage', {
        key: GAMES_SIGNAL_STORAGE_KEY,
        newValue: serialized,
        storageArea: window.localStorage,
      });
      window.dispatchEvent(event);
    } catch {}
  } catch {}

  try {
    const channel = new window.BroadcastChannel(GAMES_SIGNAL_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {}
};

export const parseGamesSignal = (value: unknown): GamesSignal | null => {
  if (!value) return null;
  try {
    if (typeof value === 'string') {
      const parsed = JSON.parse(value) as Partial<GamesSignal>;
      return normalizeSignal(parsed);
    }
    if (typeof value === 'object') {
      return normalizeSignal(value as Partial<GamesSignal>);
    }
  } catch {}
  return null;
};

const normalizeSignal = (raw: Partial<GamesSignal>): GamesSignal | null => {
  if (!raw) return null;
  const type = raw.type;
  if (type !== 'added' && type !== 'deleted') return null;
  const gameId = typeof raw.gameId === 'string' ? raw.gameId.trim() : '';
  if (!gameId) return null;
  const timestamp = Number(raw.timestamp);
  const ts = Number.isFinite(timestamp) ? Number(timestamp) : Date.now();
  return { type, gameId, timestamp: ts } satisfies GamesSignal;
};

export const subscribeToGamesSignal = (handler: (signal: GamesSignal) => void): (() => void) => {
  if (!isBrowser()) return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== GAMES_SIGNAL_STORAGE_KEY) return;
    const signal = parseGamesSignal(event.newValue ?? null);
    if (!signal) return;
    handler(signal);
  };

  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new window.BroadcastChannel(GAMES_SIGNAL_CHANNEL);
    channel.onmessage = (evt) => {
      const signal = parseGamesSignal(evt.data);
      if (!signal) return;
      handler(signal);
    };
  } catch {}

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
  };
};
