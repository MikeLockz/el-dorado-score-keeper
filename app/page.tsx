"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Minus } from "lucide-react"
import { useAppState } from "@/components/state-provider"

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function ScoreTracker() {
  const { state, append } = useAppState()
  const [name, setName] = useState("")

  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))
  const scoreOf = (id: string) => state.scores[id] ?? 0

  const addPlayer = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = uuid()
    await append({ type: 'player/added', payload: { id, name: trimmed }, eventId: uuid(), ts: Date.now() })
    setName("")
  }

  const addScore = async (playerId: string, delta: number) => {
    await append({ type: 'score/added', payload: { playerId, delta }, eventId: uuid(), ts: Date.now() })
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-lg font-bold text-center">El Dorado Score Keeper</h1>

      <Card className="p-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder="Add player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPlayer() }}
          />
          <Button onClick={addPlayer} size="sm">Add</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="space-y-2">
          {players.length === 0 && (
            <div className="text-sm text-muted-foreground">No players yet. Add one above.</div>
          )}
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground">score: {scoreOf(p.id)}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(p.id, -5)}><Minus className="h-3 w-3" /></Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(p.id, -1)}>-1</Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(p.id, +1)}>+1</Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(p.id, +5)}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
