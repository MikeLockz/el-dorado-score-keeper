import { describe, it, expect } from 'vitest'
import { createInstance } from '@/lib/state/instance'
import { stateAtHeight } from '@/lib/state/time'

const now = 1_700_000_000_000
const ev = (type: string, payload: any, eventId: string) => ({ type, payload, eventId, ts: now })

describe('time travel: stateAtHeight', () => {
  it('computes state at given height by replaying prefix', async () => {
    const dbName = `tt-${Math.random().toString(36).slice(2)}`
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` })
    await inst.append(ev('player/added', { id: 'p1', name: 'A' }, 't1'))
    await inst.append(ev('player/added', { id: 'p2', name: 'B' }, 't2'))
    await inst.append(ev('score/added', { playerId: 'p1', delta: 5 }, 't3'))
    await inst.append(ev('score/added', { playerId: 'p2', delta: 7 }, 't4'))
    expect(inst.getHeight()).toBe(4)

    const s2 = await stateAtHeight(dbName, 2)
    expect(s2.players).toEqual({ p1: 'A', p2: 'B' })
    expect(s2.scores).toEqual({})

    const s3 = await stateAtHeight(dbName, 3)
    expect(s3.scores).toEqual({ p1: 5 })
    inst.close()
  })
})

