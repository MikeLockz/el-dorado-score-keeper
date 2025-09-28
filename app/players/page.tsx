'use client';

import React from 'react';

import { PlayerManagement } from '@/components/players';

import styles from './page.module.scss';

export default function PlayersPage() {
  return (
    <div className={styles.container}>
      <PlayerManagement />
    </div>
  );
}
