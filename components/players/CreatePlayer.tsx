'use client';

import React from 'react';
import { Button, Input } from '@/components/ui';
import { Plus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { uuid } from '@/lib/utils';
import type { UUID } from '@/lib/state/types';
import { events } from '@/lib/state';

export default function CreatePlayer() {
  const { append, state } = useAppState();
  const [name, setName] = React.useState('');
  const playerCount = Object.keys(state.players || {}).length;
  const maxReached = playerCount >= 10;

  const onAdd = async () => {
    if (maxReached) return;
    const n = name.trim();
    if (!n) return;
    const id: UUID = uuid();
    await append(events.playerAdded({ id, name: n }));
    setName('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add player name"
          className="h-9"
          disabled={maxReached}
        />
        <Button onClick={() => void onAdd()} disabled={!name.trim() || maxReached} className="h-9">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className={`text-[0.72rem] ${maxReached ? 'text-red-600' : 'text-slate-500'}`}>
        {maxReached ? 'Maximum 10 players reached' : '2–10 players supported'}
      </div>
    </div>
  );
}
