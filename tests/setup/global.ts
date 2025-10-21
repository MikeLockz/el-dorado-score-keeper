// Fake IndexedDB for Node environment
import 'fake-indexeddb/auto';
import { expect } from 'vitest';

expect.extend({
  toBeInTheDocument(received: any) {
    const isNode =
      received !== null &&
      typeof received === 'object' &&
      'isConnected' in (received as { isConnected?: unknown });
    const pass = isNode
      ? Boolean((received as { isConnected?: boolean }).isConnected)
      : received != null;
    return {
      pass,
      message: () =>
        pass
          ? 'expected element not to be present in the document'
          : 'expected element to be present in the document',
    };
  },
});

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): void;
  }
  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): void;
  }
}

// Minimal BroadcastChannel polyfill for Node tests
class TestBroadcastChannel {
  static channels: Map<string, Set<TestBroadcastChannel>> = new Map();
  name: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  private closed = false;

  constructor(name: string) {
    this.name = name;
    const set = TestBroadcastChannel.channels.get(name) ?? new Set();
    set.add(this);
    TestBroadcastChannel.channels.set(name, set);
  }

  postMessage(data: any) {
    if (this.closed) return;
    const set = TestBroadcastChannel.channels.get(this.name);
    if (!set) return;
    for (const inst of set) {
      if (inst === this) continue;
      const ev = { data } as MessageEvent;
      // prefer onmessage if set
      if (typeof inst.onmessage === 'function') {
        inst.onmessage(ev);
      }
      // also dispatch an event for addEventListener compatibility
      (inst as any).dispatchEvent?.(new MessageEvent('message', { data }));
    }
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    if (type !== 'message') return;
    (this as any)._listeners = (this as any)._listeners ?? new Set();
    (this as any)._listeners.add(listener);
    (this as any).dispatchEvent = (ev: MessageEvent) => {
      for (const l of (this as any)._listeners as Set<(e: MessageEvent) => void>) {
        l(ev);
      }
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const set = TestBroadcastChannel.channels.get(this.name);
    set?.delete(this);
  }
}

// Always replace with the test polyfill to ensure deterministic behavior
(globalThis as any).BroadcastChannel = TestBroadcastChannel as any;

// Very small localStorage polyfill with storage event
if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>();
  const listenerRegistryKey = Symbol.for('el-dorado:test:storageListeners');
  type StorageListener = (ev: StorageEvent) => void;
  const listeners: Set<StorageListener> =
    ((globalThis as any)[listenerRegistryKey] as Set<StorageListener> | undefined) ??
    new Set<StorageListener>();
  (globalThis as any)[listenerRegistryKey] = listeners;

  const makeEvent = (key: string, value: string | null, oldValue: string | null) => {
    if (typeof StorageEvent === 'function') {
      try {
        return new StorageEvent('storage', {
          key,
          newValue: value,
          oldValue,
          storageArea: (globalThis as any).localStorage,
        });
      } catch {}
    }
    return new (class implements StorageEvent {
      readonly type = 'storage';
      readonly key = key;
      readonly oldValue = oldValue;
      readonly newValue = value;
      readonly url = '';
      readonly storageArea: Storage = (globalThis as any).localStorage;
      bubbles = false;
      cancelable = false;
      composed = false;
      currentTarget: EventTarget | null = null;
      defaultPrevented = false;
      eventPhase = 0;
      isTrusted = true;
      returnValue = true;
      srcElement: Element | null = null;
      target: EventTarget | null = null;
      timeStamp = Date.now();
      composedPath() {
        return [];
      }
      initEvent() {}
      preventDefault() {}
      stopImmediatePropagation() {}
      stopPropagation() {}
    })();
  };

  const emit = (event: StorageEvent) => {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {}
    }
    const handler = (globalThis as any).onstorage;
    if (typeof handler === 'function') {
      try {
        handler(event);
      } catch {}
    }
    const dispatchers: Array<EventTarget | undefined> = [];
    const globalTarget = globalThis as any as EventTarget | undefined;
    if (globalTarget && typeof (globalTarget as any).dispatchEvent === 'function') {
      dispatchers.push(globalTarget);
    }
    const win = (globalThis as any).window as EventTarget | undefined;
    if (win && win !== globalTarget && typeof (win as any).dispatchEvent === 'function') {
      dispatchers.push(win);
    }
    for (const target of dispatchers) {
      try {
        (target as any).dispatchEvent(event);
      } catch {}
    }
  };

  const localStorageImpl = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      const oldValue = store.get(k) ?? null;
      store.set(k, v);
      emit(makeEvent(k, v, oldValue));
    },
    removeItem: (k: string) => {
      if (!store.has(k)) return;
      const oldValue = store.get(k) ?? null;
      store.delete(k);
      emit(makeEvent(k, null, oldValue));
    },
    clear: () => {
      if (!store.size) return;
      for (const key of Array.from(store.keys())) {
        const oldValue = store.get(key) ?? null;
        store.delete(key);
        emit(makeEvent(key, null, oldValue));
      }
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;

  (globalThis as any).localStorage = localStorageImpl;

  const installListenerHooks = (target: any) => {
    if (!target) return;
    const originalAdd =
      typeof target.addEventListener === 'function'
        ? target.addEventListener.bind(target)
        : undefined;
    const originalRemove =
      typeof target.removeEventListener === 'function'
        ? target.removeEventListener.bind(target)
        : undefined;
    target.addEventListener = (type: string, cb: any, options?: any) => {
      if (type === 'storage' && typeof cb === 'function') {
        listeners.add(cb as StorageListener);
      }
      if (originalAdd) {
        try {
          return originalAdd(type, cb, options);
        } catch {}
      }
      return undefined;
    };
    target.removeEventListener = (type: string, cb: any, options?: any) => {
      if (type === 'storage' && typeof cb === 'function') {
        listeners.delete(cb as StorageListener);
      }
      if (originalRemove) {
        try {
          return originalRemove(type, cb, options);
        } catch {}
      }
      return undefined;
    };
  };

  installListenerHooks(globalThis);
  if ((globalThis as any).window) {
    installListenerHooks((globalThis as any).window);
  }
}
