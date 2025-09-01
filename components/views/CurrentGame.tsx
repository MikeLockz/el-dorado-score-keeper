"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, X, Plus, Minus } from "lucide-react"
import { useAppState } from "@/components/state-provider"
import { twoCharAbbrs } from "@/lib/utils"

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type RoundState = 'locked' | 'bidding' | 'complete' | 'scored'

function labelForRoundState(s: RoundState) {
  return s === 'locked' ? 'Locked' : s === 'bidding' ? 'Active' : s === 'complete' ? 'Complete' : 'Scored'
}

function getRoundStateStyles(state: RoundState) {
  switch (state) {
    case "locked":
      return "bg-gray-900 text-gray-400"
    case "bidding":
      return "bg-sky-300 text-sky-900 shadow-sm"
    case "complete":
      return "bg-orange-300 text-orange-900"
    case "scored":
      return "bg-emerald-300 text-emerald-900"
  }
}

function getPlayerCellBackgroundStyles(state: RoundState) {
  switch (state) {
    case "locked":
      return "bg-gray-900"
    case "bidding":
      return "bg-sky-50"
    case "complete":
      return "bg-orange-50"
    case "scored":
      return "bg-emerald-50"
  }
}

// Shrinks row text to keep everything on a single line without wrapping
function FitRow({ full, abbrev, className, maxRem = 0.65, minRem = 0.5, step = 0.02, abbrevAtRem = 0.55 }: { full: React.ReactNode; abbrev?: React.ReactNode; className?: string; maxRem?: number; minRem?: number; step?: number; abbrevAtRem?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState(maxRem)
  const [useAbbrev, setUseAbbrev] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const fit = () => {
      if (!el) return
      let current = maxRem
      el.style.fontSize = `${current}rem`
      // Ensure no wrapping and reduce until it fits
      while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && current > minRem) {
        current = Math.max(minRem, current - step)
        el.style.fontSize = `${current}rem`
      }
      setSize(current)
      if (!useAbbrev && abbrev && current <= abbrevAtRem) {
        // Switch to abbreviated labels and let next frame refit
        setUseAbbrev(true)
      }
    }
    fit()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [maxRem, minRem, step, full, abbrev, useAbbrev, abbrevAtRem])

  return (
    <div ref={ref} className={`whitespace-nowrap overflow-hidden ${className ?? ''}`} style={{ fontSize: `${size}rem` }}>
      {useAbbrev && abbrev ? abbrev : full}
    </div>
  )
}

