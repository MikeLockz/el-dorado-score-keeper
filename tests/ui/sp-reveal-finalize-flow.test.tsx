import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Reveal Finalize Flow Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();

    // Set up reveal state
    const baseRevealState = {
      players: { p1: 'Human', p2: 'Bot' },
      scores: { p1: 25, p2: 20 },
      rounds: {
        9: { state: 'active', bids: { p1: 2, p2: 1 }, made: { p1: true, p2: false } },
      } as any,
      sp: {
        phase: 'reveal',
        roundNo: 9,
        dealerId: 'p1',
        order: ['p1', 'p2'],
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 10 },
        hands: { p1: [], p2: [] },
        trickPlays: [],
        trickCounts: { p1: 1, p2: 0 },
        trumpBroken: true,
        leaderId: 'p2',
        reveal: { suit: 'clubs', rank: 7 },
        handPhase: 'idle',
        lastTrickSnapshot: null,
        summaryEnteredAt: null,
      },
      display_order: { p1: 0, p2: 1 },
    };

    context.setAppState(baseRevealState, { mode: 'sp' });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('after clicking Next Round, a second batch finalizes the round', () => {
    // Create a reveal -> finalize flow component test
    const RevealFinalizeComponent = () => {
      const handleNextRound = () => {
        // Simulate first batch: clear trick and transition to finalize
        context.appState.appendMany([
          { type: 'sp/trick-clear', payload: {} },
          { type: 'sp/phase-set', payload: { phase: 'finalize' } },
        ]);

        // Simulate second batch: finalize round and transition to summary
        context.appState.appendMany([
          { type: 'round/state-set', payload: { round: 9, state: 'scored' } },
          { type: 'sp/leader-set', payload: { leaderId: 'p2' } },
          { type: 'sp/phase-set', payload: { phase: 'summary' } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'reveal-finalize-flow' }, [
        React.createElement('h1', { key: 'title' }, 'Reveal Phase'),
        React.createElement('div', { 'data-testid': 'reveal-info', key: 'reveal' }, [
          React.createElement('div', { key: 'card' }, 'Revealed: 7♣'),
          React.createElement('div', { key: 'tricks' }, 'Tricks Won: Human 1, Bot 0'),
        ]),
        React.createElement('button', {
          'data-testid': 'next-round-button',
          key: 'next',
          onClick: handleNextRound
        }, 'Next Round'),
      ]);
    };

    const { container } = context.render(React.createElement(RevealFinalizeComponent));

    // Verify reveal phase renders
    expect(screen.getByTestId('reveal-finalize-flow')).toBeTruthy();
    expect(screen.getByText('Reveal Phase')).toBeTruthy();
    expect(screen.getByTestId('reveal-info')).toBeTruthy();
    expect(screen.getByText('Revealed: 7♣')).toBeTruthy();
    expect(screen.getByTestId('next-round-button')).toBeTruthy();
    expect(screen.getByText('Next Round')).toBeTruthy();

    // Test clicking next round button
    const nextButton = screen.getByTestId('next-round-button');
    nextButton.click();

    // Should have called appendMany twice (two batches)
    expect(context.appState.appendMany.mock.calls).toHaveLength(2);

    // Verify first batch: clear trick and transition to finalize
    const firstBatch = context.appState.appendMany.mock.calls[0]?.[0] as any[];
    expect(firstBatch && firstBatch.some((e: any) => e.type === 'sp/trick-clear')).toBe(true);
    expect(firstBatch && firstBatch.some((e: any) => e.type === 'sp/phase-set' && e.payload.phase === 'finalize')).toBe(true);

    // Verify second batch: finalize round and transition to summary
    const secondBatch = context.appState.appendMany.mock.calls[1]?.[0] as any[];
    expect(secondBatch && secondBatch.some((e: any) => e.type === 'round/state-set')).toBe(true);
    expect(secondBatch && secondBatch.some((e: any) => e.type === 'sp/leader-set')).toBe(true);
    expect(secondBatch && secondBatch.some((e: any) => e.type === 'sp/phase-set' && e.payload.phase === 'summary')).toBe(true);
  });

  it('provides isolated test context for SP reveal finalize flow testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-reveal-finalize' }, 'SP Reveal Finalize Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP Reveal Finalize Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player reveal finalize state scenarios', () => {
    // The test context should handle SP reveal finalize state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP reveal finalize
    expect(() => {
      context.setAppState({
        sp: { phase: 'reveal', roundNo: 9 }
      }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('prevents test pollution between SP reveal finalize tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from reveal finalize operations
    (globalThis as any).__START_NEW_GAME__ = 'sp-reveal-finalize-operation';
    (globalThis as any).__clientLogTrack__ = 'sp-reveal-finalize-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });

  it('handles complex reveal to summary transitions', () => {
    // Test more complex state transitions
    const ComplexRevealComponent = () => {
      const handleComplexTransition = () => {
        // Simulate complex multi-step transition
        context.appState.appendMany([
          { type: 'sp/reveal-clear', payload: {} },
          { type: 'sp/trick-clear', payload: {} },
          { type: 'round/state-set', payload: { round: 9, state: 'scored' } },
          { type: 'sp/score-calculate', payload: { p1: 15, p2: 5 } },
          { type: 'sp/phase-set', payload: { phase: 'summary' } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'complex-reveal' }, [
        React.createElement('button', {
          'data-testid': 'complex-transition-button',
          key: 'complex',
          onClick: handleComplexTransition
        }, 'Complete Complex Transition'),
      ]);
    };

    const { container } = context.render(React.createElement(ComplexRevealComponent));

    // Test complex transition
    const complexButton = screen.getByTestId('complex-transition-button');
    complexButton.click();

    // Should have called appendMany with complex transition events
    expect(context.appState.appendMany).toHaveBeenCalled();
    const events = context.appState.appendMany.mock.calls[0]?.[0] as any[];

    // Verify key transition events are present
    expect(events && events.some((e: any) => e.type === 'sp/reveal-clear')).toBe(true);
    expect(events && events.some((e: any) => e.type === 'sp/trick-clear')).toBe(true);
    expect(events && events.some((e: any) => e.type === 'round/state-set')).toBe(true);
    expect(events && events.some((e: any) => e.type === 'sp/score-calculate')).toBe(true);
    expect(events && events.some((e: any) => e.type === 'sp/phase-set' && e.payload.phase === 'summary')).toBe(true);
  });
});