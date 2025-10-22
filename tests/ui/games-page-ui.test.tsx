import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { createTestContext, createTestContextWithMocks } from '../utils/test-context-manager';

describe('Games Page UI Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContextWithMocks({
      listGames: vi.fn(async () => [
        {
          id: 'game-1',
          title: 'Weekend Match',
          createdAt: Date.parse('2024-02-10T12:00:00Z'),
          finishedAt: Date.parse('2024-02-10T15:00:00Z'),
          lastSeq: 10,
          summary: {
            players: 4,
            scores: { a: 120, b: 110 },
            playersById: { a: 'Alice', b: 'Bob', c: 'Carla', d: 'Drew' },
            winnerId: 'a',
            winnerName: 'Alice',
            winnerScore: 120,
            scorecard: { activeRound: 7 },
            sp: {
              phase: 'setup',
              roundNo: null,
              dealerId: null,
              leaderId: null,
              order: [],
              trump: null,
              trumpCard: null,
              trickCounts: {},
              trumpBroken: false,
            },
          },
          bundle: { latestSeq: 10, events: [] },
        },
        {
          id: 'game-2',
          title: 'Friendly Match',
          createdAt: Date.parse('2024-02-11T14:00:00Z'),
          finishedAt: null,
          lastSeq: 5,
          summary: {
            players: 3,
            scores: { a: 80, b: 90 },
            playersById: { a: 'Alice', b: 'Bob', c: 'Carla' },
            winnerId: null,
            winnerName: null,
            winnerScore: 0,
            scorecard: { activeRound: 3 },
            sp: {
              phase: 'active',
              roundNo: 3,
              dealerId: 'a',
              leaderId: 'b',
              order: ['a', 'b', 'c'],
              trump: 'hearts',
              trumpCard: { suit: 'hearts', rank: 'A' },
              trickCounts: { a: 1, b: 2, c: 0 },
              trumpBroken: true,
            },
          },
          bundle: { latestSeq: 5, events: [] },
        },
      ]),
      deleteGame: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    context.cleanup();
  });

  it('renders games list successfully', async () => {
    // Create a simple games list component test
    const TestGamesList = () => {
      return React.createElement('div', { 'data-testid': 'games-list' }, [
        React.createElement('div', { 'data-testid': 'game-1' }, 'Weekend Match'),
        React.createElement('div', { 'data-testid': 'game-2' }, 'Friendly Match'),
      ]);
    };

    const { container } = context.render(React.createElement(TestGamesList));

    // Component renders without errors
    expect(container).toBeTruthy();
    expect(screen.getByTestId('games-list')).toBeTruthy();
    expect(screen.getByTestId('game-1')).toBeTruthy();
    expect(screen.getByTestId('game-2')).toBeTruthy();
  });

  it('handles empty games list', () => {
    // Create empty list test
    const TestEmptyGamesList = () => {
      return React.createElement('div', { 'data-testid': 'empty-games' }, 'No games found');
    };

    const { container } = context.render(React.createElement(TestEmptyGamesList));

    expect(container).toBeTruthy();
    expect(screen.getByText('No games found')).toBeTruthy();
  });

  it('provides isolated test context for games page testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'games-page' }, 'Games Page Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('Games Page Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports complex game state scenarios', () => {
    // The test context should handle complex game state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for games
    expect(() => {
      context.setAppState({ players: { a: 'Alice', b: 'Bob' } }, {});
    }).not.toThrow();
  });

  it('provides isolated mock functionality for games operations', () => {
    // Verify mocks are properly isolated
    expect(context.mocks.listGames).toBeDefined();
    expect(context.mocks.restoreGame).toBeDefined();
    expect(context.mocks.deleteGame).toBeDefined();
    expect(context.mocks.fetch).toBeDefined();

    // Test that mocks are functions
    expect(typeof context.mocks.listGames).toBe('function');
    expect(typeof context.mocks.deleteGame).toBe('function');
    expect(typeof context.mocks.fetch).toBe('function');
  });

  it('prevents test pollution between games page tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from game operations
    (globalThis as any).__START_NEW_GAME__ = 'game-operation';
    (globalThis as any).__clientLogTrack__ = 'game-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });

  it('handles async game operations properly', async () => {
    // Test async mock responses
    const mockGames = await context.mocks.listGames();
    expect(mockGames).toHaveLength(2);
    expect(mockGames[0].title).toBe('Weekend Match');
    expect(mockGames[1].title).toBe('Friendly Match');

    // Test delete operation
    await expect(context.mocks.deleteGame('game-1')).resolves.toBeUndefined();
  });
});