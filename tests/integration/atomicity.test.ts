import { describe, it, expect } from 'vitest'
import { initInstance, makeTestDB } from '@/tests/utils/helpers'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('transaction atomicity (abort after add)', () => {
  it('aborts entire transaction; no partial event persists', async () => {
    const dbName = makeTestDB('atom')
    const a = await initInstance(dbName)
    // seed player
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'aa-0'))

    // trigger abort after add
    ;(a as any).setTestAbortAfterAddOnce()
    await expect(a.append(ev('score/added', { playerId: 'p1', delta: 9 }, 'aa-1'))).rejects.toBeTruthy()
    const heightAfter = a.getHeight()
    expect(heightAfter).toBe(1)
    a.close()

    // reopen and ensure only the seed event exists in DB
    const b = await initInstance(dbName)
    expect(b.getHeight()).toBe(1)
    expect(b.getState().scores.p1 ?? 0).toBe(0)
    b.close()
  })
})
