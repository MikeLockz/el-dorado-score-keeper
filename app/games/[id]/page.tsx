"use client"

import React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { GameRecord } from '@/lib/state/io'
import { getGame, restoreGame } from '@/lib/state/io'

export default function GameDetailPage() {
  const params = useParams() as { id?: string }
  const id = params?.id as string
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined)
  const router = useRouter()

  React.useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const rec = id ? await getGame(undefined, id) : null
        if (on) setGame(rec)
      } catch (e) {
        console.warn('Failed to load game', e)
        if (on) setGame(null)
      }
    })()
    return () => { on = false }
  }, [id])

  const onRestore = async () => {
    if (!game) return
    if (!confirm('Restore this game as current? Current progress will be replaced.')) return
    await restoreGame(undefined, game.id)
    router.push('/')
  }

  if (game === undefined) {
    return <div className="p-3 max-w-2xl mx-auto">Loading…</div>
  }
  if (!game) {
    return <div className="p-3 max-w-2xl mx-auto">Game not found.</div>
  }

  const scoresEntries = Object.entries(game.summary.scores)
  const playersById = game.summary.playersById

  return (
    <div className="p-3 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold">{game.title || 'Game'}</h1>
          <div className="text-sm text-slate-500">Finished {new Date(game.finishedAt).toLocaleString()}</div>
        </div>
        <Button onClick={onRestore}>Restore</Button>
      </div>

      <Card className="p-2 mb-3">
        <div className="font-semibold mb-2">Final Scores</div>
        {scoresEntries.length === 0 ? (
          <div className="text-slate-500 text-sm">No players</div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
            <div className="font-bold">Player</div>
            <div className="font-bold text-right">Score</div>
            {scoresEntries
              .sort((a, b) => b[1] - a[1])
              .map(([pid, score]) => (
                <React.Fragment key={pid}>
                  <div className="py-1">{playersById[pid] ?? pid}</div>
                  <div className="py-1 text-right font-mono">{score}</div>
                </React.Fragment>
              ))}
          </div>
        )}
      </Card>

      <Card className="p-2">
        <div className="text-sm text-slate-600">Events: {game.bundle.events.length} • Seq: {game.lastSeq}</div>
      </Card>
    </div>
  )
}
