import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events'
import { makeTestDB } from '@/tests/utils/helpers'

const now = 1_700_000_000_000
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now })

describe('rehydrate safety', () => {
  it('falls back to last valid snapshot when current and latest snapshot are invalid', async () => {
    const dbName = makeTestDB('rehyd-safe-1')
    // Use frequent snapshots for testing
    let inst = await createInstance({ dbName, channelName: `chan-${dbName}`, snapshotEvery: 2 })
    await inst.append(ev('player/added', { id: 'p1', name: 'Alice' }, 's1')) // h=1
    await inst.append(ev('score/added', { playerId: 'p1', delta: 3 }, 's2')) // h=2, snapshot
    await inst.append(ev('player/added', { id: 'p2', name: 'Bob' }, 's3')) // h=3
    await inst.append(ev('score/added', { playerId: 'p2', delta: 7 }, 's4')) // h=4, snapshot
    inst.close()

    // Corrupt current and latest snapshot (h=4)
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    // Corrupt current
    await new Promise<void>((res, rej) => {
      const t = db.transaction(['state'], 'readwrite')
      const bad = { id: 'current', height: 'NaN', state: { oops: true } } as any
      const put = t.objectStore('state').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    // Overwrite latest snapshot with invalid shape
    await new Promise<void>((res, rej) => {
      const t = db.transaction(['snapshots'], 'readwrite')
      const bad = { height: 4, state: { players: 'not-an-object' } } as any
      const put = t.objectStore('snapshots').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    db.close()

    const warnings: string[] = []
    inst = await createInstance({ dbName, channelName: `chan-${dbName}`, onWarn: (code) => warnings.push(code) })

    // Should have warned about invalid current and invalid snapshot
    expect(warnings).toContain('state.invalid_current')
    expect(warnings).toContain('rehydrate.snapshot_invalid_record')

    // State should be fully rebuilt to latest height by applying tail from last good snapshot (h=2)
    expect(inst.getHeight()).toBe(4)
    expect(inst.getState().players).toEqual({ p1: 'Alice', p2: 'Bob' })
    expect(inst.getState().scores).toEqual({ p1: 3, p2: 7 })
    inst.close()
  })

  it('rebuilds from first principles when no valid snapshots exist', async () => {
    const dbName = makeTestDB('rehyd-safe-2')
    let inst = await createInstance({ dbName, channelName: `chan-${dbName}`, snapshotEvery: 2 })
    await inst.append(ev('player/added', { id: 'p1', name: 'Alice' }, 't1')) // h=1
    await inst.append(ev('score/added', { playerId: 'p1', delta: 5 }, 't2')) // h=2, snapshot
    await inst.append(ev('score/added', { playerId: 'p1', delta: 1 }, 't3')) // h=3
    inst.close()

    // Corrupt current and the only snapshot
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const t = db.transaction(['state'], 'readwrite')
      const bad = { id: 'current', height: 'NaN', state: { nope: 1 } } as any
      const put = t.objectStore('state').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    await new Promise<void>((res, rej) => {
      const t = db.transaction(['snapshots'], 'readwrite')
      const bad = { height: 2, state: { players: 123 } } as any
      const put = t.objectStore('snapshots').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    db.close()

    const warnings: string[] = []
    inst = await createInstance({ dbName, channelName: `chan-${dbName}`, onWarn: (code) => warnings.push(code) })

    expect(warnings).toContain('state.invalid_current')
    // Either a specific invalid snapshot warning and/or aggregate no_valid_snapshot
    expect(warnings).toContain('rehydrate.snapshot_invalid_record')
    expect(warnings).toContain('rehydrate.no_valid_snapshot')

    // Fully rebuilt from events (INITIAL_STATE + apply all 3 events)
    expect(inst.getHeight()).toBe(3)
    expect(inst.getState().players).toEqual({ p1: 'Alice' })
    expect(inst.getState().scores).toEqual({ p1: 6 })
    inst.close()
  })
})

