import { describe, it, expect } from 'vitest'
import { initInstance, makeTestDB } from '@/tests/utils/helpers'
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events'

const now = 1_700_000_000_000
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now })

describe('resilience and recovery', () => {
  it("rebuilds from events when state['current'] is corrupt", async () => {
    const dbName = makeTestDB('res')
    const a = await initInstance(dbName)
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'r1'))
    await a.append(ev('score/added', { playerId: 'p1', delta: 5 }, 'r2'))
    a.close()

    // Corrupt current state record directly
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const t = db.transaction(['state'], 'readwrite')
    await new Promise<void>((res, rej) => {
      const bad = { id: 'current', height: 'NaN', state: { foo: 'bar' } } as any
      const put = t.objectStore('state').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    db.close()

    const b = await initInstance(dbName)
    expect(b.getHeight()).toBe(2)
    expect(b.getState().players).toEqual({ p1: 'A' })
    expect(b.getState().scores).toEqual({ p1: 5 })
    b.close()
  })

  it('skips malformed event records during rehydrate without crashing', async () => {
    const dbName = makeTestDB('bad')
    const a = await initInstance(dbName)
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'b1'))
    a.close()

    // Inject malformed event (missing type)
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const t = db.transaction(['events'], 'readwrite')
    await new Promise<void>((res, rej) => {
      const bad: any = { eventId: 'b-bad', payload: { x: 1 }, ts: now }
      const add = t.objectStore('events').add(bad)
      add.onsuccess = () => res()
      add.onerror = () => rej(add.error)
    })
    db.close()

    const b = await initInstance(dbName)
    // State remains consistent; malformed record ignored by reducer default branch
    expect(b.getState().players).toEqual({ p1: 'A' })
    b.close()
  })
})
