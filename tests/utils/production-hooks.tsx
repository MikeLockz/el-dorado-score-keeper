/**
 * Production Hook Testing Integration
 *
 * This module provides specialized utilities for testing React hooks that
 * use production development globals and lifecycle patterns, ensuring hooks
 * behave exactly as they would in production while maintaining test reliability.
 */

import * as React from 'react';
import { renderHook, RenderHookResult, RenderHookOptions } from '@testing-library/react';
import {
  captureDevelopmentGlobals,
  restoreDevelopmentGlobals,
  cleanupDevelopmentGlobals,
} from './component-lifecycle';
import { setupAsyncEventManagement } from './async-management';
import { createProductionLifecycleManager } from './production-lifecycle';

/**
 * Enhanced result for production hook testing
 */
export interface ProductionHookTestResult<Result, Props>
  extends Omit<RenderHookResult<Result, Props>, 'unmount'> {
  unmount: () => HookCleanupResult;
  verifyProductionGlobals: () => ProductionGlobalVerification;
  simulateProductionUnmount: () => ProductionUnmountResult;
  triggerProductionRerender: (newProps?: Partial<Props>) => void;
  getHookMetrics: () => HookMetrics;
  waitForAsyncOperations: () => Promise<void>;
}

/**
 * Result of hook cleanup verification
 */
export interface HookCleanupResult {
  success: boolean;
  remainingGlobals: string[];
  leakedAsyncOperations: number;
  leakedEventListeners: number;
  metrics: HookMetrics;
}

/**
 * Result of production global verification
 */
export interface ProductionGlobalVerification {
  hasProductionGlobals: boolean;
  globals: Record<string, any>;
  changesSinceMount: Record<string, { before: any; after: any }>;
  isProductionCompatible: boolean;
}

/**
 * Result of production unmount simulation
 */
export interface ProductionUnmountResult {
  success: boolean;
  productionCleanupSucceeded: boolean;
  remainingGlobals: string[];
  metrics: HookMetrics;
  warnings: string[];
}

/**
 * Metrics for hook testing
 */
export interface HookMetrics {
  renderCount: number;
  rerenderCount: number;
  effectRunCount: number;
  cleanupRunCount: number;
  globalStateChanges: number;
  asyncOperationsCreated: number;
  asyncOperationsCompleted: number;
  eventListenersAdded: number;
  eventListenersRemoved: number;
  memoryFootprint: number;
}

/**
 * Creates an enhanced production hook testing environment
 */
