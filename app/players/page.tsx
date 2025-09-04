'use client';

import React from 'react';
import { useAppState } from '@/components/state-provider';
import { Card, Button } from '@/components/ui';
import PlayerManagement from '@/components/players/PlayerManagement';
import { events } from '@/lib/state';

export default function PlayersPage() {
  const { state, append, ready } = useAppState();
  const players = Object.entries(state.players);
  const hasPlayers = players.length > 0;

  const resetPlayers = async () => {
    if (!hasPlayers) return;
    if (!confirm('Remove all players? This will clear scores and per-round data for them.')) return;
    for (const [id] of players) {
      await append(events.playerRemoved({ id }));
    }
  };

  return (
    <div className="p-3 max-w-xl mx-auto space-y-3">
      <PlayerManagement />

      <Card className="p-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">Reset Players</div>
          <div className="text-sm text-slate-600">Remove all players from the current game.</div>
        </div>
        <Button
          variant="destructive"
          onClick={() => void resetPlayers()}
          disabled={!ready || !hasPlayers}
        >
          Reset Players
        </Button>
      </Card>
    </div>
  );
}
