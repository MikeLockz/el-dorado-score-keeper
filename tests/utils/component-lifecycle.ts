import { render, RenderOptions, RenderResult } from '@testing-library/react';
import React from 'react';

/**
 * Enhanced render function that provides proper component lifecycle management
 * for tests. This ensures components are fully unmounted with proper cleanup.
 */
export function renderWithFullLifecycle(
  ui: React.ReactElement,
  options?: RenderOptions,
): Omit<RenderResult, 'unmount'> & { unmount: () => void } {
  const result = render(ui, options);

  // Enhanced cleanup that ensures proper component unmounting
  const enhancedUnmount = () => {
    // Force component unmounting
    result.unmount();

    // Cleanup production globals set by unmounted components
    cleanupDevelopmentGlobals();

    // Clear any pending async operations
    clearTimeoutsAndIntervals();
  };

  return { ...result, unmount: enhancedUnmount };
}

/**
 * Cleanup production development globals that may be set by components
 * during development. These globals are intentionally set by production code
 * for development features but need to be cleaned up in tests.
 */
export function cleanupDevelopmentGlobals() {
  // Clean up production development globals
  delete (globalThis as any).__START_NEW_GAME__;
  delete (globalThis as any).__clientLogTrack__;

  // Add any other production globals as they're discovered
  // Note: Preserve intentional globals like crypto, fetch bindings
}

/**
 * Clear any remaining timeouts and intervals from production hooks
 * that may not have been cleaned up properly.
 */
export function clearTimeoutsAndIntervals() {
  // Clear any remaining timeouts/intervals from production hooks
  const maxTimeoutId = setTimeout(() => {}, 0);
  for (let i = 1; i <= maxTimeoutId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }
}

/**
 * Capture the current state of development globals for comparison
 */
export function captureDevelopmentGlobals() {
  return {
    __START_NEW_GAME__: (globalThis as any).__START_NEW_GAME__,
    __clientLogTrack__: (globalThis as any).__clientLogTrack__,
  };
}

/**
 * Compare two development global states to detect changes
 */
export function compareDevelopmentStates(
  before: ReturnType<typeof captureDevelopmentGlobals>,
  after: ReturnType<typeof captureDevelopmentGlobals>,
) {
  return {
    __START_NEW_GAME__: before.__START_NEW_GAME__ !== after.__START_NEW_GAME__,
    __clientLogTrack__: before.__clientLogTrack__ !== after.__clientLogTrack__,
  };
}

/**
 * Higher-order function that ensures development globals are properly managed
 * during a test function execution.
 */
export function withDevelopmentGlobals<T>(testFn: () => T): T {
  const originalGlobals = captureDevelopmentGlobals();

  try {
    return testFn();
  } finally {
    // Restore or clear development globals
    if (originalGlobals.__START_NEW_GAME__) {
      (globalThis as any).__START_NEW_GAME__ = originalGlobals.__START_NEW_GAME__;
    } else {
      delete (globalThis as any).__START_NEW_GAME__;
    }

    if (originalGlobals.__clientLogTrack__) {
      (globalThis as any).__clientLogTrack__ = originalGlobals.__clientLogTrack__;
    } else {
      delete (globalThis as any).__clientLogTrack__;
    }
  }
}
