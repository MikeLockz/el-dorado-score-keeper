'use client';
import React from 'react';

import { Card } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectLeaders } from '@/lib/state';

import styles from './leaderboard.module.scss';

export default function Leaderboard({ limit = 5 }: { limit?: number }) {
  const { state } = useAppState();
  const leaders = selectLeaders(state).slice(0, limit);
  if (leaders.length === 0) return null;
  return (
    <Card className={styles.card}>
      <div className={styles.heading}>Leaders</div>
      <ul className={styles.list}>
        {leaders.map((l) => (
          <li key={l.id} className={styles.listItem}>
            <span className={styles.name}>{l.name}</span>
            <span className={styles.score}>{l.score}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
