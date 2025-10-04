'use client';

import React from 'react';
import clsx from 'clsx';

import { Button, Input } from '@/components/ui';
import { Plus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { uuid } from '@/lib/utils';
import type { UUID } from '@/lib/state';
import { events } from '@/lib/state';
import { trackPlayersAdded } from '@/lib/observability/events';

import styles from './create-player.module.scss';

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
    trackPlayersAdded({
      addedCount: 1,
      totalPlayers: Math.max(0, playerCount + 1),
      inputMethod: 'manual-form',
      source: 'players.create-player',
      mode: 'scorecard',
    });
    setName('');
  };

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add player name"
          className={styles.input}
          disabled={maxReached}
        />
        <Button
          onClick={() => void onAdd()}
          disabled={!name.trim() || maxReached}
          className={styles.submitButton}
        >
          <Plus aria-hidden="true" /> Add
        </Button>
      </div>
      <div className={clsx(styles.helper, maxReached && styles.helperDestructive)}>
        {maxReached ? 'Maximum 10 players reached' : '2–10 players supported'}
      </div>
    </div>
  );
}
