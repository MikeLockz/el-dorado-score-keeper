import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('resilience: corrupt current state rebuilds from events', () => {
  it('detects invalid current and rebuilds', async () => {
    const dbName = `corr-${Math.random().toString(36).slice(2)}`
    const a = await createInstance({ dbName, channelName: `chan-${dbName}` })
    await a.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'c1'))
    await a.append(ev('score/added', { playerId: 'p1', delta: 2 }, 'c2'))
    expect(a.getHeight()).toBe(2)
    a.close()

    // Corrupt the state record
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const t = db.transaction(['state'], 'readwrite')
    await new Promise<void>((res, rej) => {
      const r = t.objectStore('state').put({ id: 'current', height: 'NaN', state: { bogus: true } } as any)
      r.onsuccess = () => res()
      r.onerror = () => rej(r.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    db.close()

    // New instance should ignore corrupt record and rebuild via events
    const b = await createInstance({ dbName, channelName: `chan-${dbName}` })
    expect(b.getHeight()).toBe(2)
    expect(b.getState().scores.p1).toBe(2)
    b.close()
  })
})

describe('resilience: storage quota error', () => {
  it('surfaces quota error and does not change height', async () => {
    const dbName = `quota-${Math.random().toString(36).slice(2)}`
    const a = await createInstance({ dbName, channelName: `chan-${dbName}` }) as any
    const h0 = a.getHeight()
    a.setTestAppendFailure('quota')
    await expect(a.append(ev('player/added', { id: 'p1', name: 'Q' }, 'q1'))).rejects.toMatchObject({ name: 'QuotaExceededError' })
    expect(a.getHeight()).toBe(h0)
    // next append should work normally
    await a.append(ev('player/added', { id: 'p1', name: 'Q' }, 'q2'))
    expect(a.getHeight()).toBe(h0 + 1)
    a.close()
  })
})

