/**
 * Phase 4 Production Integration Tests
 *
 * This test file validates the advanced component lifecycle and production
 * integration capabilities implemented in Phase 4 of the test infrastructure overhaul.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import {
  verifyComponentLifecycle,
  verifyHookLifecycle,
  quickLifecycleCheck,
} from '../utils/lifecycle-verification';
import { createProductionLifecycleManager } from '../utils/production-lifecycle';
import { testProductionComponent, testProductionHook } from '../utils/production-lifecycle';
import { testDevelopmentFeature } from '../utils/development-features';
import { testBroadcastChannel } from '../utils/event-system-integration';
import { renderWithDevelopmentGlobalAwareness } from '../utils/test-patterns';
import { createEventSystemTestEnvironment } from '../utils/event-system-integration';

describe('Phase 4: Production Integration Tests', () => {
  beforeEach(() => {
    // Quick check to ensure clean test environment
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

  describe('Production Component Lifecycle Management', () => {
    it('should properly manage production component lifecycle', () => {
      // Create a simple component that sets production globals
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

      const result = verifyComponentLifecycle(
        React.createElement(TestComponent),
        (verifier, verificationResult) => {
          expect(verificationResult.success).toBe(true);
          expect(verificationResult.componentCleanup.componentUnmounted).toBe(true);
          expect(verificationResult.globalStateCleanup.success).toBe(true);
          expect(verificationResult.asyncOperationCleanup.success).toBe(true);
          expect(verificationResult.eventListenerCleanup.success).toBe(true);
          expect(verificationResult.warnings).toEqual([]);
          expect(verificationResult.errors).toEqual([]);
        },
      );

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('should detect lifecycle issues when they exist', () => {
      // Create a component with intentional cleanup issues
      function ProblematicComponent() {
        React.useEffect(() => {
          // Set production globals but don't clean them up
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          (globalThis as any).__clientLogTrack__ = vi.fn();
          // No cleanup function returned
        });

        return React.createElement(
          'div',
          { 'data-testid': 'problematic-component' },
          'Problematic Component',
        );
      }

      const result = verifyComponentLifecycle(React.createElement(ProblematicComponent));

      expect(result.success).toBe(false);
      expect(result.globalStateCleanup.leakedGlobals.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Production Hook Testing Integration', () => {
    it('should properly manage production hook lifecycle', () => {
      // Create a hook that uses production globals
      function useProductionHook(initialValue: string) {
        const [value, setValue] = React.useState(initialValue);

        React.useEffect(() => {
          // Set production global
          (globalThis as any).__START_NEW_GAME__ = vi.fn();

          return () => {
            delete (globalThis as any).__START_NEW_GAME__;
          };
        }, []);

        return { value, setValue };
      }

      const result = verifyHookLifecycle(useProductionHook, 'initial');

      expect(result.success).toBe(true);
      expect(result.componentCleanup.componentUnmounted).toBe(true);
      expect(result.globalStateCleanup.success).toBe(true);
    });

    it('should detect hook lifecycle issues', () => {
      // Create a hook with cleanup issues
      function useProblematicHook() {
        React.useEffect(() => {
          // Set production global but don't clean up
          (globalThis as any).__clientLogTrack__ = vi.fn();
          // No cleanup
        });

        return { data: 'test' };
      }

      const result = verifyHookLifecycle(useProblematicHook, undefined);

      expect(result.success).toBe(false);
      expect(result.globalStateCleanup.leakedGlobals.length).toBeGreaterThan(0);
    });
  });

  describe('Development Feature Testing', () => {
    it('should test development features with proper cleanup', async () => {
      await testDevelopmentFeature('startNewGame', (feature) => {
        expect(feature).toBeDefined();
        expect(typeof feature).toBe('function');
        expect(typeof feature.mockResolvedValue).toBe('function');

        // Test the feature works
        const result = feature();
        expect(typeof result).toBe('function');
        expect(feature).toHaveBeenCalledTimes(0); // Initially it's a mock function
      });
    });

    it('should handle feature cleanup correctly', async () => {
      let cleanupCalled = false;
      const mockCleanup = vi.fn(() => {
        cleanupCalled = true;
      });

      // Test a known feature
      await testDevelopmentFeature('clientLogTrack', (feature) => {
        expect(feature).toBeDefined();
        expect(typeof feature).toBe('function');
      });

      // Verify the test completes without errors
      expect(cleanupCalled).toBe(false); // No custom cleanup was called
    });
  });

  describe('Event System Integration', () => {
    it('should handle BroadcastChannel testing with proper cleanup', async () => {
      await testBroadcastChannel('test-channel', (channel, helpers) => {
        expect(channel.name).toBe('test-channel');
        expect(channel.closed).toBe(false);

        // Test message broadcasting
        let receivedMessage: any;
        channel.addEventListener('message', (event: MessageEvent) => {
          receivedMessage = event.data;
        });

        helpers.simulateBroadcast({ test: 'data' });
        expect(receivedMessage).toEqual({ test: 'data' });

        // Test cleanup
        channel.close();
        expect(channel.closed).toBe(true);
        expect(helpers.verifyNoLeaks()).toBe(true);
      });
    });

    it('should track event listeners and verify cleanup', () => {
      const environment = createEventSystemTestEnvironment();

      // Set up event tracking
      environment.trackEvents('click', 'HTMLButtonElement');
      environment.trackEvents('message', 'Window');

      // Simulate some events
      const button = document.createElement('button');
      button.click();

      const tracker = environment.getEventTracker('click', 'HTMLButtonElement');
      expect(tracker).toBeDefined();
      expect(tracker!.eventsFired).toBeGreaterThan(0);

      // Verify cleanup
      const cleanupResult = environment.verifyEventCleanup();
      expect(cleanupResult.success).toBe(true);

      environment.cleanup();
    });
  });

  describe('Production Lifecycle Manager', () => {
    it('should provide comprehensive lifecycle management', () => {
      const manager = createProductionLifecycleManager();

      // Test component rendering
      function TestComponent() {
        React.useEffect(() => {
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          return () => {
            delete (globalThis as any).__START_NEW_GAME__;
          };
        });

        return React.createElement('div', null, 'Test');
      }

      const result = manager.render(React.createElement(TestComponent));
      expect(result.container).toBeTruthy();

      // Test production globals detection
      expect(result.hasProductionGlobals()).toBe(true);

      // Test production unmount simulation
      const unmountResult = result.simulateProductionUnmount();
      expect(unmountResult.success).toBe(true);
      expect(unmountResult.metrics.unmountCount).toBe(1);

      // Verify cleanup
      const cleanupResult = result.verifyCleanup();
      expect(cleanupResult.isClean).toBe(true);
      expect(cleanupResult.remainingGlobals).toEqual([]);

      // Check metrics
      const metrics = result.getMetrics();
      expect(metrics.mountCount).toBe(1);
      expect(metrics.unmountCount).toBe(1);

      manager.cleanup();
    });

    it('should track multiple components and hooks', () => {
      const manager = createProductionLifecycleManager();

      // Render multiple components
      const result1 = manager.render(React.createElement('div', null, 'Component 1'));
      const result2 = manager.render(React.createElement('div', null, 'Component 2'));

      // Render hook
      const hookResult = manager.renderHook(() => ({ value: 'test' }), { initialProps: undefined });

      // Check metrics
      const metrics = manager.getMetrics();
      expect(metrics.mountCount).toBe(3); // 2 components + 1 hook

      // Cleanup all
      result1.unmount();
      result2.unmount();
      hookResult.unmount();

      manager.cleanup();
    });
  });

  describe('Enhanced Rendering with Production Awareness', () => {
    it('should use renderWithDevelopmentGlobalAwareness correctly', () => {
      function TestComponent() {
        React.useEffect(() => {
          (globalThis as any).__START_NEW_GAME__ = vi.fn();
          return () => {
            delete (globalThis as any).__START_NEW_GAME__;
          };
        });

        return React.createElement('div', { 'data-testid': 'enhanced-test' }, 'Enhanced Test');
      }

      const result = renderWithDevelopmentGlobalAwareness(React.createElement(TestComponent));

      expect(result.container).toBeTruthy();

      // Test enhanced unmount
      const unmountResult = result.unmount();
      expect(unmountResult).toBeUndefined(); // unmount returns void in our implementation

      // Verify cleanup
      const globals = (globalThis as any).__START_NEW_GAME__;
      expect(globals).toBeUndefined();
    });
  });

  describe('Quick Lifecycle Checks', () => {
    it('should provide quick environment verification', () => {
      const check = quickLifecycleCheck();

      // Should start clean
      expect(check.globalsClean).toBe(true);
      expect(check.asyncClean).toBe(true);
      expect(check.eventsClean).toBe(true);
      expect(check.warnings).toEqual([]);
    });

    it('should detect when environment is not clean', () => {
      // Intentionally pollute the environment
      (globalThis as any).__START_NEW_GAME__ = vi.fn();

      const check = quickLifecycleCheck();
      expect(check.globalsClean).toBe(false);
      expect(check.warnings.length).toBeGreaterThan(0);

      // Clean up
      delete (globalThis as any).__START_NEW_GAME__;
    });
  });

  describe('Comprehensive Integration Test', () => {
    it('should handle complex production-like scenarios', () => {
      // Create a complex component with multiple features
      function ComplexComponent() {
        const [state, setState] = React.useState(0);

        React.useEffect(() => {
          // Set up production globals
          (globalThis as any).__START_NEW_GAME__ = vi.fn().mockResolvedValue(true);
          (globalThis as any).__clientLogTrack__ = vi.fn();

          // Set up async operation
          const timeout = setTimeout(() => {
            setState(1);
          }, 10);

          // Set up event listener
          const handleClick = () => setState(state + 1);
          window.addEventListener('click', handleClick);

          return () => {
            clearTimeout(timeout);
            window.removeEventListener('click', handleClick);
            delete (globalThis as any).__START_NEW_GAME__;
            delete (globalThis as any).__clientLogTrack__;
          };
        }, []);

        // Simulate production debugging feature
        React.useEffect(() => {
          if (state > 0) {
            (globalThis as any).__clientLogTrack__?.('state_changed', { value: state });
          }
        }, [state]);

        return React.createElement(
          'div',
          {
            'data-testid': 'complex-component',
            onClick: () => setState(state + 1),
          },
          `State: ${state}`,
        );
      }

      // Test with comprehensive verification
      const result = verifyComponentLifecycle(
        React.createElement(ComplexComponent),
        (verifier, verificationResult) => {
          expect(verificationResult.success).toBe(true);
          expect(verificationResult.componentCleanup.componentUnmounted).toBe(true);
          expect(verificationResult.globalStateCleanup.success).toBe(true);
          expect(verificationResult.asyncOperationCleanup.success).toBe(true);
          expect(verificationResult.eventListenerCleanup.success).toBe(true);
          expect(verificationResult.memoryCleanup.success).toBe(true);
        },
      );

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });
});
