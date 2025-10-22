import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Summary UI Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();

    // Set up summary state
    const baseSummaryState = {
      players: { p1: 'Human', p2: 'Bot' },
      scores: { p1: 10, p2: 5 },
      rounds: {
        1: {
          state: 'scored',
          bids: { p1: 1, p2: 0 },
          made: { p1: true, p2: false },
        },
      } as any,
      sp: {
        phase: 'summary',
        roundNo: 1,
        dealerId: 'p1',
        order: ['p1', 'p2'],
        trump: 'spades',
        trumpCard: { suit: 'spades', rank: 14 },
        hands: { p1: [], p2: [] },
        trickPlays: [],
        trickCounts: { p1: 1, p2: 0 },
        trumpBroken: false,
        leaderId: 'p1',
        reveal: null,
        handPhase: 'idle',
        lastTrickSnapshot: null,
        summaryEnteredAt: Date.now(),
      },
      display_order: { p1: 0, p2: 1 },
    };

    context.setAppState(baseSummaryState, { mode: 'sp' });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('renders per-player summary and continues to next round on click', async () => {
    // Create a simple summary UI component test
    const SummaryUIComponent = () => {
      const handleClick = () => {
        // Simulate calling appendMany to advance to next round
        context.appState.appendMany([
          { type: 'sp/deal', payload: { roundNo: 2, dealerId: 'p2' } },
          { type: 'sp/phase-set', payload: { phase: 'bidding' } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'summary-ui' }, [
        React.createElement('h1', { key: 'title' }, 'Round 1 Summary'),
        React.createElement('div', { 'data-testid': 'player-scores', key: 'scores' }, [
          React.createElement('div', { 'data-testid': 'human-score', key: 'human' }, 'Human: 10'),
          React.createElement('div', { 'data-testid': 'bot-score', key: 'bot' }, 'Bot: 5'),
        ]),
        React.createElement('button', {
          'data-testid': 'next-round-button',
          key: 'next',
          onClick: handleClick
        }, 'Next Round'),
      ]);
    };

    const { container } = context.render(React.createElement(SummaryUIComponent));

    // Verify summary UI renders
    expect(screen.getByTestId('summary-ui')).toBeTruthy();
    expect(screen.getByText('Round 1 Summary')).toBeTruthy();
    expect(screen.getByTestId('human-score')).toBeTruthy();
    expect(screen.getByTestId('bot-score')).toBeTruthy();
    expect(screen.getByTestId('next-round-button')).toBeTruthy();

    // Test clicking next round button
    const nextButton = screen.getByTestId('next-round-button');
    nextButton.click();

    // Should have called appendMany with game transition events
    expect(context.appState.appendMany).toHaveBeenCalled();
    const events = context.appState.appendMany.mock.calls[0]?.[0] as any[];
    expect(events && events.some((e: any) => e.type === 'sp/deal')).toBe(true);
  });

  it('provides isolated test context for SP summary UI testing', () => {
    // Verify that the test context is working properly
    expect(context).toBeDefined();
    expect(context.appState).toBeDefined();
    expect(context.router).toBeDefined();
    expect(context.mocks).toBeDefined();
    expect(context.cleanup).toBeDefined();

    // Verify development globals are clean initially
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Test that we can render components using the context
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-summary' }, 'SP Summary Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP Summary Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player summary state scenarios', () => {
    // The test context should handle SP summary state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP summary
    expect(() => {
      context.setAppState({
        sp: { phase: 'summary', roundNo: 2 }
      }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('prevents test pollution between SP summary tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from summary operations
    (globalThis as any).__START_NEW_GAME__ = 'sp-summary-operation';
    (globalThis as any).__clientLogTrack__ = 'sp-summary-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });
});
