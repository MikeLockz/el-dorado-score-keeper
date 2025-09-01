"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Minus, Edit, Trash } from "lucide-react"
import { useAppState } from "@/components/state-provider"
import Leaderboard from "@/components/leaderboard"

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function ScoreboardView() {
  const { state, append, ready } = useAppState()
  const [newName, setNewName] = useState("")

  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))
  const scoreOf = (id: string) => state.scores[id] ?? 0

  const addPlayer = async () => {
    const name = newName.trim()
    if (!name) return
    const id = uuid()
    await append({ type: 'player/added', payload: { id, name }, eventId: uuid(), ts: Date.now() })
    setNewName("")
  }

  const bump = async (playerId: string, delta: number) => {
    await append({ type: 'score/added', payload: { playerId, delta }, eventId: uuid(), ts: Date.now() })
  }

  const renamePlayer = async (playerId: string, currentName: string) => {
    const name = prompt('Rename player', currentName)?.trim()
    if (!name || name === currentName) return
    await append({ type: 'player/renamed', payload: { id: playerId, name }, eventId: uuid(), ts: Date.now() })
  }

  const removePlayer = async (playerId: string, currentName: string) => {
    if (!confirm(`Remove player ${currentName}?`)) return
    await append({ type: 'player/removed', payload: { id: playerId }, eventId: uuid(), ts: Date.now() })
  }

  return (
    <div className="p-3 max-w-xl mx-auto">
      <h1 className="text-lg font-bold mb-2 text-center">El Dorado Score Keeper</h1>
      <Leaderboard />

      <Card className="p-2 mb-3">
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add player name" className="h-9" />
          <Button onClick={addPlayer} disabled={!newName.trim()} className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 text-sm">
          <div className="bg-slate-700 text-white p-2 font-bold">Player</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Score</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">-1</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">+1</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Actions</div>
          {ready ? (
            <>
              {players.map((p) => (
                <>
                  <div key={`${p.id}-name`} className="p-2 border-b truncate">{p.name}</div>
                  <div key={`${p.id}-score`} className="p-2 border-b text-center font-mono">{scoreOf(p.id)}</div>
                  <div key={`${p.id}-dec`} className="p-2 border-b text-center">
                    <Button size="sm" variant="outline" onClick={() => bump(p.id, -1)} className="h-7 w-16"><Minus className="h-4 w-4" /></Button>
                  </div>
                  <div key={`${p.id}-inc`} className="p-2 border-b text-center">
                    <Button size="sm" onClick={() => bump(p.id, +1)} className="h-7 w-16"><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div key={`${p.id}-actions`} className="p-2 border-b text-center flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => renamePlayer(p.id, p.name)} className="h-7 px-2"><Edit className="h-4 w-4" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => removePlayer(p.id, p.name)} className="h-7 px-2"><Trash className="h-4 w-4" /></Button>
                  </div>
                </>
              ))}
              {players.length === 0 && (
                <div className="col-span-5 p-4 text-center text-slate-500">Add players to get started.</div>
              )}
            </>
          ) : (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <>
                  <div key={`placeholder-${i}-name`} className="p-2 border-b truncate text-slate-400">-</div>
                  <div key={`placeholder-${i}-score`} className="p-2 border-b text-center font-mono text-slate-400">-</div>
                  <div key={`placeholder-${i}-dec`} className="p-2 border-b text-center">
                    <Button size="sm" variant="outline" disabled className="h-7 w-16"><Minus className="h-4 w-4" /></Button>
                  </div>
                  <div key={`placeholder-${i}-inc`} className="p-2 border-b text-center">
                    <Button size="sm" disabled className="h-7 w-16"><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div key={`placeholder-${i}-actions`} className="p-2 border-b text-center flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" disabled className="h-7 px-2"><Edit className="h-4 w-4" /></Button>
                    <Button size="sm" variant="destructive" disabled className="h-7 px-2"><Trash className="h-4 w-4" /></Button>
                  </div>
                </>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
