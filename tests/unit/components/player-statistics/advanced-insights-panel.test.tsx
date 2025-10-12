import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AdvancedMetrics } from '@/lib/state/player-statistics';
import { AdvancedInsightsPanel } from '@/app/players/[playerId]/statistics/components/AdvancedInsightsPanel';

const sampleMetrics: AdvancedMetrics = {
  trickEfficiency: {
    averageDelta: -0.4,
    perfectBidStreak: 3,
  },
  suitMastery: {
    trumpWinRateBySuit: {
      clubs: 50,
      diamonds: null,
      hearts: 100,
      spades: null,
    },
    trickSuccessBySuit: {
      clubs: 33.3,
      diamonds: null,
      hearts: 75,
      spades: null,
    },
  },
  scoreVolatility: {
    standardDeviation: 12.5,
    largestComeback: 18,
    largestLeadBlown: null,
  },
  momentum: {
    rollingAverageScores: [
      { gameId: 'g1', score: 100, average: 100 },
      { gameId: 'g2', score: 120, average: 110 },
    ],
    currentWinStreak: 2,
    longestWinStreak: 4,
  },
};

describe('AdvancedInsightsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders advanced metrics with formatted values', () => {
    render(<AdvancedInsightsPanel loading={false} metrics={sampleMetrics} />);

    expect(screen.getByText('Avg trick delta')).toBeTruthy();
    expect(screen.getByText('-0.4')).toBeTruthy();
    expect(screen.getByText('Perfect bid streak')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    expect(screen.getByText('Trump win rate')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();

    expect(screen.getByText('Score deviation')).toBeTruthy();
    expect(screen.getByText('12.5')).toBeTruthy();

    expect(screen.getByText('Current win streak')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Rolling average covers the last 2 games.')).toBeTruthy();
  });

  it('shows placeholder copy when metrics are missing', () => {
    render(<AdvancedInsightsPanel loading={false} metrics={null} />);
    expect(
      screen.getByText(
        'Complete a few games to unlock streak, volatility, and suit mastery insights.',
      ),
    ).toBeTruthy();
  });

  it('shows offline message when load error is provided', () => {
    render(
      <AdvancedInsightsPanel loading={false} metrics={null} loadError="IndexedDB unavailable" />,
    );
    expect(
      screen.getByText('Advanced analytics are unavailable while historical data is offline.'),
    ).toBeTruthy();
  });
});
