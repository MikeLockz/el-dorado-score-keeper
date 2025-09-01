"use client"

import React, { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Edit, Trash } from 'lucide-react'
import { useAppState } from '@/components/state-provider'
import { events } from '@/lib/state/events'

export default function PlayerList() {
  const { state, append, ready } = useAppState()
  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))

  const renamePlayer = async (playerId: string, currentName: string) => {
    const name = prompt('Rename player', currentName)?.trim()
    if (!name || name === currentName) return
    await append(events.playerRenamed({ id: playerId, name }))
  }

  const removePlayer = async (playerId: string, currentName: string) => {
    if (!confirm(`Remove player ${currentName}?`)) return
    await append(events.playerRemoved({ id: playerId }))
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-x-2 text-sm">
        <div className="bg-slate-700 text-white p-2 font-bold">Player</div>
        <div className="bg-slate-700 text-white p-2 font-bold text-center">Actions</div>
        {ready ? (
          <>
            {players.map((p) => (
              <Fragment key={p.id}>
                <div className="p-2 border-b truncate">{p.name}</div>
                <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => renamePlayer(p.id, p.name)} className="h-7 px-2"><Edit className="h-4 w-4" /></Button>
                  <Button size="sm" variant="destructive" onClick={() => removePlayer(p.id, p.name)} className="h-7 px-2"><Trash className="h-4 w-4" /></Button>
                </div>
              </Fragment>
            ))}
            {players.length === 0 && (
              <div className="col-span-2 p-4 text-center text-slate-500">Add players to get started.</div>
            )}
          </>
        ) : (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Fragment key={`placeholder-${i}`}>
                <div className="p-2 border-b truncate text-slate-400">-</div>
                <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled className="h-7 px-2"><Edit className="h-4 w-4" /></Button>
                  <Button size="sm" variant="destructive" disabled className="h-7 px-2"><Trash className="h-4 w-4" /></Button>
                </div>
              </Fragment>
            ))}
          </>
        )}
      </div>
    </Card>
  )
}