export default function CurrentGame() {
  const { state, append, ready } = useAppState()
  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))
  const abbr = twoCharAbbrs(players)
  const [detailCells, setDetailCells] = React.useState<Record<string, boolean>>({})
  const toggleCellDetails = (round: number, playerId: string) => {
    const key = `${round}-${playerId}`
    setDetailCells((m) => ({ ...m, [key]: !m[key] }))
  }

  const cumulativeScoreThrough = React.useCallback((roundNo: number, playerId: string) => {
    let total = 0
    for (let r = 1; r <= roundNo; r++) {
      const rd = state.rounds[r]
      if (!rd || rd.state !== 'scored') continue
      const bid = rd.bids[playerId] ?? 0
      const made = rd.made[playerId] ?? false
      total += (made ? 1 : -1) * (5 + bid)
    }
    return total
  }, [state.rounds])

  // Before state hydration: show 4 placeholder columns to avoid layout shift.
  const DEFAULT_COLUMNS = 4
  const useDefault = !ready
  const columnCount = useDefault ? DEFAULT_COLUMNS : players.length
  const columns: Array<{ id: string; name: string; placeholder: boolean }> = useDefault
    ? Array.from({ length: DEFAULT_COLUMNS }, (_, i) => ({ id: `placeholder-${i}`, name: '-', placeholder: true }))
    : players.map(p => ({ ...p, placeholder: false }))

  const incrementBid = async (round: number, playerId: string, max: number) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0
    const next = Math.min(max, current + 1)
    if (next !== current) await append({ type: 'bid/set', payload: { round, playerId, bid: next }, eventId: uuid(), ts: Date.now() })
  }
  const decrementBid = async (round: number, playerId: string) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0
    const next = Math.max(0, current - 1)
    if (next !== current) await append({ type: 'bid/set', payload: { round, playerId, bid: next }, eventId: uuid(), ts: Date.now() })
  }
  const toggleMade = async (round: number, playerId: string, made: boolean) => {
    await append({ type: 'made/set', payload: { round, playerId, made }, eventId: uuid(), ts: Date.now() })
  }

  const cycleRoundState = async (round: number) => {
    const current = state.rounds[round]?.state ?? 'locked'
    if (current === 'locked') return
    if (current === 'bidding') {
      await append({ type: 'round/state-set', payload: { round, state: 'complete' }, eventId: uuid(), ts: Date.now() })
      return
    }
    if (current === 'complete') {
      const allMarked = players.every(p => (state.rounds[round]?.made[p.id] ?? null) !== null)
      if (allMarked) {
        await append({ type: 'round/finalize', payload: { round }, eventId: uuid(), ts: Date.now() })
      }
      return
    }
    if (current === 'scored') {
      await append({ type: 'round/state-set', payload: { round, state: 'bidding' }, eventId: uuid(), ts: Date.now() })
    }
  }

  return (
    <div className="p-2 max-w-md mx-auto">
      <Card className="overflow-hidden shadow-lg">
        <div
          className="grid text-[0.65rem] sm:text-xs"
          style={{ gridTemplateColumns: `3rem repeat(${columnCount}, 1fr)` }}
        >
          <div className="bg-slate-700 text-white p-1 font-bold text-center border-b border-r">Rd</div>
          {columns.map((c) => (
            <div key={`hdr-${c.id}`} className="bg-slate-700 text-white p-1 font-bold text-center border-b">{c.placeholder ? '-' : (abbr[c.id] ?? c.name.substring(0, 2))}</div>
          ))}

          {Array.from({ length: 10 }, (_, i) => ({ round: i + 1, tricks: 10 - i })).map((round) => (
            <React.Fragment key={`row-${round.round}`}>
              <div
                className={`p-1 text-center border-b border-r flex flex-col justify-center transition-all duration-200 ${getRoundStateStyles((state.rounds[round.round]?.state ?? 'locked') as RoundState)}`}
                onClick={() => cycleRoundState(round.round)}
              >
                <div className="font-bold text-sm">{round.tricks}</div>
                <div className="text-[0.55rem] mt-0.5 font-semibold">{labelForRoundState((state.rounds[round.round]?.state ?? 'locked') as RoundState)}</div>
              </div>

              {columns.map((c) => {
                const rState = (state.rounds[round.round]?.state ?? 'locked') as RoundState
                const bid = c.placeholder ? 0 : (state.rounds[round.round]?.bids[c.id] ?? 0)
                const made = c.placeholder ? null : (state.rounds[round.round]?.made[c.id] ?? null)
                const max = round.tricks
                const cellKey = `${round.round}-${c.id}`
                const showDetails = rState !== 'scored' ? true : !!detailCells[cellKey]
                return (
                  <div
                    key={`${round.round}-${c.id}`}
                    className={`border-b grid grid-cols-1 ${showDetails ? 'grid-rows-2' : 'grid-rows-1'} transition-all duration-200 ${getPlayerCellBackgroundStyles(rState)}`}
                    onClick={() => {
                      if (rState === 'scored') toggleCellDetails(round.round, c.id)
                    }}
                  >
                    {c.placeholder ? (
                      <>
                        <div className="border-b flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                        <div className="flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                      </>
                    ) : rState === 'locked' ? (
                      <>
                        <div className="border-b flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                        <div className="flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                      </>
                    ) : rState === 'bidding' ? (
                      <>
                        <div className="border-b flex items-center justify-between px-1 py-0.5">
                          <Button size="sm" variant="outline" className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700" onClick={() => decrementBid(round.round, c.id)} disabled={bid <= 0}><Minus className="h-2 w-2" /></Button>
                          <span className="text-[0.7rem] font-bold min-w-[1rem] text-center text-sky-900 bg-white/60 px-1 rounded">{bid}</span>
                          <Button size="sm" variant="outline" className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700" onClick={() => incrementBid(round.round, c.id, max)} disabled={bid >= max}><Plus className="h-2 w-2" /></Button>
                        </div>
                        <div className="flex items-center justify-between px-1 py-0.5">
                          <span className="text-[0.6rem] text-sky-700 font-medium">Bid</span>
                          <span className="w-8 h-5 text-center text-[0.65rem] font-semibold text-sky-900">{bid}</span>
                        </div>
                      </>
                    ) : rState === 'complete' ? (
                      <>
                        <div className="border-b flex items-center justify-between px-1 py-0.5">
                          <span className="text-[0.6rem] text-orange-800 font-medium">Bid: {bid}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1 py-0.5">
                          <Button size="sm" variant={made === true ? 'default' : 'outline'} className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300" onClick={() => toggleMade(round.round, c.id, true)}><Check className="h-3 w-3" /></Button>
                          <Button size="sm" variant={made === false ? 'destructive' : 'outline'} className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300" onClick={() => toggleMade(round.round, c.id, false)}><X className="h-3 w-3" /></Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {showDetails ? (
                          <>
                            <FitRow
                              className="flex items-center justify-between px-1 py-0.5"
                              maxRem={0.65}
                              minRem={0.5}
                              full={
                                <>
                                  <span className={`${made ? 'text-emerald-800' : 'text-red-700'} font-medium`}>{made ? 'Made' : 'Missed'}</span>
                                  <span className="text-emerald-700">Bid: {bid}</span>
                                </>
                              }
                            />
                            <FitRow
                              className="flex items-center justify-between px-1 py-0.5"
                              maxRem={0.65}
                              minRem={0.5}
                              abbrevAtRem={0.55}
                              full={
                                <>
                                  <span className={`${made ? 'text-green-700' : 'text-red-700'} font-semibold`}>Round: {(made ? 1 : -1) * (5 + bid)}</span>
                                  {(() => {
                                    const cum = cumulativeScoreThrough(round.round, c.id)
                                    const isNeg = cum < 0
                                    return (
                                      <span>
                                        <span className="mr-1">Total:</span>
                                        {isNeg ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                            <span className="text-red-700 leading-none">{Math.abs(cum)}</span>
                                          </span>
                                        ) : (
                                          <span className="text-emerald-900">{cum}</span>
                                        )}
                                      </span>
                                    )
                                  })()}
                                </>
                              }
                              abbrev={
                                <>
                                  <span className={`${made ? 'text-green-700' : 'text-red-700'} font-semibold`}>Rnd: {(made ? 1 : -1) * (5 + bid)}</span>
                                  {(() => {
                                    const cum = cumulativeScoreThrough(round.round, c.id)
                                    const isNeg = cum < 0
                                    return (
                                      <span>
                                        <span className="mr-1">Tot:</span>
                                        {isNeg ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                            <span className="text-red-700 leading-none">{Math.abs(cum)}</span>
                                          </span>
                                        ) : (
                                          <span className="text-emerald-900">{cum}</span>
                                        )}
                                      </span>
                                    )
                                  })()}
                                </>
                              }
                            />
                          </>
                        ) : (
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-1 py-1 select-none">
                            <span className="w-full text-right font-extrabold text-xl text-emerald-900">{bid}</span>
                            <span className="px-1 font-extrabold text-xl text-emerald-900">-</span>
                            {(() => {
                              const cum = cumulativeScoreThrough(round.round, c.id)
                              const isNeg = cum < 0
                              return (
                                <div className="w-full text-left">
                                  {isNeg ? (
                                    <span className="relative inline-flex items-center justify-center align-middle w-[5ch] h-[5ch] rounded-full border-2 border-red-500">
                                      <span className="font-extrabold text-xl text-red-700 leading-none">{Math.abs(cum)}</span>
                                    </span>
                                  ) : (
                                    <span className="font-extrabold text-xl text-emerald-900">{cum}</span>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  )
}
