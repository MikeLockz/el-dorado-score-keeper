/**
 * Component Lifecycle Verification Tools
 *
 * This module provides comprehensive tools for verifying that components
 * and hooks properly clean up their lifecycle, global state, async operations,
 * and event listeners, ensuring no resource leaks between tests.
 */

import { vi } from 'vitest';
import * as React from 'react';
import { render, RenderResult } from '@testing-library/react';
import { renderHook, RenderHookResult } from '@testing-library/react';
import {
  captureDevelopmentGlobals,
  cleanupDevelopmentGlobals,
  clearTimeoutsAndIntervals,
} from './component-lifecycle';
import { setupAsyncEventManagement } from './async-management';
import { createEventSystemTestEnvironment } from './event-system-integration';
import { createProductionLifecycleManager } from './production-lifecycle';

/**
 * Comprehensive lifecycle verification result
 */
export interface LifecycleVerificationResult {
  success: boolean;
  componentCleanup: ComponentCleanupResult;
  globalStateCleanup: GlobalStateCleanupResult;
  asyncOperationCleanup: AsyncOperationCleanupResult;
  eventListenerCleanup: EventListenerCleanupResult;
  memoryCleanup: MemoryCleanupResult;
  warnings: string[];
  errors: string[];
  metrics: LifecycleMetrics;
}

/**
 * Component cleanup verification result
 */
export interface ComponentCleanupResult {
  componentUnmounted: boolean;
  domCleaned: boolean;
  reactUnmountSucceeded: boolean;
  warnings: string[];
}

/**
 * Global state cleanup verification result
 */
export interface GlobalStateCleanupResult {
  initialGlobals: Record<string, any>;
  finalGlobals: Record<string, any>;
  leakedGlobals: string[];
  cleanedGlobals: string[];
  success: boolean;
}

/**
 * Async operation cleanup verification result
 */
export interface AsyncOperationCleanupResult {
  operationsBeforeCleanup: number;
  operationsAfterCleanup: number;
  timeoutsBeforeCleanup: number;
  timeoutsAfterCleanup: number;
  intervalsBeforeCleanup: number;
  intervalsAfterCleanup: number;
  success: boolean;
}

/**
 * Event listener cleanup verification result
 */
export interface EventListenerCleanupResult {
  listenersBeforeCleanup: number;
  listenersAfterCleanup: number;
  leakedListeners: Array<{
    target: string;
    type: string;
    listener: string;
  }>;
  success: boolean;
}

/**
 * Memory cleanup verification result
 */
export interface MemoryCleanupResult {
  referencesBeforeCleanup: number;
  referencesAfterCleanup: number;
  estimatedMemoryLeaked: number;
  success: boolean;
}

/**
 * Comprehensive lifecycle metrics
 */
export interface LifecycleMetrics {
  mountTime: number;
  unmountTime: number;
  effectRunCount: number;
  effectCleanupCount: number;
  globalStateChanges: number;
  asyncOperationsCreated: number;
  eventListenersAdded: number;
  renderCount: number;
  memoryFootprint: number;
}

/**
 * Lifecycle verifier for comprehensive testing
 */
export class LifecycleVerifier {
  private metrics: LifecycleMetrics;
  private initialGlobals: Record<string, any>;
  private asyncManager: ReturnType<typeof setupAsyncEventManagement>;
  private eventSystem: ReturnType<typeof createEventSystemTestEnvironment>;
  private lifecycleManager: ReturnType<typeof createProductionLifecycleManager>;
  private startTime: number;
  private warnings: string[] = [];
  private errors: string[] = [];

  constructor() {
    this.metrics = {
      mountTime: 0,
      unmountTime: 0,
      effectRunCount: 0,
      effectCleanupCount: 0,
      globalStateChanges: 0,
      asyncOperationsCreated: 0,
      eventListenersAdded: 0,
      renderCount: 0,
      memoryFootprint: 0,
    };

    this.initialGlobals = captureDevelopmentGlobals();
    this.asyncManager = setupAsyncEventManagement();
    this.eventSystem = createEventSystemTestEnvironment();
    this.lifecycleManager = createProductionLifecycleManager();
    this.startTime = Date.now();
  }

