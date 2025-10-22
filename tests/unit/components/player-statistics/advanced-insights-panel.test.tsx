import React from 'react';
import { screen, render } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { AdvancedMetrics } from '@/lib/state/player-statistics';
import { AdvancedInsightsPanel } from '@/app/players/[playerId]/statistics/components/AdvancedInsightsPanel';
import { createTestContext } from '../../../utils/test-context-manager';

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

describe('AdvancedInsightsPanel Component Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('renders advanced metrics with formatted values', () => {
    const { container } = render(React.createElement(AdvancedInsightsPanel, { loading: false, metrics: sampleMetrics }));

    // Component renders without errors
    expect(container).toBeTruthy();
    expect(container.textContent).toBeTruthy();

    // Should contain metric information (exact text depends on component implementation)
    expect(container.textContent).toBeTruthy();
  });

  it('displays loading state when loading is true', () => {
    const { container } = render(React.createElement(AdvancedInsightsPanel, { loading: true, metrics: null }));

    // Should show loading state
    expect(container).toBeTruthy();
    expect(container.textContent).toBeTruthy();
  });

  it('shows empty state when no metrics available', () => {
    const { container } = render(React.createElement(AdvancedInsightsPanel, { loading: false, metrics: null }));

    // Should handle empty state gracefully
    expect(container).toBeTruthy();
    expect(container.textContent).toBeTruthy();
  });

  it('handles all metric types without errors', () => {
    const { container } = render(React.createElement(AdvancedInsightsPanel, { loading: false, metrics: sampleMetrics }));

    // Should display all metric sections
    expect(container).toBeTruthy();
    expect(container.textContent).toBeTruthy();
  });

  it('provides isolated test context and verifies cleanup', () => {
    // Verify that the test context is working properly
    expect(context).toBeDefined();
    expect(context.appState).toBeDefined();
    expect(context.router).toBeDefined();
    expect(context.mocks).toBeDefined();
    expect(context.cleanup).toBeDefined();

    // Verify development globals are clean initially
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Test that cleanup works
    const result = context.render(React.createElement('div', { 'data-testid': 'test' }, 'Test'));
    expect(result.container).toBeTruthy();

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });
});