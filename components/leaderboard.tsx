'use client';
import React from 'react';
import { useAppState } from '@/components/state-provider';
import { selectLeaders } from '@/lib/state';
import { Card } from '@/components/ui';

export default function Leaderboard({ limit = 5 }: { limit?: number }) {
  const { state } = useAppState();
  const leaders = selectLeaders(state).slice(0, limit);
  if (leaders.length === 0) return null;
  return (
    <Card className="p-2 mb-2">
      <div className="text-xs font-semibold text-slate-600 mb-1">Leaders</div>
      <ul className="text-sm">
        {leaders.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-0.5">
            <span className="truncate mr-2">{l.name}</span>
            <span className="font-mono font-semibold">{l.score}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
