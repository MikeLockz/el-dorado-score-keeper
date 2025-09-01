"use client"

import React from 'react'
import { Card } from '@/components/ui/card'
import CreatePlayer from './CreatePlayer'
import PlayerList from './PlayerList'

export default function PlayerManagement() {
  return (
    <div className="p-3 max-w-xl mx-auto">
      <h1 className="text-lg font-bold mb-2 text-center">Players</h1>

      <Card className="p-2 mb-3">
        <CreatePlayer />
      </Card>

      <PlayerList />
    </div>
  )
}

