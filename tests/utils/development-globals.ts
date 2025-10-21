/**
 * Utilities for managing production development globals in tests.
 *
 * Production code intentionally sets global variables during development
 * for debugging and feature enhancement. These utilities help tests
 * account for and properly manage these global patterns.
 */

import { describe, afterEach, beforeEach } from 'vitest';
import { captureDevelopmentGlobals, cleanupDevelopmentGlobals } from './component-lifecycle';

/**
 * Enhanced describe wrapper that ensures development globals are properly
 * managed throughout test execution.
 */
export function describeWithDevelopmentGlobals(name: string, fn: () => void) {
  describe(name, () => {
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
    });

    afterEach(() => {
      // Restore original global state
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

      // Additional cleanup for component lifecycle issues
      cleanupDevelopmentGlobals();
    });

    fn();
  });
}

/**
 * Restore development globals to a specific captured state
 */
export function restoreDevelopmentGlobals(original: ReturnType<typeof captureDevelopmentGlobals>) {
  // Restore or clear production development globals
  if (original.__START_NEW_GAME__) {
    (globalThis as any).__START_NEW_GAME__ = original.__START_NEW_GAME__;
  } else {
    delete (globalThis as any).__START_NEW_GAME__;
  }

  if (original.__clientLogTrack__) {
    (globalThis as any).__clientLogTrack__ = original.__clientLogTrack__;
  } else {
    delete (globalThis as any).__clientLogTrack__;
  }
}

/**
 * Check if any development globals are currently set
 */
export function hasDevelopmentGlobals(): boolean {
  const globals = captureDevelopmentGlobals();
  return !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);
}

/**
 * Log the current state of development globals for debugging
 */
export function logGlobalState(label: string) {
  const globals = captureDevelopmentGlobals();
  console.log(`[${label}] Global state:`, globals);
  return globals;
}

/**
 * Test helper that verifies no new development globals were left behind
 */
export function expectNoDevelopmentGlobals() {
  const globals = captureDevelopmentGlobals();
  expect(globals.__START_NEW_GAME__).toBeUndefined();
  expect(globals.__clientLogTrack__).toBeUndefined();
}
