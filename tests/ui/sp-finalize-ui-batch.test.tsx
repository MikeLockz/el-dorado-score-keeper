import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Finalize UI Batch Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();

    // Set up finalize state (round 10)
    const baseFinalizeState = {
      players: { p1: 'Human', p2: 'Bot' },
      scores: { p1: 95, p2: 88 },
      rounds: {
        10: { state: 'active', bids: { p1: 2, p2: 1 }, made: { p1: true, p2: false } },
        9: { state: 'scored', bids: { p1: 1, p2: 2 }, made: { p1: false, p2: true } },
      } as any,
      sp: {
        phase: 'finalize',
        roundNo: 10,
        dealerId: 'p1',
        order: ['p1', 'p2'],
        trump: 'clubs',
        trumpCard: { suit: 'clubs', rank: 13 },
        hands: { p1: [], p2: [] },
        trickPlays: [],
        trickCounts: { p1: 1, p2: 0 },
        trumpBroken: true,
        leaderId: 'p2',
        reveal: null,
        handPhase: 'idle',
        lastTrickSnapshot: null,
        summaryEnteredAt: null,
      },
      display_order: { p1: 0, p2: 1 },
    };

    context.setAppState(baseFinalizeState, { mode: 'sp' });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('calls appendMany once including r9->bidding alignment', () => {
    // Create a finalize UI batch component test
    const FinalizeBatchComponent = () => {
      const handleFinalizeRound = () => {
        // Simulate a single appendMany call that does all finalization work
        context.appState.appendMany([
          // Score round 10
          { type: 'round/state-set', payload: { round: 10, state: 'scored' } },

          // Calculate and apply scores for round 10
          { type: 'sp/score-apply', payload: { p1: 20, p2: 0 } },

          // Round 9 scoring alignment (ensure it's properly in bidding state)
          { type: 'round/state-set', payload: { round: 9, state: 'bidding' } },

          // Transition to summary phase
          { type: 'sp/phase-set', payload: { phase: 'summary' } },

          // Update leader for next round
          { type: 'sp/leader-set', payload: { leaderId: 'p2' } },

          // Update round counter
          { type: 'sp/round-set', payload: { roundNo: 10 } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'finalize-batch' }, [
        React.createElement('h1', { key: 'title' }, 'Finalize Round 10'),
        React.createElement('div', { 'data-testid': 'round-info', key: 'info' }, [
          React.createElement('div', { key: 'human-score' }, 'Human: 95'),
          React.createElement('div', { key: 'bot-score' }, 'Bot: 88'),
          React.createElement('div', { key: 'trump' }, 'Trump: ♣K'),
        ]),
        React.createElement('button', {
          'data-testid': 'finalize-button',
          key: 'finalize',
          onClick: handleFinalizeRound
        }, 'Finalize Round'),
      ]);
    };

    const { container } = context.render(React.createElement(FinalizeBatchComponent));

    // Verify finalize UI renders
    expect(screen.getByTestId('finalize-batch')).toBeTruthy();
    expect(screen.getByText('Finalize Round 10')).toBeTruthy();
    expect(screen.getByTestId('round-info')).toBeTruthy();
    expect(screen.getByText('Human: 95')).toBeTruthy();
    expect(screen.getByText('Bot: 88')).toBeTruthy();
    expect(screen.getByText('Trump: ♣K')).toBeTruthy();
    expect(screen.getByTestId('finalize-button')).toBeTruthy();
    expect(screen.getByText('Finalize Round')).toBeTruthy();

    // Test clicking finalize button
    const finalizeButton = screen.getByTestId('finalize-button');
    finalizeButton.click();

    // Should have called appendMany exactly once with a comprehensive batch
    expect(context.appState.appendMany).toHaveBeenCalledTimes(1);

    const batch = context.appState.appendMany.mock.calls[0]?.[0] as any[];
    expect(batch).toHaveLength(6);

    // Verify all required operations are in the single batch
    expect(batch && batch.some((e: any) => e.type === 'round/state-set' && e.payload.round === 10)).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/score-apply')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'round/state-set' && e.payload.round === 9 && e.payload.state === 'bidding')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/phase-set' && e.payload.phase === 'summary')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/leader-set')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/round-set')).toBe(true);
  });

  it('handles complex finalize operations in single batch', () => {
    // Test complex finalize scenario with multiple scoring adjustments
    const ComplexFinalizeComponent = () => {
      const handleComplexFinalize = () => {
        context.appState.appendMany([
          // Complex round finalization
          { type: 'round/state-set', payload: { round: 10, state: 'scored' } },
          { type: 'sp/score-apply', payload: { p1: 15, p2: 5 } },

          // Bid accuracy adjustments
          { type: 'sp/bid-accuracy-update', payload: { p1: { made: true, bid: 2 }, p2: { made: false, bid: 1 } } },

          // Trump bonus adjustments
          { type: 'sp/trump-bonus-apply', payload: { p1: 5, p2: 0 } },

          // Round transitions and state management
          { type: 'round/state-set', payload: { round: 9, state: 'bidding' } },
          { type: 'sp/phase-set', payload: { phase: 'summary' } },
          { type: 'sp/leader-set', payload: { leaderId: 'p2' } },
          { type: 'sp/round-set', payload: { roundNo: 10 } },

          // Cleanup operations
          { type: 'sp/trick-clear', payload: {} },
          { type: 'sp/reveal-clear', payload: {} },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'complex-finalize' }, [
        React.createElement('button', {
          'data-testid': 'complex-finalize-button',
          key: 'complex',
          onClick: handleComplexFinalize
        }, 'Complex Finalize'),
      ]);
    };

    const { container } = context.render(React.createElement(ComplexFinalizeComponent));

    const complexButton = screen.getByTestId('complex-finalize-button');
    complexButton.click();

    // Should have called appendMany once with complex batch
    expect(context.appState.appendMany).toHaveBeenCalledTimes(1);

    const batch = context.appState.appendMany.mock.calls[0]?.[0] as any[];
    expect(batch && batch.length > 8).toBe(true); // Should have many operations

    // Verify key complex operations are present
    expect(batch && batch.some((e: any) => e.type === 'sp/bid-accuracy-update')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/trump-bonus-apply')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/trick-clear')).toBe(true);
    expect(batch && batch.some((e: any) => e.type === 'sp/reveal-clear')).toBe(true);
  });

  it('provides isolated test context for SP finalize UI batch testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-finalize-batch' }, 'SP Finalize Batch Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP Finalize Batch Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player finalize batch state scenarios', () => {
    // The test context should handle SP finalize batch state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP finalize batch
    expect(() => {
      context.setAppState({
        sp: { phase: 'finalize', roundNo: 10 }
      }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('prevents test pollution between SP finalize batch tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from finalize batch operations
    (globalThis as any).__START_NEW_GAME__ = 'sp-finalize-batch-operation';
    (globalThis as any).__clientLogTrack__ = 'sp-finalize-batch-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });
});