"use client"

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { GameRecord } from '@/lib/state/io'
import { listGames, archiveCurrentGameAndReset, deleteGame, restoreGame } from '@/lib/state/io'

const DB_NAME = 'app-db'

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()

  const load = React.useCallback(async () => {
    try {
      const list = await listGames(DB_NAME)
      setGames(list)
    } catch (e) {
      console.warn('Failed to load games', e)
      setGames([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const onNewGame = async () => {
    if (loading) return
    setLoading(true)
    try {
      const title = prompt('Title for archived game (optional)') || undefined
      await archiveCurrentGameAndReset(DB_NAME, { title })
      await load()
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const onRestore = async (id: string) => {
    if (!confirm('Restore this game as current? Current progress will be replaced.')) return
    await restoreGame(DB_NAME, id)
    router.push('/')
  }

  const onDelete = async (id: string) => {
    if (!confirm('Delete this archived game? This cannot be undone.')) return
    await deleteGame(DB_NAME, id)
    await load()
  }

  return (
    <div className="p-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Games</h1>
        <Button onClick={onNewGame} disabled={loading}>{loading ? 'Working…' : 'New Game'}</Button>
      </div>
      <Card className="p-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-sm items-center">
          <div className="bg-slate-700 text-white p-2 font-bold">Title</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Players</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Winner</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Actions</div>
          {games === null ? (
            <div className="col-span-4 p-4 text-center text-slate-500">Loading…</div>
          ) : games.length === 0 ? (
            <div className="col-span-4 p-4 text-center text-slate-500">No archived games yet.</div>
          ) : (
            games.map(g => (
              <React.Fragment key={g.id}>
                <div className="p-2 border-b truncate">
                  <div className="font-medium">{g.title || 'Untitled'}</div>
                  <div className="text-[0.7rem] text-slate-500">{new Date(g.finishedAt).toLocaleString()}</div>
                </div>
                <div className="p-2 border-b text-center">{g.summary.players}</div>
                <div className="p-2 border-b text-center">{g.summary.winnerName ?? '-'}</div>
                <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                  <Link href={`/games/${g.id}`} className="underline text-slate-700">View</Link>
                  <button onClick={() => onRestore(g.id)} className="underline text-sky-700">Restore</button>
                  <button onClick={() => onDelete(g.id)} className="underline text-red-700">Delete</button>
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

