"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { useAppState } from '@/components/state-provider'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function CreatePlayer() {
  const { append } = useAppState()
  const [name, setName] = React.useState('')

  const onAdd = async () => {
    const n = name.trim()
    if (!n) return
    const id = uuid()
    await append({ type: 'player/added', payload: { id, name: n }, eventId: uuid(), ts: Date.now() })
    setName('')
  }

  return (
    <div className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add player name" className="h-9" />
      <Button onClick={onAdd} disabled={!name.trim()} className="h-9">
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  )
}

