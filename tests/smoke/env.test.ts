import { describe, it, expect } from 'vitest'

describe('indexedDB basic flow', () => {
  it('orders events by auto-increment seq', async () => {
    const openReq = indexedDB.open('test-db-1', 1)
    openReq.onupgradeneeded = () => {
      const db = openReq.result
      const store = db.createObjectStore('events', { keyPath: 'seq', autoIncrement: true })
      store.createIndex('eventId', 'eventId', { unique: true })
    }
    const db = await new Promise<IDBDatabase>((res, rej) => {
      openReq.onsuccess = () => res(openReq.result)
      openReq.onerror = () => rej(openReq.error)
    })

    // add two events in a single transaction
    const tx = db.transaction(['events'], 'readwrite')
    const store = tx.objectStore('events')
    const e1 = { eventId: 'a', type: 't', payload: { x: 1 }, ts: 1 }
    const e2 = { eventId: 'b', type: 't', payload: { x: 2 }, ts: 2 }
    const seq1 = await new Promise<number>((res, rej) => {
      const r = store.add(e1)
      r.onsuccess = () => res(r.result as number)
      r.onerror = () => rej(r.error)
    })
    const seq2 = await new Promise<number>((res, rej) => {
      const r = store.add(e2)
      r.onsuccess = () => res(r.result as number)
      r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res(null)
      tx.onerror = () => rej(tx.error)
      tx.onabort = () => rej(tx.error)
    })
    expect(seq1).toBeLessThan(seq2)

    // cursor from seq1+1 yields only the second
    const tx2 = db.transaction(['events'], 'readonly')
    const hits: any[] = []
    await new Promise<void>((res, rej) => {
      const range = IDBKeyRange.lowerBound(seq1 + 1)
      const req = tx2.objectStore('events').openCursor(range)
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return res()
        hits.push(cursor.value)
        cursor.continue()
      }
      req.onerror = () => rej(req.error)
    })
    expect(hits).toHaveLength(1)
    expect(hits[0].payload.x).toBe(2)
    db.close()
  })
})

describe('BroadcastChannel polyfill', () => {
  it('delivers messages between instances', async () => {
    const a = new BroadcastChannel('chan') as any
    const b = new BroadcastChannel('chan') as any
    const received: any[] = []
    b.onmessage = (ev: MessageEvent) => received.push(ev.data)
    a.postMessage({ hello: 'world' })
    // allow microtask turn
    await Promise.resolve()
    expect(received).toEqual([{ hello: 'world' }])
    a.close(); b.close()
  })
})

describe('localStorage polyfill', () => {
  it('stores and emits storage events', async () => {
    const events: StorageEvent[] = []
    addEventListener('storage', (ev: any) => events.push(ev))
    localStorage.setItem('k', '1')
    expect(localStorage.getItem('k')).toBe('1')
    expect(events.length).toBe(1)
    expect(events[0].key).toBe('k')
  })
})

