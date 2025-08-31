// Fake IndexedDB for Node environment
import 'fake-indexeddb/auto'

// Minimal BroadcastChannel polyfill for Node tests
class TestBroadcastChannel {
  static channels: Map<string, Set<TestBroadcastChannel>> = new Map()
  name: string
  onmessage: ((ev: MessageEvent) => void) | null = null
  private closed = false

  constructor(name: string) {
    this.name = name
    const set = TestBroadcastChannel.channels.get(name) ?? new Set()
    set.add(this)
    TestBroadcastChannel.channels.set(name, set)
  }

  postMessage(data: any) {
    if (this.closed) return
    const set = TestBroadcastChannel.channels.get(this.name)
    if (!set) return
    for (const inst of set) {
      if (inst === this) continue
      const ev = { data } as MessageEvent
      // prefer onmessage if set
      if (typeof inst.onmessage === 'function') {
        inst.onmessage(ev)
      }
      // also dispatch an event for addEventListener compatibility
      ;(inst as any).dispatchEvent?.(new MessageEvent('message', { data }))
    }
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    if (type !== 'message') return
    ;(this as any)._listeners = (this as any)._listeners ?? new Set()
    ;(this as any)._listeners.add(listener)
    ;(this as any).dispatchEvent = (ev: MessageEvent) => {
      for (const l of (this as any)._listeners as Set<(e: MessageEvent) => void>) {
        l(ev)
      }
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    const set = TestBroadcastChannel.channels.get(this.name)
    set?.delete(this)
  }
}

// Always replace with the test polyfill to ensure deterministic behavior
;(globalThis as any).BroadcastChannel = TestBroadcastChannel as any

// Very small localStorage polyfill with storage event
if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>()
  const listeners = new Set<(ev: StorageEvent) => void>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      const oldValue = store.get(k) ?? null
      store.set(k, v)
      const ev = new (class implements StorageEvent {
        readonly type = 'storage'
        readonly key = k
        readonly oldValue = oldValue
        readonly newValue = v
        readonly url = ''
        readonly storageArea: Storage = (globalThis as any).localStorage
        bubbles = false
        cancelable = false
        composed = false
        currentTarget: EventTarget | null = null
        defaultPrevented = false
        eventPhase = 0
        isTrusted = true
        returnValue = true
        srcElement: Element | null = null
        target: EventTarget | null = null
        timeStamp = Date.now()
        composedPath() { return [] }
        initEvent() {}
        preventDefault() {}
        stopImmediatePropagation() {}
        stopPropagation() {}
      })()
      for (const l of listeners) l(ev)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
  const originalAdd = (globalThis as any).addEventListener
  ;(globalThis as any).addEventListener = (type: string, cb: any) => {
    if (type === 'storage') listeners.add(cb)
    if (typeof originalAdd === 'function') {
      try { originalAdd(type as any, cb as any) } catch {}
    }
  }
}
