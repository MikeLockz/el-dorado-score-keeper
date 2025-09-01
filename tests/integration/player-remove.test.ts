import { describe, it, expect } from 'vitest'
import { initInstance, makeTestDB, drain } from '@/tests/utils/helpers'
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events'

const now = 1_700_000_000_000
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now })

describe('player removal integration', () => {
  it('removal cleans up state and persists across rehydrate', async () => {
    const dbName = makeTestDB('pr')
    const a = await initInstance(dbName)
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'pr-1'))
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, 'pr-2'))
    await a.append(ev('score/added', { playerId: 'p2', delta: 4 }, 'pr-3'))
    await a.append(ev('bid/set', { round: 1, playerId: 'p2', bid: 2 }, 'pr-4'))
    await a.append(ev('made/set', { round: 1, playerId: 'p2', made: true }, 'pr-5'))
    await a.append(ev('player/removed', { id: 'p2' }, 'pr-6'))

    expect(a.getState().players.p2).toBeUndefined()
    expect(a.getState().scores.p2).toBeUndefined()
    expect(a.getState().rounds[1].bids.p2).toBeUndefined()
    expect(a.getState().rounds[1].made.p2).toBeUndefined()
    const height = a.getHeight()
    a.close()

    // re-open
    const b = await initInstance(dbName)
    expect(b.getHeight()).toBe(height)
    expect(b.getState().players.p2).toBeUndefined()
    expect(b.getState().scores.p2).toBeUndefined()
    expect(b.getState().rounds[1].bids.p2).toBeUndefined()
    expect(b.getState().rounds[1].made.p2).toBeUndefined()
    b.close()
  })

  it('removal syncs across tabs via BroadcastChannel', async () => {
    const dbName = makeTestDB('prtab')
    const A = await initInstance(dbName)
    const B = await initInstance(dbName)
    await A.append(ev('player/added', { id: 'p1', name: 'A' }, 'pt-1'))
    await A.append(ev('player/added', { id: 'p2', name: 'B' }, 'pt-2'))
    await drain()
    for (let i = 0; i < 50 && B.getState().players.p2 !== 'B'; i++) await drain()
    expect(B.getState().players.p2).toBe('B')
    // remove from A
    await A.append(ev('player/removed', { id: 'p2' }, 'pt-3'))
    await drain()
    expect(B.getState().players.p2).toBeUndefined()
    expect(B.getState().scores.p2).toBeUndefined()
    expect(B.getState().rounds[1].bids.p2).toBeUndefined()
    expect(B.getState().rounds[1].made.p2).toBeUndefined()
    A.close(); B.close()
  })
})
