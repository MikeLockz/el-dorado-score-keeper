'use client';

import React from 'react';

import { PlayerStatisticsView } from './PlayerStatisticsView';

export type PlayerStatisticsPageClientProps = {
  playerId: string;
};

export default function PlayerStatisticsPageClient({
  playerId,
}: PlayerStatisticsPageClientProps): JSX.Element {
  return <PlayerStatisticsView playerId={playerId} />;
}
