"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, X, Plus, Minus } from "lucide-react"
import { useAppState } from "@/components/state-provider"

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
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

export default function RoundsPage() {
  const { state, append } = useAppState()
  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))

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
      <h1 className="text-lg font-bold mb-2 text-center">Rounds</h1>
      <Card className="overflow-hidden shadow-lg">
        <div className="grid grid-cols-[3rem_repeat(4,1fr)] text-[0.65rem] sm:text-xs">
          <div className="bg-slate-700 text-white p-1 font-bold text-center border-b border-r">Rd</div>
          {players.map((p) => (
            <div key={p.id} className="bg-slate-700 text-white p-1 font-bold text-center border-b">{p.name.substring(0,2)}</div>
          ))}

          {Array.from({ length: 10 }, (_, i) => ({ round: i + 1, tricks: 10 - i })).map((round) => (
            <>
              <div
                key={`round-${round.round}`}
                className={`p-1 text-center border-b border-r flex flex-col justify-center transition-all duration-200 ${getRoundStateStyles((state.rounds[round.round]?.state ?? 'locked') as RoundState)}`}
                onClick={() => cycleRoundState(round.round)}
              >
                <div className="font-bold text-sm">{round.tricks}</div>
                <div className="text-[0.55rem] mt-0.5 font-semibold">{labelForRoundState((state.rounds[round.round]?.state ?? 'locked') as RoundState)}</div>
              </div>

              {players.map((p) => {
                const rState = (state.rounds[round.round]?.state ?? 'locked') as RoundState
                const bid = state.rounds[round.round]?.bids[p.id] ?? 0
                const made = state.rounds[round.round]?.made[p.id] ?? null
                const max = round.tricks
                return (
                  <div key={`${round.round}-${p.id}`} className={`border-b grid grid-cols-1 grid-rows-2 transition-all duration-200 ${getPlayerCellBackgroundStyles(rState)}`}>
                    {rState === 'locked' && (
                      <>
                        <div className="border-b flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                        <div className="flex items-center justify-center px-1 py-0.5"><span className="text-[0.6rem] text-gray-500">-</span></div>
                      </>
                    )}
                    {rState === 'bidding' && (
                      <>
                        <div className="border-b flex items-center justify-between px-1 py-0.5">
                          <Button size="sm" variant="outline" className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700" onClick={() => decrementBid(round.round, p.id)} disabled={bid <= 0}><Minus className="h-2 w-2" /></Button>
                          <span className="text-[0.7rem] font-bold min-w-[1rem] text-center text-sky-900 bg-white/60 px-1 rounded">{bid}</span>
                          <Button size="sm" variant="outline" className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700" onClick={() => incrementBid(round.round, p.id, max)} disabled={bid >= max}><Plus className="h-2 w-2" /></Button>
                        </div>
                        <div className="flex items-center justify-between px-1 py-0.5">
                          <span className="text-[0.6rem] text-sky-700 font-medium">Bid</span>
                          <span className="w-8 h-5 text-center text-[0.65rem] font-semibold text-sky-900">{bid}</span>
                        </div>
                      </>
                    )}
                    {rState === 'complete' && (
                      <>
                        <div className="border-b flex items-center justify-between px-1 py-0.5">
                          <span className="text-[0.6rem] text-orange-800 font-medium">Bid: {bid}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1 py-0.5">
                          <Button size="sm" variant={made === true ? 'default' : 'outline'} className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300" onClick={() => toggleMade(round.round, p.id, true)}><Check className="h-3 w-3" /></Button>
                          <Button size="sm" variant={made === false ? 'destructive' : 'outline'} className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300" onClick={() => toggleMade(round.round, p.id, false)}><X className="h-3 w-3" /></Button>
                        </div>
                      </>
                    )}
                    {rState === 'scored' && (
                      <>
                        <div className="border-b flex items-center justify-between px-1 py-0.5">
                          <span className="text-[0.6rem] font-medium text-emerald-800">{made ? 'Made' : 'Missed'}</span>
                          <span className="text-[0.6rem] text-emerald-700">Bid: {bid}</span>
                        </div>
                        <div className="flex items-center justify-between px-1 py-0.5">
                          <span className={`text-[0.6rem] font-semibold ${made ? 'text-green-700' : 'text-red-700'}`}>{(made ? 1 : -1) * (5 + bid)}</span>
                          <span className="font-bold text-[0.65rem] text-emerald-900">{(state.scores[p.id] ?? 0)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </Card>
    </div>
  )
}

