/**
 * Test Isolation Validation Tests
 *
 * Validation tests for test infrastructure isolation and cleanup features.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import { quickLifecycleCheck } from '../utils/lifecycle-verification';
import { renderWithDevelopmentGlobalAwareness } from '../utils/test-patterns';

describe('Test Isolation Infrastructure Validation', () => {
  beforeEach(() => {
    // Ensure clean test environment
    const check = quickLifecycleCheck();
    if (check.warnings.length > 0) {
      console.warn('Test environment not clean:', check.warnings);
    }
  });

  afterEach(() => {
    // Ensure cleanup after each test
    const check = quickLifecycleCheck();
    expect(check.warnings).toEqual([]);
  });

  describe('Enhanced Component Rendering', () => {
    it('should use renderWithDevelopmentGlobalAwareness correctly', () => {
      function TestComponent() {
        React.useEffect(() => {
          // Set production global
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          return () => {
            delete (globalThis as any).__START_NEW_GAME__;
          };
        });

        return React.createElement('div', { 'data-testid': 'enhanced-test' }, 'Enhanced Test');
      }

      const result = renderWithDevelopmentGlobalAwareness(React.createElement(TestComponent));

      expect(result.container).toBeTruthy();

      // Verify the component rendered
      const element = result.getByTestId('enhanced-test');
      expect(element.textContent).toBe('Enhanced Test');

      // Test enhanced unmount
      result.unmount();

      // Verify cleanup
      const globals = (globalThis as any).__START_NEW_GAME__;
      expect(globals).toBeUndefined();
    });
  });

  describe('Production Global Management', () => {
    it('should handle production globals correctly', () => {
      // Set up production globals as they would be in production
      const mockStartNewGame = vi.fn().mockResolvedValue(true);
      const mockClientLogTrack = vi.fn();

      (globalThis as any).__START_NEW_GAME__ = mockStartNewGame;
      (globalThis as any).__clientLogTrack__ = mockClientLogTrack;

      // Verify globals are set
      expect((globalThis as any).__START_NEW_GAME__).toBeDefined();
      expect((globalThis as any).__clientLogTrack__).toBeDefined();

      // Use the globals as production code would
      const startGame = (globalThis as any).__START_NEW_GAME__;
      expect(typeof startGame).toBe('function');

      const logTrack = (globalThis as any).__clientLogTrack__;
      expect(typeof logTrack).toBe('function');

      // Clean up as would happen in production
      delete (globalThis as any).__START_NEW_GAME__;
      delete (globalThis as any).__clientLogTrack__;

      // Verify cleanup
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
      expect((globalThis as any).__clientLogTrack__).toBeUndefined();
    });

    it('should detect global state changes', () => {
      const initialGlobals = captureDevelopmentGlobals();

      // Make changes to globals
      (globalThis as any).__START_NEW_GAME__ = vi.fn();
      (globalThis as any).__clientLogTrack__ = vi.fn();

      const modifiedGlobals = captureDevelopmentGlobals();
      expect(modifiedGlobals.__START_NEW_GAME__).toBeDefined();
      expect(modifiedGlobals.__clientLogTrack__).toBeDefined();

      // Clean up
      delete (globalThis as any).__START_NEW_GAME__;
      delete (globalThis as any).__clientLogTrack__;
    });
  });

  describe('Lifecycle Verification', () => {
    it('should provide quick lifecycle checks', () => {
      const check = quickLifecycleCheck();

      // Should start clean
      expect(check.globalsClean).toBe(true);
      expect(check.asyncClean).toBe(true);
      expect(check.eventsClean).toBe(true);
      expect(check.warnings).toEqual([]);
    });

    it('should detect when environment is polluted', () => {
      // Intentionally pollute
      (globalThis as any).__START_NEW_GAME__ = vi.fn();

      const check = quickLifecycleCheck();
      expect(check.globalsClean).toBe(false);
      expect(check.warnings.length).toBeGreaterThan(0);
      expect(check.warnings[0]).toContain('Production globals detected');

      // Clean up
      delete (globalThis as any).__START_NEW_GAME__;
    });
  });

  describe('Component Cleanup Verification', () => {
    it('should verify proper component cleanup', () => {
      let cleanupCalled = false;
      const mockCleanup = vi.fn(() => {
        cleanupCalled = true;
      });

      function ComponentWithCleanup() {
        React.useEffect(() => {
          // Set up production features
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          return () => {
            mockCleanup();
            delete (globalThis as any).__START_NEW_GAME__;
          };
        });

        return React.createElement('div', null, 'Test Component');
      }

      const { unmount, container } = render(React.createElement(ComponentWithCleanup));

      // Verify component rendered
      expect(container).toBeTruthy();
      expect((globalThis as any).__START_NEW_GAME__).toBeDefined();

      // Unmount and verify cleanup
      unmount();
      expect(cleanupCalled).toBe(true);
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    });

    it('should handle async operations in components', async () => {
      let asyncOperationCompleted = false;

      function AsyncComponent() {
        React.useEffect(() => {
          const timeout = setTimeout(() => {
            asyncOperationCompleted = true;
          }, 10);

          return () => {
            clearTimeout(timeout);
          };
        });

        return React.createElement('div', null, 'Async Component');
      }

      const { unmount } = render(React.createElement(AsyncComponent));

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(asyncOperationCompleted).toBe(true);

      // Unmount
      unmount();
    });
  });

  describe('Production-Like Scenarios', () => {
    it('should handle complex component with multiple effects', async () => {
      let effect1Cleanup = false;
      let effect2Cleanup = false;

      function ComplexComponent() {
        const [state, setState] = React.useState(0);

        React.useEffect(() => {
          // First effect: set up production globals
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          (globalThis as any).__clientLogTrack__ = vi.fn();
          return () => {
            effect1Cleanup = true;
            delete (globalThis as any).__START_NEW_GAME__;
            delete (globalThis as any).__clientLogTrack__;
          };
        }, []);

        React.useEffect(() => {
          // Second effect: track state changes
          if (state > 0) {
            (globalThis as any).__clientLogTrack__?.('state_changed', { value: state });
          }
          return () => {
            effect2Cleanup = true;
          };
        }, [state]);

        return React.createElement(
          'button',
          {
            onClick: () => setState(state + 1),
          },
          `State: ${state}`,
        );
      }

      const { container, unmount } = render(React.createElement(ComplexComponent));

      // Verify initial state
      expect((globalThis as any).__START_NEW_GAME__).toBeDefined();
      expect(container.querySelector('button')).toBeTruthy();

      // Simulate interaction
      const button = container.querySelector('button');
      button?.click();

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Verify state change effect
      expect((globalThis as any).__clientLogTrack__).toHaveBeenCalled();

      // Unmount and verify all cleanups
      unmount();
      expect(effect1Cleanup).toBe(true);
      expect(effect2Cleanup).toBe(true);
      expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    });
  });
});

// Helper function to capture current globals
function captureDevelopmentGlobals() {
  return {
    __START_NEW_GAME__: (globalThis as any).__START_NEW_GAME__,
    __clientLogTrack__: (globalThis as any).__clientLogTrack__,
  };
}