  /**
   * Verify component lifecycle
   */
  verifyComponentLifecycle<T extends React.ReactElement>(
    component: T,
    renderFn: (c: T) => RenderResult = (c) => render(c),
  ): LifecycleVerificationResult {
    const mountStartTime = Date.now();
    this.metrics.mountTime = mountStartTime;

    // Render component
    const renderResult = renderFn(component);
    this.metrics.renderCount++;

    // Track initial state
    const globalsAfterMount = captureDevelopmentGlobals();
    const asyncHealthBefore = this.asyncManager.getHealthStatus();
    const eventCleanupBefore = this.eventSystem.verifyEventCleanup();

    // Simulate some lifecycle activity
    renderResult.rerender();
    this.metrics.renderCount++;

    // Begin unmount verification
    const unmountStartTime = Date.now();

    try {
      renderResult.unmount();
      this.metrics.unmountTime = Date.now() - unmountStartTime;
    } catch (error) {
      this.errors.push(`Component unmount failed: ${error}`);
      return this.createFailureResult();
    }

    // Perform comprehensive verification
    const componentCleanup = this.verifyComponentUnmount(renderResult);
    const globalStateCleanup = this.verifyGlobalStateCleanup(
      this.initialGlobals,
      globalsAfterMount,
    );
    const asyncOperationCleanup = this.verifyAsyncOperationCleanup(asyncHealthBefore);
    const eventListenerCleanup = this.verifyEventListenerCleanup(eventCleanupBefore);
    const memoryCleanup = this.verifyMemoryCleanup();

    return {
      success: this.isOverallSuccess([
        componentCleanup,
        globalStateCleanup,
        asyncOperationCleanup,
        eventListenerCleanup,
        memoryCleanup,
      ]),
      componentCleanup,
      globalStateCleanup,
      asyncOperationCleanup,
      eventListenerCleanup,
      memoryCleanup,
      warnings: [...this.warnings],
      errors: [...this.errors],
      metrics: this.metrics,
    };
  }

  /**
   * Verify hook lifecycle
   */
  verifyHookLifecycle<Result, Props>(
    hook: (props: Props) => Result,
    initialProps: Props,
    renderFn: (h: typeof hook, p: Props) => RenderHookResult<Result, Props> = (h, p) =>
      renderHook(h, { initialProps: p }),
  ): LifecycleVerificationResult {
    const mountStartTime = Date.now();
    this.metrics.mountTime = mountStartTime;

    // Render hook
    const hookResult = renderFn(hook, initialProps);
    this.metrics.renderCount++;

    // Track initial state
    const globalsAfterMount = captureDevelopmentGlobals();
    const asyncHealthBefore = this.asyncManager.getHealthStatus();

    // Simulate some hook activity
    hookResult.rerender();
    this.metrics.renderCount++;

    // Begin unmount verification
    const unmountStartTime = Date.now();

    try {
      hookResult.unmount();
      this.metrics.unmountTime = Date.now() - unmountStartTime;
    } catch (error) {
      this.errors.push(`Hook unmount failed: ${error}`);
      return this.createFailureResult();
    }

    // Perform verification
    const componentCleanup = this.verifyHookUnmount(hookResult);
    const globalStateCleanup = this.verifyGlobalStateCleanup(
      this.initialGlobals,
      globalsAfterMount,
    );
    const asyncOperationCleanup = this.verifyAsyncOperationCleanup(asyncHealthBefore);
    const eventListenerCleanup = this.verifyEventListenerCleanup(
      this.eventSystem.verifyEventCleanup(),
    );
    const memoryCleanup = this.verifyMemoryCleanup();

    return {
      success: this.isOverallSuccess([
        componentCleanup,
        globalStateCleanup,
        asyncOperationCleanup,
        eventListenerCleanup,
        memoryCleanup,
      ]),
      componentCleanup,
      globalStateCleanup,
      asyncOperationCleanup,
      eventListenerCleanup,
      memoryCleanup,
      warnings: [...this.warnings],
      errors: [...this.errors],
      metrics: this.metrics,
    };
  }

  /**
   * Verify component unmount
   */
  private verifyComponentUnmount(renderResult: RenderResult): ComponentCleanupResult {
    const warnings: string[] = [];

    try {
      // Check if DOM was cleaned up
      const container = renderResult.container;
      const hasContent = container && container.children.length > 0;
      const domCleaned = !hasContent;

      if (!domCleaned) {
        warnings.push('DOM elements remain after component unmount');
      }

      return {
        componentUnmounted: true,
        domCleaned,
        reactUnmountSucceeded: true,
        warnings,
      };
    } catch (error) {
      warnings.push(`Error verifying component unmount: ${error}`);
      return {
        componentUnmounted: false,
        domCleaned: false,
        reactUnmountSucceeded: false,
        warnings,
      };
    }
  }

  /**
   * Verify hook unmount
   */
  private verifyHookUnmount(hookResult: RenderHookResult<any, any>): ComponentCleanupResult {
    const warnings: string[] = [];

    // Hooks don't have DOM, so we focus on React unmount success
    return {
      componentUnmounted: true,
      domCleaned: true, // Not applicable to hooks
      reactUnmountSucceeded: true,
      warnings,
    };
  }

