import { describe, it, expect, beforeEach } from 'vitest'
import { createInstance } from '@/lib/state/instance'

const now = 1_700_000_000_000

function ev(type: string, payload: any, eventId: string) {
  return { type, payload, eventId, ts: now }
}

describe('state instance (single)', () => {
  beforeEach(() => {
    // unique DB per test
    const rnd = Math.random().toString(36).slice(2)
    ;(globalThis as any).__DB_NAME__ = `inst-${rnd}`
  })

  it('appends events and rehydrates correctly', async () => {
    const dbName = (globalThis as any).__DB_NAME__
    const a = await createInstance({ dbName, channelName: `chan-${dbName}` })
    expect(a.getHeight()).toBe(0)
    expect(a.getState().players).toEqual({})

    await a.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'))
    await a.append(ev('score/added', { playerId: 'p1', delta: 7 }, 'e2'))
    expect(a.getHeight()).toBe(2)
    expect(a.getState().players).toEqual({ p1: 'Alice' })
    expect(a.getState().scores).toEqual({ p1: 7 })

    a.close()

    // re-open and ensure state persists and tails apply
    const b = await createInstance({ dbName, channelName: `chan-${dbName}` })
    expect(b.getHeight()).toBe(2)
    expect(b.getState().scores.p1).toBe(7)
    await b.append(ev('score/added', { playerId: 'p1', delta: 3 }, 'e3'))
    expect(b.getHeight()).toBe(3)
    expect(b.getState().scores.p1).toBe(10)
    b.close()
  })
})

describe('state instance (multi-tab)', () => {
  it('keeps instances in sync via BroadcastChannel', async () => {
    const dbName = `mt-${Math.random().toString(36).slice(2)}`
    const A = await createInstance({ dbName, channelName: `chan-${dbName}` })
    const B = await createInstance({ dbName, channelName: `chan-${dbName}` })

    await A.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'))
    await new Promise(res => setTimeout(res, 0))
    expect(B.getHeight()).toBe(1)
    expect(B.getState().players.p1).toBe('Alice')

    // Interleaved appends from both
    await Promise.all([
      A.append(ev('score/added', { playerId: 'p1', delta: 4 }, 'e2')),
      B.append(ev('score/added', { playerId: 'p1', delta: 6 }, 'e3')),
    ])
    await new Promise(res => setTimeout(res, 0))
    expect(A.getState().scores.p1).toBe(10)
    expect(B.getState().scores.p1).toBe(10)

    A.close(); B.close()
  })
})

describe('idempotent duplicate append', () => {
  it('does not double-apply on duplicate eventId', async () => {
    const dbName = `dup-${Math.random().toString(36).slice(2)}`
    const a = await createInstance({ dbName, channelName: `chan-${dbName}` })
    const e = ev('score/added', { playerId: 'p1', delta: 5 }, 'dup-1')
    // ensure player exists
    await a.append(ev('player/added', { id: 'p1', name: 'P' }, 'dup-0'))
    const s1 = await a.append(e)
    const s2 = await a.append(e) // duplicate
    expect(s2).toBe(s1)
    expect(a.getState().scores.p1).toBe(5)
    // Count events in DB should be 2 (player+score)
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction(['events'], 'readonly')
    const count = await new Promise<number>((res, rej) => {
      const req = tx.objectStore('events').count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    expect(count).toBe(2)
    db.close(); a.close()
  })
})
