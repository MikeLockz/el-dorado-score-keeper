import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SecondaryStatsCard } from '@/app/players/[playerId]/statistics/components/SecondaryStatsCard';

describe('SecondaryStatsCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders metric labels and formatted values', () => {
    render(
      <SecondaryStatsCard
        loading={false}
        metrics={{
          averageScore: 86.4,
          highestScore: 142,
          lowestScore: 37,
        }}
      />,
    );

    expect(screen.getAllByText(/Average score/i)).toHaveLength(1);
    expect(screen.getByText('86.4')).toBeTruthy();
    expect(screen.getAllByText(/Best game/i)).toHaveLength(1);
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getAllByText(/Toughest game/i)).toHaveLength(1);
    expect(screen.getByText('37')).toBeTruthy();
    expect(screen.queryByText(/Complete a game to unlock score trends/i)).toBeNull();
  });

  it('shows placeholder messaging when no metrics are available', () => {
    render(<SecondaryStatsCard loading={false} metrics={null} />);

    expect(screen.getByText(/Complete a game to unlock score trends/i)).toBeTruthy();
  });

  it('shows historical warning copy when a load error is present and metrics are empty', () => {
    render(
      <SecondaryStatsCard loading={false} metrics={null} loadError="db blocked" />,
    );

    expect(
      screen.getByText(/Historical data unavailable\. Live games will populate score insights/i),
    ).toBeTruthy();
  });

  it('renders loading placeholders for values when loading is true', () => {
    render(
      <SecondaryStatsCard
        loading
        metrics={{
          averageScore: 101.2,
          highestScore: 140,
          lowestScore: 60,
        }}
      />,
    );

    expect(screen.getAllByText('...').length).toBeGreaterThanOrEqual(3);
  });
});