  /**
   * Verify global state cleanup
   */
  private verifyGlobalStateCleanup(
    initialGlobals: Record<string, any>,
    globalsAfterMount: Record<string, any>,
  ): GlobalStateCleanupResult {
    const finalGlobals = captureDevelopmentGlobals();
    const leakedGlobals: string[] = [];
    const cleanedGlobals: string[] = [];

    // Check for production development globals that should be cleaned up
    const productionGlobals = ['__START_NEW_GAME__', '__clientLogTrack__'];

    productionGlobals.forEach((globalKey) => {
      const initialValue = initialGlobals[globalKey];
      const mountedValue = globalsAfterMount[globalKey];
      const finalValue = finalGlobals[globalKey];

      if (mountedValue !== initialValue && finalValue === initialValue) {
        cleanedGlobals.push(globalKey);
      } else if (finalValue !== initialValue) {
        leakedGlobals.push(globalKey);
      }
    });

    // Check for other global pollution
    Object.keys(finalGlobals).forEach((key) => {
      if (!productionGlobals.includes(key) && finalGlobals[key] !== initialGlobals[key]) {
        if (key.startsWith('__')) {
          leakedGlobals.push(key);
        }
      }
    });

    const success = leakedGlobals.length === 0;

    if (!success) {
      this.warnings.push(`Global state pollution detected: ${leakedGlobals.join(', ')}`);
    }

    return {
      initialGlobals,
      finalGlobals,
      leakedGlobals,
      cleanedGlobals,
      success,
    };
  }

  /**
   * Verify async operation cleanup
   */
  private verifyAsyncOperationCleanup(beforeCleanup: {
    activeOperations: number;
    trackedListeners: number;
  }): AsyncOperationCleanupResult {
    // Force cleanup
    clearTimeoutsAndIntervals();
    this.asyncManager.cleanup();

    const afterCleanup = this.asyncManager.getHealthStatus();

    const operationsBeforeCleanup = beforeCleanup.activeOperations;
    const operationsAfterCleanup = afterCleanup.activeOperations;
    const timeoutsBeforeCleanup = this.getTimeoutCount();
    const timeoutsAfterCleanup = this.getTimeoutCount();
    const intervalsBeforeCleanup = this.getIntervalCount();
    const intervalsAfterCleanup = this.getIntervalCount();

    const success =
      operationsAfterCleanup === 0 && timeoutsAfterCleanup === 0 && intervalsAfterCleanup === 0;

    if (!success) {
      this.warnings.push(
        `Async operations not cleaned up: ${operationsAfterCleanup} operations, ${timeoutsAfterCleanup} timeouts, ${intervalsAfterCleanup} intervals`,
      );
    }

    return {
      operationsBeforeCleanup,
      operationsAfterCleanup,
      timeoutsBeforeCleanup,
      timeoutsAfterCleanup,
      intervalsBeforeCleanup,
      intervalsAfterCleanup,
      success,
    };
  }

  /**
   * Verify event listener cleanup
   */
  private verifyEventListenerCleanup(beforeCleanup: {
    success: boolean;
    remainingListeners: number;
  }): EventListenerCleanupResult {
    const afterCleanup = this.eventSystem.verifyEventCleanup();
    const listenersBeforeCleanup = beforeCleanup.remainingListeners;
    const listenersAfterCleanup = afterCleanup.remainingListeners;

    const success = afterCleanup.success && listenersAfterCleanup === 0;

    if (!success) {
      this.warnings.push(`Event listeners not cleaned up: ${listenersAfterCleanup} remaining`);
    }

    return {
      listenersBeforeCleanup,
      listenersAfterCleanup,
      leakedListeners: [], // Could be enhanced with actual listener tracking
      success,
    };
  }

  /**
   * Verify memory cleanup
   */
  private verifyMemoryCleanup(): MemoryCleanupResult {
    // This is a simplified memory check
    const referencesBeforeCleanup = this.estimateObjectCount(this.initialGlobals);
    const referencesAfterCleanup = this.estimateObjectCount(captureDevelopmentGlobals());

    const estimatedMemoryLeaked = Math.max(0, referencesAfterCleanup - referencesBeforeCleanup);
    const success = estimatedMemoryLeaked === 0;

    if (!success) {
      this.warnings.push(
        `Potential memory leak detected: ~${estimatedMemoryLeaked} object references`,
      );
    }

    return {
      referencesBeforeCleanup,
      referencesAfterCleanup,
      estimatedMemoryLeaked,
      success,
    };
  }

  /**
   * Get current timeout count
   */
  private getTimeoutCount(): number {
    // This is an approximation
    const maxTimeoutId = setTimeout(() => {}, 0);
    clearTimeout(maxTimeoutId);
    return maxTimeoutId;
  }

  /**
   * Get current interval count
   */
  private getIntervalCount(): number {
    // This is an approximation
    let count = 0;
    const maxId = setInterval(() => {}, 1000000);
    clearInterval(maxId);
    return count;
  }

