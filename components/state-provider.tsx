"use client"
import React from 'react'
import { createInstance } from '@/lib/state/instance'
import type { AppEvent, AppState } from '@/lib/state/types'
import { INITIAL_STATE } from '@/lib/state/types'
import { previewAt as previewFromDB } from '@/lib/state/io'

type Warning = { code: string; info?: any; at: number }

type Ctx = {
  state: AppState
  height: number
  append: (e: AppEvent) => Promise<number>
  previewAt: (height: number) => Promise<AppState>
  warnings: Warning[]
  clearWarnings: () => void
}

const StateCtx = React.createContext<Ctx | null>(null)

export function StateProvider({ children, onWarn }: { children: React.ReactNode; onWarn?: (code: string, info?: any) => void }) {
  const [state, setState] = React.useState<AppState>(INITIAL_STATE)
  const [height, setHeight] = React.useState(0)
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

  const value: Ctx = { state, height, append, previewAt, warnings, clearWarnings: () => setWarnings([]) }
  return <StateCtx.Provider value={value}>{children}</StateCtx.Provider>
}

export function useAppState() {
  const ctx = React.useContext(StateCtx)
  if (!ctx) throw new Error('useAppState must be used within StateProvider')
  return ctx
}
