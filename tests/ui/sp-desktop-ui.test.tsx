import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP Desktop UI Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('provides isolated test context for UI testing', () => {
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
    const result = context.render(React.createElement('div', { 'data-testid': 'desktop-ui' }, 'Desktop UI Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('Desktop UI Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();

    // After cleanup, globals should still be clean
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });

  it('supports complex game state scenarios', () => {
    // The test context should handle complex state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state
    expect(() => {
      context.setAppState({ players: {} }, {});
    }).not.toThrow();
  });

  it('provides isolated mock functionality', () => {
    // Verify mocks are properly isolated
    expect(context.mocks.listGames).toBeDefined();
    expect(context.mocks.restoreGame).toBeDefined();
    expect(context.mocks.deleteGame).toBeDefined();
    expect(context.mocks.fetch).toBeDefined();

    // Test that mocks are functions
    expect(typeof context.mocks.listGames).toBe('function');
    expect(typeof context.mocks.fetch).toBe('function');
  });

  it('prevents test pollution between runs', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution
    (globalThis as any).__START_NEW_GAME__ = 'test-pollution';
    (globalThis as any).__clientLogTrack__ = 'test-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });
});