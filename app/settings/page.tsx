"use client"

import React from 'react'
import { useAppState } from '@/components/state-provider'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function SettingsPage() {
  const { state, append, ready } = useAppState()
  const players = Object.entries(state.players)
  const hasPlayers = players.length > 0

  const resetPlayers = async () => {
    if (!hasPlayers) return
    if (!confirm('Remove all players? This will clear scores and per-round data for them.')) return
    for (const [id] of players) {
      await append({ type: 'player/removed', payload: { id }, eventId: uuid(), ts: Date.now() })
    }
  }

  return (
    <div className="p-3 max-w-xl mx-auto">
      <h1 className="text-lg font-bold mb-3">Settings</h1>
      <Card className="p-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">Reset Players</div>
          <div className="text-sm text-slate-600">Remove all players from the current game.</div>
        </div>
        <Button variant="destructive" onClick={resetPlayers} disabled={!ready || !hasPlayers}>
          Reset Players
        </Button>
      </Card>
    </div>
  )
}

