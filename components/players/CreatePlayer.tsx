"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { useAppState } from '@/components/state-provider'
import { uuid } from '@/lib/utils'
import { events } from '@/lib/state/events'


export default function CreatePlayer() {
  const { append } = useAppState()
  const [name, setName] = React.useState('')

  const onAdd = async () => {
    const n = name.trim()
    if (!n) return
    const id = uuid()
    await append(events.playerAdded({ id, name: n }))
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
