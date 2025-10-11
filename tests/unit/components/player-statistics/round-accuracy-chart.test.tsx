import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RoundAccuracyChart } from '@/app/players/[playerId]/statistics/components/RoundAccuracyChart';
import type { RoundMetric } from '@/lib/state/player-statistics';

function buildEmptyMetrics(): RoundMetric[] {
  return Array.from({ length: 10 }, (_, index) => ({
    roundNo: index + 1,
    bidCount: 0,
    bids: [],
    highestBid: null,
    lowestBid: null,
    accuracyPercent: null,
    accuracyMatches: 0,
    accuracyTotal: 0,
  }));
}

describe('RoundAccuracyChart', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders summary values for provided metrics', () => {
    const metrics = buildEmptyMetrics();
    metrics[0] = {
      roundNo: 1,
      bidCount: 2,
      bids: [2, 4],
      highestBid: 4,
      lowestBid: 2,
      accuracyMatches: 1,
      accuracyTotal: 2,
      accuracyPercent: 50,
    };

    render(<RoundAccuracyChart loading={false} metrics={metrics} />);

    expect(screen.getByText(/Overall accuracy/i)).toBeTruthy();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText(/Exact matches/i)).toBeTruthy();
    expect(screen.getByText(/of 2 rounds/i)).toBeTruthy();
    expect(screen.getByText(/Bids logged/i)).toBeTruthy();
    expect(screen.getByText(/Top bid/i)).toBeTruthy();
  });

  it('shows empty overlay when no round data exists', () => {
    render(<RoundAccuracyChart loading={false} metrics={buildEmptyMetrics()} />);

    expect(screen.getByText(/Complete a game to unlock round accuracy insights/i)).toBeTruthy();
  });

  it('prefers load error message for empty state', () => {
    render(
      <RoundAccuracyChart loading={false} metrics={buildEmptyMetrics()} loadError="db blocked" />,
    );

    expect(
      screen.getByText(
        /Historical data unavailable\. Live games will populate round insights once complete\./i,
      ),
    ).toBeTruthy();
  });
});