export function createProductionHookTestEnvironment() {
  let metrics: HookMetrics = {
    renderCount: 0,
    rerenderCount: 0,
    effectRunCount: 0,
    cleanupRunCount: 0,
    globalStateChanges: 0,
    asyncOperationsCreated: 0,
    asyncOperationsCompleted: 0,
    eventListenersAdded: 0,
    eventListenersRemoved: 0,
    memoryFootprint: 0,
  };

  let initialGlobals = captureDevelopmentGlobals();
  let currentGlobals = { ...initialGlobals };
  const asyncManager = setupAsyncEventManagement();
  const lifecycleManager = createProductionLifecycleManager();

  const updateMetric = (key: keyof HookMetrics, increment = 1) => {
    metrics[key] += increment;
  };

  const trackGlobalChange = () => {
    const newGlobals = captureDevelopmentGlobals();
    Object.keys(newGlobals).forEach((key) => {
      if (newGlobals[key] !== currentGlobals[key]) {
        updateMetric('globalStateChanges');
      }
    });
    currentGlobals = { ...newGlobals };
  };

  const renderProductionHook = <Result, Props>(
    hook: (props: Props) => Result,
    options?: RenderHookOptions<Props>,
  ): ProductionHookTestResult<Result, Props> => {
    updateMetric('renderCount');

    const { result, rerender, unmount } = renderHook(hook, {
      wrapper: ({ children }) => (
        <ProductionHookWrapper
          onEffectRun={() => updateMetric('effectRunCount')}
          onCleanup={() => updateMetric('cleanupRunCount')}
          onGlobalChange={trackGlobalChange}
          onAsyncOperation={() => updateMetric('asyncOperationsCreated')}
          onAsyncComplete={() => updateMetric('asyncOperationsCompleted')}
          onEventListenerAdd={() => updateMetric('eventListenersAdded')}
          onEventListenerRemove={() => updateMetric('eventListenersRemoved')}
        >
          {children}
        </ProductionHookWrapper>
      ),
      ...options,
    });

    const enhancedUnmount = (): HookCleanupResult => {
      const globalsBeforeUnmount = captureDevelopmentGlobals();

      try {
        unmount();

        const globalsAfterUnmount = captureDevelopmentGlobals();
        const remainingGlobals: string[] = [];

        // Check for remaining production globals
        Object.keys(globalsAfterUnmount).forEach((key) => {
          if (
            globalsAfterUnmount[key] !== undefined &&
            globalsAfterUnmount[key] !== initialGlobals[key] &&
            key.startsWith('__')
          ) {
            remainingGlobals.push(key);
          }
        });

        // Check for leaked async operations
        const asyncHealth = asyncManager.getHealthStatus();
        const leakedAsyncOperations = asyncHealth.activeOperations;
        const leakedEventListeners = asyncHealth.trackedListeners;

        // Enhanced cleanup
        asyncManager.cleanup();
        lifecycleManager.cleanup();
        cleanupDevelopmentGlobals();

        return {
          success:
            remainingGlobals.length === 0 &&
            leakedAsyncOperations === 0 &&
            leakedEventListeners === 0,
          remainingGlobals,
          leakedAsyncOperations,
          leakedEventListeners,
          metrics: getHookMetrics(),
        };
      } catch (error) {
        console.error('Production hook unmount failed:', error);
        return {
          success: false,
          remainingGlobals: [],
          leakedAsyncOperations: 0,
          leakedEventListeners: 0,
          metrics: getHookMetrics(),
        };
      }
    };

    const verifyProductionGlobals = (): ProductionGlobalVerification => {
      const globals = captureDevelopmentGlobals();
      const changesSinceMount: Record<string, { before: any; after: any }> = {};

      Object.keys(globals).forEach((key) => {
        if (globals[key] !== initialGlobals[key]) {
          changesSinceMount[key] = {
            before: initialGlobals[key],
            after: globals[key],
          };
        }
      });

      const hasProductionGlobals = !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);

      const isProductionCompatible =
        !!(globals.__START_NEW_GAME__ && typeof globals.__START_NEW_GAME__ === 'function') ||
        !!(globals.__clientLogTrack__ && typeof globals.__clientLogTrack__ === 'function');

      return {
        hasProductionGlobals,
        globals,
        changesSinceMount,
        isProductionCompatible,
      };
    };

    const simulateProductionUnmount = (): ProductionUnmountResult => {
      const warnings: string[] = [];
      const globalsBeforeUnmount = captureDevelopmentGlobals();

      try {
        // Simulate production unmount sequence
        unmount();

        // Verify production cleanup
        const globalsAfterUnmount = captureDevelopmentGlobals();
        const remainingGlobals: string[] = [];

        // Check for production globals that should be cleaned up
        if (globalsBeforeUnmount.__START_NEW_GAME__ && !globalsAfterUnmount.__START_NEW_GAME__) {
          // Good: __START_NEW_GAME__ was cleaned up
        } else if (
          globalsBeforeUnmount.__START_NEW_GAME__ &&
          globalsAfterUnmount.__START_NEW_GAME__
        ) {
          warnings.push('__START_NEW_GAME__ was not cleaned up during unmount');
          remainingGlobals.push('__START_NEW_GAME__');
        }

        if (globalsBeforeUnmount.__clientLogTrack__ && !globalsAfterUnmount.__clientLogTrack__) {
          // Good: __clientLogTrack__ was cleaned up
        } else if (
          globalsBeforeUnmount.__clientLogTrack__ &&
          globalsAfterUnmount.__clientLogTrack__
        ) {
          warnings.push('__clientLogTrack__ was not cleaned up during unmount');
          remainingGlobals.push('__clientLogTrack__');
        }

        // Final cleanup
        asyncManager.cleanup();
        lifecycleManager.cleanup();
        cleanupDevelopmentGlobals();

        return {
          success: warnings.length === 0,
          productionCleanupSucceeded: remainingGlobals.length === 0,
          remainingGlobals,
          metrics: getHookMetrics(),
          warnings,
        };
      } catch (error) {
        warnings.push(`Production unmount failed: ${error}`);
        return {
          success: false,
          productionCleanupSucceeded: false,
          remainingGlobals: ['__START_NEW_GAME__', '__clientLogTrack__'], // Assume worst case
          metrics: getHookMetrics(),
          warnings,
        };
      }
    };

    const triggerProductionRerender = (newProps?: Partial<Props>) => {
      updateMetric('rerenderCount');

      if (newProps) {
        rerender({ ...(result.current as any).props, ...newProps } as any);
      } else {
        rerender();
      }

      trackGlobalChange();
    };

    const getHookMetrics = (): HookMetrics => ({ ...metrics });

    const waitForAsyncOperations = async (): Promise<void> => {
      await asyncManager.waitForAllAsync();
    };

    return {
      result,
      rerender: triggerProductionRerender,
      unmount: enhancedUnmount,
      verifyProductionGlobals,
      simulateProductionUnmount,
      getHookMetrics,
      waitForAsyncOperations,
    };
  };

  const getHookMetrics = (): HookMetrics => ({ ...metrics });

  const cleanup = () => {
    asyncManager.cleanup();
    lifecycleManager.cleanup();
    cleanupDevelopmentGlobals();
    restoreDevelopmentGlobals(initialGlobals);
  };

  return {
    renderProductionHook,
    getHookMetrics,
    cleanup,
    trackGlobalChange,
  };
}

