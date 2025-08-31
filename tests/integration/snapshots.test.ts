import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'
import { stateAtHeight } from '@/lib/state/time'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('snapshots', () => {
  it('writes snapshots every 20 events and speeds time travel start', async () => {
    const dbName = `snap-${Math.random().toString(36).slice(2)}`
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` })
    // ensure one player
    await inst.append(ev('player/added', { id: 'p1', name: 'A' }, 's-0'))
    // add 40 score events
    for (let i = 1; i <= 40; i++) {
      await inst.append(ev('score/added', { playerId: 'p1', delta: 1 }, `s-${i}`))
    }
    expect(inst.getHeight()).toBe(41)

    // Verify snapshots exist at 20 and 40
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction(['snapshots'], 'readonly')
    const have20 = await new Promise<any>((res, rej) => {
      const r = tx.objectStore('snapshots').get(20)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const have40 = await new Promise<any>((res, rej) => {
      const r = tx.objectStore('snapshots').get(40)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    expect(have20?.height).toBe(20)
    expect(have40?.height).toBe(40)

    // time travel correctness using snapshots
    const s20 = await stateAtHeight(dbName, 20)
    expect(s20.scores.p1 ?? 0).toBe(19) // 1 player event + 19 scores
    const s40 = await stateAtHeight(dbName, 40)
    expect(s40.scores.p1 ?? 0).toBe(39)

    db.close(); inst.close()
  })
})

