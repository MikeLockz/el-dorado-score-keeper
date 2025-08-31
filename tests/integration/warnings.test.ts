import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'
import { makeTestDB } from '@/tests/utils/helpers'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, id: string) => ({ type, payload, eventId: id, ts: now })

describe('warnings logger', () => {
  it('emits warning when current state record is invalid', async () => {
    const dbName = makeTestDB('warn1')
    // Seed with some data
    let inst = await createInstance({ dbName, channelName: `chan-${dbName}` })
    await inst.append(ev('player/added', { id: 'p1', name: 'A' }, 'w1'))
    inst.close()

    // Corrupt current
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const t = db.transaction(['state'], 'readwrite')
    await new Promise<void>((res, rej) => {
      const bad = { id: 'current', height: 'NaN', state: { bad: true } } as any
      const put = t.objectStore('state').put(bad)
      put.onsuccess = () => res()
      put.onerror = () => rej(put.error)
    })
    db.close()

    const warnings: string[] = []
    inst = await createInstance({ dbName, channelName: `chan-${dbName}`, onWarn: (code) => warnings.push(code) })
    expect(warnings).toContain('state.invalid_current')
    // state still rebuilt
    expect(inst.getState().players).toEqual({ p1: 'A' })
    inst.close()
  })

  it('emits warning and skips malformed event during rehydrate', async () => {
    const dbName = makeTestDB('warn2')
    // Seed with one valid event
    let inst = await createInstance({ dbName, channelName: `chan-${dbName}` })
    await inst.append(ev('player/added', { id: 'p1', name: 'A' }, 'w2-0'))
    inst.close()

    // Inject malformed event
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const t = db.transaction(['events'], 'readwrite')
    await new Promise<void>((res, rej) => {
      const bad: any = { eventId: 'oops-no-type', payload: {}, ts: now }
      const add = t.objectStore('events').add(bad)
      add.onsuccess = () => res()
      add.onerror = () => rej(add.error)
    })
    db.close()

    const warnings: string[] = []
    inst = await createInstance({ dbName, channelName: `chan-${dbName}`, onWarn: (code) => warnings.push(code) })
    expect(warnings).toContain('rehydrate.malformed_event')
    // Ensure valid state remains as before (no crash, no change from malformed)
    expect(inst.getState().players).toEqual({ p1: 'A' })
    inst.close()
  })
})