/**
 * Production hook wrapper component
 */
interface ProductionHookWrapperProps {
  children: React.ReactNode;
  onEffectRun?: () => void;
  onCleanup?: () => void;
  onGlobalChange?: () => void;
  onAsyncOperation?: () => void;
  onAsyncComplete?: () => void;
  onEventListenerAdd?: () => void;
  onEventListenerRemove?: () => void;
}

function ProductionHookWrapper({
  children,
  onEffectRun,
  onCleanup,
  onGlobalChange,
  onAsyncOperation,
  onAsyncComplete,
  onEventListenerAdd,
  onEventListenerRemove,
}: ProductionHookWrapperProps) {
  const [effectCount, setEffectCount] = React.useState(0);

  // Track effect runs
  React.useEffect(() => {
    onEffectRun?.();
    setEffectCount((prev) => prev + 1);

    return () => {
      onCleanup?.();
    };
  });

  // Track global changes
  React.useEffect(() => {
    const checkGlobalChanges = () => {
      onGlobalChange?.();
    };

    // Set up interval to check for global changes
    const interval = setInterval(checkGlobalChanges, 100);
    onAsyncOperation?.();

    return () => {
      clearInterval(interval);
      onAsyncComplete?.();
    };
  }, [onEffectRun, onCleanup, onGlobalChange, onAsyncOperation, onAsyncComplete]);

  return <>{children}</>;
}

/**
 * Hook for testing production development features
 */
export function useProductionDevelopmentFeature<T>(
  featureName: string,
  featureFactory: () => T,
): [T, (newValue?: T) => void, () => boolean] {
  const [feature, setFeature] = React.useState<T>(() => {
    try {
      return featureFactory();
    } catch (error) {
      console.warn(`Failed to initialize ${featureName}:`, error);
      return null as any;
    }
  });

  const updateFeature = React.useCallback(
    (newValue?: T) => {
      if (newValue !== undefined) {
        setFeature(newValue);
      } else {
        try {
          setFeature(featureFactory());
        } catch (error) {
          console.warn(`Failed to update ${featureName}:`, error);
        }
      }
    },
    [featureName, featureFactory],
  );

  const isAvailable = React.useCallback(() => {
    return feature !== null && feature !== undefined;
  }, [feature]);

  return [feature, updateFeature, isAvailable];
}

/**
 * Test helper for production hook testing
 */
export function testProductionHook<Result, Props>(
  useHook: (props: Props) => Result,
  initialProps: Props,
  testFn: (hookResult: ProductionHookTestResult<Result, Props>) => void | Promise<void>,
) {
  const environment = createProductionHookTestEnvironment();

  try {
    const hookResult = environment.renderProductionHook(useHook, { initialProps });
    return testFn(hookResult);
  } finally {
    environment.cleanup();
  }
}

/**
 * Test helper for verifying hook cleanup behavior
 */
export function expectHookCleanup<Result, Props>(useHook: (props: Props) => Result, props: Props) {
  const environment = createProductionHookTestEnvironment();

  const hookResult = environment.renderProductionHook(useHook, { initialProps: props });

  return {
    expectCleanUnmount: () => {
      const unmountResult = hookResult.simulateProductionUnmount();
      expect(unmountResult.success).toBe(true);
      expect(unmountResult.productionCleanupSucceeded).toBe(true);
      expect(unmountResult.warnings).toEqual([]);
      environment.cleanup();
    },

    expectNoRemainingGlobals: () => {
      const globals = hookResult.verifyProductionGlobals();
      expect(globals.remainingGlobals).toEqual([]);
      environment.cleanup();
    },

    expectProductionFeatureAvailable: (featureName: string) => {
      const globals = hookResult.verifyProductionGlobals();
      expect(globals.globals[featureName]).toBeDefined();
      expect(typeof globals.globals[featureName]).toBe('function');
      environment.cleanup();
    },

    getMetrics: () => hookResult.getHookMetrics(),

    cleanup: () => environment.cleanup(),
  };
}

/**
 * Global production hook testing environment
 */
export const globalProductionHookEnvironment = createProductionHookTestEnvironment();
