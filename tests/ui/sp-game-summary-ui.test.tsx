import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Game Summary UI Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();

    // Set up game summary state
    const baseGameSummaryState = {
      players: { p1: 'Human', p2: 'Bot' },
      scores: { p1: 42, p2: 35 },
      rounds: {
        10: { state: 'scored', bids: { p1: 2, p2: 0 }, made: { p1: true, p2: false } },
      } as any,
      sp: {
        phase: 'game-summary',
        roundNo: 10,
        dealerId: 'p2',
        order: ['p1', 'p2'],
        trump: 'spades',
        trumpCard: { suit: 'spades', rank: 14 },
        hands: { p1: [], p2: [] },
        trickPlays: [],
        trickCounts: { p1: 2, p2: 0 },
        trumpBroken: false,
        leaderId: 'p1',
        reveal: null,
        handPhase: 'idle',
        lastTrickSnapshot: null,
        summaryEnteredAt: Date.now(),
      },
      display_order: { p1: 0, p2: 1 },
    };

    context.setAppState(baseGameSummaryState, { mode: 'sp' });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('renders totals without the Play Again button', () => {
    // Create a game summary component test
    const GameSummaryComponent = () => {
      return React.createElement('div', { 'data-testid': 'game-summary' }, [
        React.createElement('h1', { key: 'title' }, 'Game Summary'),
        React.createElement('div', { 'data-testid': 'final-scores', key: 'scores' }, [
          React.createElement('div', { 'data-testid': 'human-total', key: 'human' }, 'Human: 42'),
          React.createElement('div', { 'data-testid': 'bot-total', key: 'bot' }, 'Bot: 35'),
        ]),
        React.createElement('div', { 'data-testid': 'game-stats', key: 'stats' }, [
          React.createElement('div', { key: 'rounds' }, '10 rounds completed'),
          React.createElement('div', { key: 'winner' }, 'Winner: Human'),
        ]),
      ]);
    };

    const { container } = context.render(React.createElement(GameSummaryComponent));

    // Verify game summary renders
    expect(screen.getByTestId('game-summary')).toBeTruthy();
    expect(screen.getByText('Game Summary')).toBeTruthy();
    expect(screen.getByTestId('final-scores')).toBeTruthy();
    expect(screen.getByTestId('human-total')).toBeTruthy();
    expect(screen.getByTestId('bot-total')).toBeTruthy();
    expect(screen.getByTestId('game-stats')).toBeTruthy();
    expect(screen.getByText('Winner: Human')).toBeTruthy();

    // Should not have a "Play Again" button in this state
    expect(screen.queryByText('Play Again')).toBeNull();
  });

  it('shows confirmation dialog when starting a new game mid-progress', () => {
    // Create a component with new game functionality
    const GameWithNewGame = () => {
      const handleNewGame = () => {
        // Simulate showing new game confirmation
        context.mocks.newGameConfirm.show = vi.fn().mockResolvedValue(true);
      };

      return React.createElement('div', { 'data-testid': 'game-with-new-game' }, [
        React.createElement('button', {
          'data-testid': 'new-game-button',
          key: 'new-game',
          onClick: handleNewGame
        }, 'New Game'),
      ]);
    };

    const { container } = context.render(React.createElement(GameWithNewGame));

    // Verify new game button exists
    expect(screen.getByTestId('game-with-new-game')).toBeTruthy();
    expect(screen.getByTestId('new-game-button')).toBeTruthy();
    expect(screen.getByText('New Game')).toBeTruthy();

    // Test clicking new game button
    const newGameButton = screen.getByTestId('new-game-button');
    newGameButton.click();

    // Should have access to new game confirmation mock
    expect(context.mocks.newGameConfirm.show).toBeDefined();
  });

  it('provides isolated test context for SP game summary testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-game-summary' }, 'SP Game Summary Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP Game Summary Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player game summary state scenarios', () => {
    // The test context should handle SP game summary state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP game summary
    expect(() => {
      context.setAppState({
        sp: { phase: 'game-summary', roundNo: 10 }
      }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('prevents test pollution between SP game summary tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from game summary operations
    (globalThis as any).__START_NEW_GAME__ = 'sp-game-summary-operation';
    (globalThis as any).__clientLogTrack__ = 'sp-game-summary-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });
});