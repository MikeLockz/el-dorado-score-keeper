"use client"
import React from 'react'
import { createInstance, type Instance } from '@/lib/state/instance'
import { AppState, INITIAL_STATE, AppEvent } from '@/lib/state/types'
import { stateAtHeight } from '@/lib/state/time'

type Ctx = {
  state: AppState
  height: number
  viewHeight: number | null
  append: (e: AppEvent) => Promise<number>
  setViewHeight: (h: number | null) => void
  previewAt: (h: number) => Promise<AppState>
}

const StateCtx = React.createContext<Ctx | null>(null)

export function useAppState(): Ctx {
  const ctx = React.useContext(StateCtx)
  if (!ctx) throw new Error('StateProvider missing')
  return ctx
}

export function StateProvider({ children, dbName = 'app-db', channelName = 'app-events' }: { children: React.ReactNode; dbName?: string; channelName?: string }) {
  const [state, setState] = React.useState<AppState>(INITIAL_STATE)
  const [height, setHeight] = React.useState(0)
  const [viewHeight, setViewHeight] = React.useState<number | null>(null)
  const instRef = React.useRef<Instance & { setTestAppendFailure?: any } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const inst = await createInstance({ dbName, channelName })
      if (cancelled) return
      instRef.current = inst
      setState(inst.getState())
      setHeight(inst.getHeight())
      const unsub = inst.subscribe((s, h) => { setState(s); setHeight(h) })
      return () => { unsub(); inst.close() }
    })()
    return () => { cancelled = true; instRef.current?.close(); instRef.current = null }
  }, [dbName, channelName])

  const append = React.useCallback(async (e: AppEvent) => {
    if (!instRef.current) throw new Error('Instance not ready')
    return instRef.current.append(e)
  }, [])

  const previewAt = React.useCallback(async (h: number) => {
    return stateAtHeight(dbName, h)
  }, [dbName])

  const value: Ctx = { state, height, viewHeight, append, setViewHeight, previewAt }
  return <StateCtx.Provider value={value}>{children}</StateCtx.Provider>
}

