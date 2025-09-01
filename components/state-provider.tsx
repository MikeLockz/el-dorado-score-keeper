"use client"
import React from 'react'
import { createInstance } from '@/lib/state/instance'
import type { AppEvent, AppState } from '@/lib/state/types'
import { INITIAL_STATE } from '@/lib/state/types'
import { previewAt as previewFromDB } from '@/lib/state/io'
import { events } from '@/lib/state/events'

type Warning = { code: string; info?: any; at: number }

type Ctx = {
  state: AppState
  height: number
  ready: boolean
  append: (e: AppEvent) => Promise<number>
  previewAt: (height: number) => Promise<AppState>
  warnings: Warning[]
  clearWarnings: () => void
}

const StateCtx = React.createContext<Ctx | null>(null)

export function StateProvider({ children, onWarn }: { children: React.ReactNode; onWarn?: (code: string, info?: any) => void }) {
  const [state, setState] = React.useState<AppState>(INITIAL_STATE)
  const [height, setHeight] = React.useState(0)
  const [ready, setReady] = React.useState(false)
  const [warnings, setWarnings] = React.useState<Warning[]>([])
  const instRef = React.useRef<Awaited<ReturnType<typeof createInstance>> | null>(null)
  const dbNameRef = React.useRef<string>('app-db')

  React.useEffect(() => {
    let unsubs: (() => void) | null = null
    let closed = false
    ;(async () => {
      const inst = await createInstance({
        dbName: dbNameRef.current,
        channelName: 'app-events',
        onWarn: (code, info) => {
          const w: Warning = { code, info, at: Date.now() }
          setWarnings(prev => [w, ...prev].slice(0, 20))
          try { onWarn?.(code, info) } catch {}
        },
      })
      if (closed) { inst.close(); return }
      instRef.current = inst
      setState(inst.getState())
      setHeight(inst.getHeight())
      setReady(true)
      unsubs = inst.subscribe((s, h) => { setState(s); setHeight(h) })
    })()
    return () => {
      closed = true
      try { unsubs?.() } catch {}
      try { instRef.current?.close() } catch {}
      instRef.current = null
    }
  }, [])

  async function append(e: AppEvent) {
    if (!instRef.current) throw new Error('State instance not ready')
    return instRef.current.append(e)
  }

  async function previewAt(h: number): Promise<AppState> {
    if (h === height) return state
    return previewFromDB(dbNameRef.current, h)
  }

  // Seed default players on a truly fresh DB (height 0, no players)
  const seedingRef = React.useRef(false)
  React.useEffect(() => {
    if (!ready || seedingRef.current) return
    if (height !== 0) return
    if (Object.keys(state.players || {}).length > 0) return
    seedingRef.current = true
    ;(async () => {
      const inst = instRef.current
      if (!inst) { seedingRef.current = false; return }
      const names = ['Player 1', 'Player 2', 'Player 3', 'Player 4']
      const ids = ['p1', 'p2', 'p3', 'p4']
      try {
        for (let i = 0; i < ids.length; i++) {
          await inst.append(events.playerAdded({ id: ids[i], name: names[i] }, { eventId: `seed:${ids[i]}`, ts: Date.now() + i }))
        }
      } finally {
        seedingRef.current = false
      }
    })()
  }, [ready, height, state.players])

  const value: Ctx = { state, height, ready, append, previewAt, warnings, clearWarnings: () => setWarnings([]) }
  return <StateCtx.Provider value={value}>{children}</StateCtx.Provider>
}

export function useAppState() {
  const ctx = React.useContext(StateCtx)
  if (!ctx) throw new Error('useAppState must be used within StateProvider')
  return ctx
}
