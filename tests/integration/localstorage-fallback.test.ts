import { describe, it, expect } from 'vitest'
import { makeTestDB, initInstance, drain } from '@/tests/utils/helpers'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('localStorage fallback sync (no BroadcastChannel)', () => {
  it('syncs instances via storage events when channel disabled', async () => {
    const dbName = makeTestDB('ls')
    const A = await initInstance(dbName, `chan-${dbName}`, false)
    const B = await initInstance(dbName, `chan-${dbName}`, false)

    await A.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'lse1'))
    await drain()
    expect(B.getHeight()).toBe(1)
    expect(B.getState().players.p1).toBe('Alice')

    await A.append(ev('score/added', { playerId: 'p1', delta: 4 }, 'lse2'))
    await drain()
    expect(B.getState().scores.p1).toBe(4)

    A.close(); B.close()
  })
})
