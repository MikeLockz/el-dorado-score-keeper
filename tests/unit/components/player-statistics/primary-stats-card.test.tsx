import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { PrimaryStatsCard } from '@/app/players/[playerId]/statistics/components/PrimaryStatsCard';

describe('PrimaryStatsCard', () => {
  it('shows ellipsis placeholders while loading', () => {
    render(<PrimaryStatsCard loading metrics={null} />);

    expect(screen.getAllByText(/Total games/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('...').length).toBeGreaterThanOrEqual(3);
  });

  it('renders formatted metrics when provided', () => {
    render(
      <PrimaryStatsCard
        loading={false}
        metrics={{ totalGamesPlayed: 12, totalGamesWon: 7, winRatePercent: 58.3 }}
      />,
    );

    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('7').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/58.3%/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty message when no games played', () => {
    render(
      <PrimaryStatsCard
        loading={false}
        metrics={{ totalGamesPlayed: 0, totalGamesWon: 0, winRatePercent: 0 }}
      />,
    );

    expect(
      screen.getAllByText(/Complete a game to unlock win insights/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('shows degraded message when load error present', () => {
    render(
      <PrimaryStatsCard
        loading={false}
        metrics={{ totalGamesPlayed: 0, totalGamesWon: 0, winRatePercent: 0 }}
        loadError="db down"
      />,
    );

    expect(
      screen.getAllByText(/Historical data unavailable. Metrics reflect live games only./i).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
