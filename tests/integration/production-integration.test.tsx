/**
 * Production Integration Tests
 *
 * This test file validates component lifecycle and production integration
 * using our enhanced test infrastructure.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createTestContext } from '../utils/test-context-manager';
import { render, screen, waitFor } from '@testing-library/react';

describe('Production Integration Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context.cleanup();
  });

  describe('Component Lifecycle Management', () => {
    it('should properly manage component lifecycle with production globals', () => {
      // Create a component that sets production globals
      function TestComponent() {
        React.useEffect(() => {
          // Simulate production global setting
          (globalThis as any).__START_NEW_GAME__ = vi.fn().mockResolvedValue(true);
          (globalThis as any).__clientLogTrack__ = vi.fn();

          return () => {
            // Cleanup should happen here
            delete (globalThis as any).__START_NEW_GAME__;
            delete (globalThis as any).__clientLogTrack__;
          };
        });

        return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
      }

      // Render the component using our test context
      const result = context.render(React.createElement(TestComponent));

      // Verify component is rendered
      expect(result.container.querySelector('[data-testid="test-component"]')).toBeTruthy();
      expect(result.container.textContent).toContain('Test Component');

      // Verify production globals are set
      expect((globalThis as any).__START_NEW_GAME__).toBeDefined();
      expect((globalThis as any).__clientLogTrack__).toBeDefined();

      // Unmount component
      result.unmount();

      // Verify globals are cleaned up
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
      expect((globalThis as any).__clientLogTrack__).toBeUndefined();
    });

    it('should handle component rendering without global state pollution', () => {
      // Simple component test without global state
      const SimpleComponent = () => {
        return React.createElement('div', { 'data-testid': 'simple-component' }, 'Simple Component');
      };

      const result = context.render(React.createElement(SimpleComponent));

      expect(result.container.querySelector('[data-testid="simple-component"]')).toBeTruthy();
      expect(result.container.textContent).toContain('Simple Component');

      // Unmount should work without errors
      expect(() => result.unmount()).not.toThrow();
    });
  });

  describe('Async Operations Management', () => {
    it('should handle async operations with proper cleanup', async () => {
      // Create a component with async operations
      function AsyncComponent() {
        const [ready, setReady] = React.useState(false);

        React.useEffect(() => {
          const timeout = setTimeout(() => {
            setReady(true);
          }, 10);

          return () => {
            clearTimeout(timeout);
          };
        });

        return React.createElement(
          'div',
          { 'data-testid': 'async-component' },
          ready ? 'Ready' : 'Loading...'
        );
      }

      // Render the async component
      const result = context.render(React.createElement(AsyncComponent));

      // Should show loading state initially
      expect(result.container.textContent).toContain('Loading...');

      // Wait for async operation to complete
      await waitFor(() => {
        expect(result.container.textContent).toContain('Ready');
      }, { timeout: 1000 });

      // Component should be properly rendered
      expect(result.container.querySelector('[data-testid="async-component"]')).toBeTruthy();

      // Unmount component
      result.unmount();
    });
  });

  describe('Test Infrastructure Validation', () => {
    it('provides isolated test context for production integration testing', () => {
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
      const result = context.render(React.createElement('div', { 'data-testid': 'production-test' }, 'Production Test'));
      expect(result.container).toBeTruthy();
      expect(result.container.textContent).toContain('Production Test');

      // Clean up should work without errors
      expect(() => context.cleanup()).not.toThrow();

      // After cleanup, globals should still be clean
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
      expect((globalThis as any).__clientLogTrack__).toBeUndefined();
    });

    it('supports complex production state scenarios', () => {
      // The test context should handle complex state updates
      expect(context.setAppState).toBeDefined();
      expect(typeof context.setAppState).toBe('function');

      // Test that we can update app state
      expect(() => {
        context.setAppState({ players: { p1: 'Alice', p2: 'Bob' } }, {});
      }).not.toThrow();
    });

    it('provides isolated mock functionality for production operations', () => {
      // Verify mocks are properly isolated
      expect(context.mocks.listGames).toBeDefined();
      expect(context.mocks.restoreGame).toBeDefined();
      expect(context.mocks.deleteGame).toBeDefined();
      expect(context.mocks.fetch).toBeDefined();

      // Test that mocks are functions
      expect(typeof context.mocks.listGames).toBe('function');
      expect(typeof context.mocks.restoreGame).toBe('function');
      expect(typeof context.mocks.deleteGame).toBe('function');
      expect(typeof context.mocks.fetch).toBe('function');
    });

    it('prevents test pollution between production integration tests', () => {
      // First test should start with clean state
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
      expect((globalThis as any).__clientLogTrack__).toBeUndefined();

      // Simulate some pollution
      (globalThis as any).__START_NEW_GAME__ = 'production-operation';
      (globalThis as any).__clientLogTrack__ = 'production-tracking';

      // Context cleanup should remove pollution
      context.cleanup();

      // State should be clean again
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
      expect((globalThis as any).__clientLogTrack__).toBeUndefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle component errors gracefully', () => {
      // Create a component that throws an error
      function ErrorComponent() {
        React.useEffect(() => {
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
        });

        if (true) { // Simulate error condition
          throw new Error('Test error');
        }

        return React.createElement('div', null, 'Should not render');
      }

      // Try to render the error component
      expect(() => {
        context.render(React.createElement(ErrorComponent));
      }).toThrow('Test error');

      // Verify cleanup (error occurred during render, but setup should be cleaned up)
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    });
  });
});