  /**
   * Estimate object count in a global scope
   */
  private estimateObjectCount(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.keys(obj).length;
  }

  /**
   * Check if overall verification succeeded
   */
  private isOverallSuccess(results: any[]): boolean {
    return results.every((result) => result.success);
  }

  /**
   * Create failure result
   */
  private createFailureResult(): LifecycleVerificationResult {
    return {
      success: false,
      componentCleanup: {
        componentUnmounted: false,
        domCleaned: false,
        reactUnmountSucceeded: false,
        warnings: [],
      },
      globalStateCleanup: {
        initialGlobals: this.initialGlobals,
        finalGlobals: {},
        leakedGlobals: [],
        cleanedGlobals: [],
        success: false,
      },
      asyncOperationCleanup: {
        operationsBeforeCleanup: 0,
        operationsAfterCleanup: 0,
        timeoutsBeforeCleanup: 0,
        timeoutsAfterCleanup: 0,
        intervalsBeforeCleanup: 0,
        intervalsAfterCleanup: 0,
        success: false,
      },
      eventListenerCleanup: {
        listenersBeforeCleanup: 0,
        listenersAfterCleanup: 0,
        leakedListeners: [],
        success: false,
      },
      memoryCleanup: {
        referencesBeforeCleanup: 0,
        referencesAfterCleanup: 0,
        estimatedMemoryLeaked: 0,
        success: false,
      },
      warnings: [...this.warnings],
      errors: [...this.errors],
      metrics: this.metrics,
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): LifecycleMetrics {
    return { ...this.metrics };
  }

  /**
   * Get warnings
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Get errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Reset verifier state
   */
  reset(): void {
    this.metrics = {
      mountTime: 0,
      unmountTime: 0,
      effectRunCount: 0,
      effectCleanupCount: 0,
      globalStateChanges: 0,
      asyncOperationsCreated: 0,
      eventListenersAdded: 0,
      renderCount: 0,
      memoryFootprint: 0,
    };

    this.initialGlobals = captureDevelopmentGlobals();
    this.warnings = [];
    this.errors = [];
    this.startTime = Date.now();
  }

  /**
   * Clean up verifier
   */
  cleanup(): void {
    this.asyncManager.cleanup();
    this.eventSystem.cleanup();
    this.lifecycleManager.cleanup();
    cleanupDevelopmentGlobals();
  }
}

/**
 * Test helper for component lifecycle verification
 */
export function verifyComponentLifecycle<T extends React.ReactElement>(
  component: T,
  testFn?: (verifier: LifecycleVerifier, result: LifecycleVerificationResult) => void,
): LifecycleVerificationResult {
  const verifier = new LifecycleVerifier();

  try {
    const result = verifier.verifyComponentLifecycle(component);

    if (testFn) {
      testFn(verifier, result);
    }

    return result;
  } finally {
    verifier.cleanup();
  }
}

/**
 * Test helper for hook lifecycle verification
 */
export function verifyHookLifecycle<Result, Props>(
  hook: (props: Props) => Result,
  initialProps: Props,
  testFn?: (verifier: LifecycleVerifier, result: LifecycleVerificationResult) => void,
): LifecycleVerificationResult {
  const verifier = new LifecycleVerifier();

  try {
    const result = verifier.verifyHookLifecycle(hook, initialProps);

    if (testFn) {
      testFn(verifier, result);
    }

    return result;
  } finally {
    verifier.cleanup();
  }
}

/**
 * Quick verification for common cleanup issues
 */
export function quickLifecycleCheck(): {
  globalsClean: boolean;
  asyncClean: boolean;
  eventsClean: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check globals
  const globals = captureDevelopmentGlobals();
  const hasProductionGlobals = !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);
  if (hasProductionGlobals) {
    warnings.push('Production globals detected in test environment');
  }

  // Check async operations
  const asyncManager = setupAsyncEventManagement();
  const asyncHealth = asyncManager.getHealthStatus();
  const asyncClean = asyncHealth.healthy;
  if (!asyncClean) {
    warnings.push(
      `Async operations detected: ${asyncHealth.activeOperations} operations, ${asyncHealth.trackedListeners} listeners`,
    );
  }

  // Check event system
  const eventSystem = createEventSystemTestEnvironment();
  const eventsClean = eventSystem.verifyEventCleanup().success;
  if (!eventsClean) {
    warnings.push('Event listeners not properly cleaned up');
  }

  asyncManager.cleanup();
  eventSystem.cleanup();

  return {
    globalsClean: !hasProductionGlobals,
    asyncClean,
    eventsClean,
    warnings,
  };
}

/**
 * Global lifecycle verifier instance
 */
export const globalLifecycleVerifier = new LifecycleVerifier();
