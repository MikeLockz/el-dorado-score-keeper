import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseGamesSignal,
  emitGamesSignal,
  GAMES_SIGNAL_STORAGE_KEY,
  subscribeToGamesSignal,
} from '@/lib/state/game-signals';

const setupWindow = () => {
  const storage = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => storage.delete(key)),
  } as unknown as Storage;

  const broadcastMessages: unknown[] = [];
  class BroadcastChannelMock {
    name: string;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
      BroadcastChannelMock.instances.push(this);
    }
    postMessage(data: unknown) {
      broadcastMessages.push(data);
      if (this.onmessage) {
        this.onmessage({ data } as MessageEvent);
      }
    }
    close() {}
    static instances: BroadcastChannelMock[] = [];
  }

  (globalThis as unknown as { BroadcastChannel?: typeof BroadcastChannelMock }).BroadcastChannel =
    BroadcastChannelMock as unknown as typeof BroadcastChannel;
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: localStorageMock,
    BroadcastChannel: BroadcastChannelMock as unknown as typeof BroadcastChannel,
    dispatchEvent: (event: StorageEvent) => {
      const listeners = (window as unknown as { __listeners?: Set<(ev: StorageEvent) => void> })
        .__listeners;
      listeners?.forEach((listener) => listener(event));
    },
    addEventListener: (type: string, listener: (ev: StorageEvent) => void) => {
      if (type !== 'storage') return;
      const target = window as unknown as { __listeners?: Set<(ev: StorageEvent) => void> };
      target.__listeners ??= new Set();
      target.__listeners.add(listener);
    },
    removeEventListener: (type: string, listener: (ev: StorageEvent) => void) => {
      if (type !== 'storage') return;
      const target = window as unknown as { __listeners?: Set<(ev: StorageEvent) => void> };
      target.__listeners?.delete(listener);
    },
  } as unknown as Window;
  (globalThis as unknown as { localStorage?: Storage }).localStorage = localStorageMock;

  return { localStorageMock, broadcastMessages, BroadcastChannelMock };
};

describe('game signals', () => {
  let env: ReturnType<typeof setupWindow>;

  beforeEach(() => {
    env = setupWindow();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: Storage }).localStorage;
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  it('parses signals from serialized payloads', () => {
    const parsed = parseGamesSignal(
      JSON.stringify({ type: 'added', gameId: 'game-1', timestamp: 1_234 }),
    );
    expect(parsed).toEqual({ type: 'added', gameId: 'game-1', timestamp: 1234 });
  });

  it('skips invalid signals', () => {
    expect(parseGamesSignal('{}')).toBeNull();
    expect(parseGamesSignal({ type: 'unknown', gameId: 'x' })).toBeNull();
    expect(parseGamesSignal(null)).toBeNull();
  });

  it('emits storage and broadcast side effects', () => {
    emitGamesSignal({ type: 'deleted', gameId: 'game-2' });
    expect(env.localStorageMock.setItem).toHaveBeenCalledWith(
      GAMES_SIGNAL_STORAGE_KEY,
      expect.stringContaining('game-2'),
    );
    expect(env.broadcastMessages.length).toBe(1);
    const parsed = parseGamesSignal(env.broadcastMessages[0]);
    expect(parsed).toEqual(expect.objectContaining({ gameId: 'game-2', type: 'deleted' }));
  });

  it('invokes subscribers on storage events', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToGamesSignal(handler);
    const payload = JSON.stringify({ type: 'deleted', gameId: 'game-5', timestamp: 9 });
    (window as unknown as { dispatchEvent: (ev: StorageEvent) => void }).dispatchEvent({
      key: GAMES_SIGNAL_STORAGE_KEY,
      newValue: payload,
    } as StorageEvent);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deleted', gameId: 'game-5' }),
    );
    unsubscribe();
  });
});
