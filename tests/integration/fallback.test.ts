import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('multi-tab fallback via localStorage storage events', () => {
  it('syncs without BroadcastChannel when disabled', async () => {
    const dbName = `fb-${Math.random().toString(36).slice(2)}`
    const A = await createInstance({ dbName, channelName: `chan-${dbName}`, useChannel: false })
    const B = await createInstance({ dbName, channelName: `chan-${dbName}`, useChannel: false })

    await A.append(ev('player/added', { id: 'p1', name: 'F' }, 'fb-1'))
    // allow storage event to propagate
    await new Promise(res => setTimeout(res, 0))
    expect(B.getHeight()).toBe(1)
    expect(B.getState().players.p1).toBe('F')

    await B.append(ev('score/added', { playerId: 'p1', delta: 2 }, 'fb-2'))
    await new Promise(res => setTimeout(res, 0))
    expect(A.getState().scores.p1).toBe(2)

    A.close(); B.close()
  })
})

