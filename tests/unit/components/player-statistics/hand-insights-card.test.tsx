import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import type { HandInsight } from '@/lib/state/player-statistics';
import { HandInsightsCard } from '@/app/players/[playerId]/statistics/components/HandInsightsCard';

describe('HandInsightsCard', () => {
  it('shows empty message when no insight data is available', () => {
    render(<HandInsightsCard loading={false} insight={null} />);

    expect(
      screen.getAllByText(/Complete additional games to unlock suit distribution insights/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders totals, top suit, and distribution rows', () => {
    const insight: HandInsight = {
      handsPlayed: 5,
      topSuit: 'hearts',
      suitCounts: {
        clubs: 1,
        diamonds: 1,
        hearts: 3,
        spades: 0,
      },
    };

    render(<HandInsightsCard loading={false} insight={insight} />);

    expect(screen.getAllByText(/Hands played/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Most frequent suit/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Hearts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 plays/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Clubs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Diamonds/i).length).toBeGreaterThan(0);
  });

  it('surfaces tie hint when top suit is null', () => {
    const insight: HandInsight = {
      handsPlayed: 4,
      topSuit: null,
      suitCounts: {
        clubs: 2,
        diamonds: 2,
        hearts: 0,
        spades: 0,
      },
    };

    render(<HandInsightsCard loading={false} insight={insight} />);

    expect(screen.getAllByText(/Multiple suits are tied/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/No single suit leads yet/i).length).toBeGreaterThanOrEqual(1);
  });
});
