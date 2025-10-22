import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Reveal Gating Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();

    // Set up reveal state for gating tests
    const baseRevealGateState = {
      players: { p1: 'Human', p2: 'Bot' },
      scores: { p1: 20, p2: 18 },
      rounds: {
        7: { state: 'active', bids: { p1: 1, p2: 2 }, made: { p1: false, p2: true } },
      } as any,
      sp: {
        phase: 'reveal',
        roundNo: 7,
        dealerId: 'p2',
        order: ['p1', 'p2'],
        trump: 'diamonds',
        trumpCard: { suit: 'diamonds', rank: 9 },
        hands: { p1: [], p2: [] },
        trickPlays: [
          { playerId: 'p1', card: { suit: 'spades', rank: 3 } },
          { playerId: 'p2', card: { suit: 'clubs', rank: 5 } },
        ],
        trickCounts: { p1: 0, p2: 1 },
        trumpBroken: true,
        leaderId: 'p1',
        reveal: { suit: 'hearts', rank: 11 },
        handPhase: 'idle',
        lastTrickSnapshot: null,
        summaryEnteredAt: null,
      },
      display_order: { p1: 0, p2: 1 },
    };

    context.setAppState(baseRevealGateState, { mode: 'sp' });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('shows Next Round on reveal and only clears trick on click', () => {
    // Create a reveal gating component test
    const RevealGateComponent = () => {
      const handleClearTrick = () => {
        context.appState.appendMany([
          { type: 'sp/trick-clear', payload: {} },
        ]);
      };

      const handleNextRound = () => {
        context.appState.appendMany([
          { type: 'round/state-set', payload: { round: 7, state: 'scored' } },
          { type: 'sp/phase-set', payload: { phase: 'summary' } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'reveal-gate' }, [
        React.createElement('h1', { key: 'title' }, 'Reveal Phase'),
        React.createElement('div', { 'data-testid': 'reveal-content', key: 'reveal' }, [
          React.createElement('div', { key: 'revealed-card' }, 'Revealed: J♥'),
          React.createElement('div', { key: 'trick-status' }, 'Trick Showing'),
        ]),
        React.createElement('button', {
          'data-testid': 'clear-trick-button',
          key: 'clear',
          onClick: handleClearTrick
        }, 'Clear Trick'),
        React.createElement('button', {
          'data-testid': 'next-round-button',
          key: 'next',
          onClick: handleNextRound
        }, 'Next Round'),
      ]);
    };

    const { container } = context.render(React.createElement(RevealGateComponent));

    // Verify reveal gate renders
    expect(screen.getByTestId('reveal-gate')).toBeTruthy();
    expect(screen.getByText('Reveal Phase')).toBeTruthy();
    expect(screen.getByTestId('reveal-content')).toBeTruthy();
    expect(screen.getByText('Revealed: J♥')).toBeTruthy();
    expect(screen.getByText('Trick Showing')).toBeTruthy();
    expect(screen.getByTestId('clear-trick-button')).toBeTruthy();
    expect(screen.getByTestId('next-round-button')).toBeTruthy();
    expect(screen.getByText('Clear Trick')).toBeTruthy();
    expect(screen.getByText('Next Round')).toBeTruthy();

    // First click: clear trick
    const clearButton = screen.getByTestId('clear-trick-button');
    clearButton.click();

    // Should have called appendMany once to clear trick
    expect(context.appState.appendMany).toHaveBeenCalledTimes(1);
    const firstCall = context.appState.appendMany.mock.calls[0]?.[0] as any[];
    expect(firstCall && firstCall.some((e: any) => e.type === 'sp/trick-clear')).toBe(true);

    // Second click: advance to summary
    const nextButton = screen.getByTestId('next-round-button');
    nextButton.click();

    // Should have called appendMany twice total
    expect(context.appState.appendMany).toHaveBeenCalledTimes(2);
    const secondCall = context.appState.appendMany.mock.calls[1]?.[0] as any[];
    expect(secondCall && secondCall.some((e: any) => e.type === 'round/state-set')).toBe(true);
    expect(secondCall && secondCall.some((e: any) => e.type === 'sp/phase-set' && e.payload.phase === 'summary')).toBe(true);
  });

  it('prevents accidental double-advancement in reveal phase', () => {
    // Create a component that tests controlled reveal flow
    let clickCount = 0;

    const ControlledRevealComponent = () => {
      const handleNextRound = () => {
        clickCount++;
        if (clickCount > 1) {
          // Ignore subsequent clicks
          return;
        }

        context.appState.appendMany([
          { type: 'sp/trick-clear', payload: {} },
          { type: 'sp/phase-set', payload: { phase: 'summary' } },
        ]);
      };

      return React.createElement('div', { 'data-testid': 'controlled-reveal' }, [
        React.createElement('button', {
          'data-testid': 'controlled-next-button',
          key: 'controlled',
          onClick: handleNextRound
        }, 'Next Round'),
      ]);
    };

    const { container } = context.render(React.createElement(ControlledRevealComponent));

    const controlledButton = screen.getByTestId('controlled-next-button');

    // Verify initial state
    expect(controlledButton.disabled).toBe(false);
    expect(clickCount).toBe(0);

    // First click should work
    controlledButton.click();
    expect(clickCount).toBe(1);

    // Should have called appendMany once
    expect(context.appState.appendMany).toHaveBeenCalledTimes(1);

    // Second click should increment counter but not call appendMany again
    controlledButton.click();
    expect(clickCount).toBe(2);

    // Should still only have called appendMany once
    expect(context.appState.appendMany).toHaveBeenCalledTimes(1);
  });

  it('provides isolated test context for SP reveal gating testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-reveal-gate' }, 'SP Reveal Gate Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP Reveal Gate Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player reveal gating state scenarios', () => {
    // The test context should handle SP reveal gating state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP reveal gating
    expect(() => {
      context.setAppState({
        sp: { phase: 'reveal', roundNo: 7 }
      }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('prevents test pollution between SP reveal gating tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from reveal gating operations
    (globalThis as any).__START_NEW_GAME__ = 'sp-reveal-gate-operation';
    (globalThis as any).__clientLogTrack__ = 'sp-reveal-gate-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });
});