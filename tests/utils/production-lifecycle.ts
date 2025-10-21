/**
 * Production Component Lifecycle Integration
 *
 * This module provides utilities for testing production components with
 * full lifecycle management, ensuring components behave exactly as they
 * would in production while maintaining test isolation and reliability.
 */

import * as React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { renderHook, RenderHookResult } from '@testing-library/react';
import {
  cleanupDevelopmentGlobals,
  captureDevelopmentGlobals,
  restoreDevelopmentGlobals,
} from './component-lifecycle';
import { setupAsyncEventManagement } from './async-management';

/**
 * Interface for production component lifecycle manager
 */
export interface ProductionLifecycleManager {
  render: <T extends React.ReactElement>(
    component: T,
    options?: RenderOptions,
  ) => ProductionComponentResult<T>;
  renderHook: <Result, Props>(
    callback: (props: Props) => Result,
    options?: { initialProps?: Props },
  ) => ProductionHookResult<Result, Props>;
  getMetrics: () => LifecycleMetrics;
  cleanup: () => void;
}

/**
 * Metrics for component lifecycle tracking
 */
export interface LifecycleMetrics {
  mountCount: number;
  unmountCount: number;
  effectCount: number;
  cleanupCount: number;
  globalStateChanges: number;
  asyncOperationsCreated: number;
  eventListenersCreated: number;
  memoryUsage: number;
}

/**
 * Enhanced result for production component testing
 */
export interface ProductionComponentResult<T extends React.ReactElement>
  extends Omit<RenderResult, 'unmount'> {
  unmount: () => { cleanupSuccess: boolean; metrics: LifecycleMetrics };
  verifyCleanup: () => { isClean: boolean; remainingGlobals: string[]; metrics: LifecycleMetrics };
  getProductionGlobals: () => any;
  hasProductionGlobals: () => boolean;
  triggerEffectRerun: () => void;
  simulateProductionUnmount: () => { success: boolean; metrics: LifecycleMetrics };
}

/**
 * Enhanced result for production hook testing
 */
export interface ProductionHookResult<Result, Props>
  extends Omit<RenderHookResult<Result, Props>, 'unmount'> {
  unmount: () => { cleanupSuccess: boolean; metrics: LifecycleMetrics };
  verifyHookCleanup: () => {
    isClean: boolean;
    remainingGlobals: string[];
    metrics: LifecycleMetrics;
  };
  getProductionGlobals: () => any;
  hasProductionGlobals: () => boolean;
  simulateProductionUnmount: () => { success: boolean; metrics: LifecycleMetrics };
}

/**
 * Creates a production lifecycle manager for testing
 */
export function createProductionLifecycleManager(): ProductionLifecycleManager {
  let metrics: LifecycleMetrics = {
    mountCount: 0,
    unmountCount: 0,
    effectCount: 0,
    cleanupCount: 0,
    globalStateChanges: 0,
    asyncOperationsCreated: 0,
    eventListenersCreated: 0,
    memoryUsage: 0,
  };

  let components = new Set<string>();
  let hooks = new Set<string>();
  let initialGlobals = captureDevelopmentGlobals();
  const asyncManager = setupAsyncEventManagement();

  const updateMetric = (key: keyof LifecycleMetrics, increment = 1) => {
    metrics[key] += increment;
  };

  const trackComponent = (componentId: string) => {
    components.add(componentId);
    updateMetric('mountCount');
  };

  const trackHook = (hookId: string) => {
    hooks.add(hookId);
  };

  const getMetrics = (): LifecycleMetrics => ({ ...metrics });

  return {
    render: <T extends React.ReactElement>(
      component: T,
      options?: RenderOptions,
    ): ProductionComponentResult<T> => {
      const componentId = `component-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      trackComponent(componentId);

      // Track global state before mount
      const globalsBeforeMount = captureDevelopmentGlobals();

      const result = render(component, {
        wrapper: ({ children }) =>
          React.createElement(
            ProductionLifecycleProvider,
            {
              onEffectRun: () => updateMetric('effectCount'),
              onCleanup: () => updateMetric('cleanupCount'),
              onGlobalStateChange: () => updateMetric('globalStateChange'),
            },
            children,
          ),
        ...options,
      });

      const enhancedUnmount = (): { cleanupSuccess: boolean; metrics: LifecycleMetrics } => {
        updateMetric('unmountCount');

        // Perform production-like unmount
        try {
          result.unmount();

          // Track async operations and event listeners created
          const health = asyncManager.getHealthStatus();
          updateMetric('asyncOperationsCreated', health.activeOperations);
          updateMetric('eventListenersCreated', health.trackedListeners);

          // Enhanced cleanup
          asyncManager.cleanup();
          cleanupDevelopmentGlobals();

          return { cleanupSuccess: true, metrics: getMetrics() };
        } catch (error) {
          console.error('Production unmount failed:', error);
          return { cleanupSuccess: false, metrics: getMetrics() };
        }
      };

      const verifyCleanup = (): {
        isClean: boolean;
        remainingGlobals: string[];
        metrics: LifecycleMetrics;
      } => {
        const finalGlobals = captureDevelopmentGlobals();
        const remainingGlobals: string[] = [];

        // Check for remaining production globals
        Object.keys(finalGlobals).forEach((key) => {
          if (
            finalGlobals[key] !== undefined &&
            finalGlobals[key] !== null &&
            finalGlobals[key] !== (initialGlobals as any)[key]
          ) {
            remainingGlobals.push(key);
          }
        });

        const isClean = remainingGlobals.length === 0 && asyncManager.getHealthStatus().healthy;

        return { isClean, remainingGlobals, metrics: getMetrics() };
      };

      const getProductionGlobals = () => captureDevelopmentGlobals();

      const hasProductionGlobals = () => {
        const globals = getProductionGlobals();
        return !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);
      };

      const triggerEffectRerun = () => {
        // Simulate a prop change to trigger effect rerun
        result.rerender();
      };

      const simulateProductionUnmount = (): { success: boolean; metrics: LifecycleMetrics } => {
        // Simulate the exact production unmount process
        try {
          // Step 1: Begin unmount sequence
          updateMetric('unmountCount');

          // Step 2: Clear production globals set by component
          const globalsBeforeCleanup = captureDevelopmentGlobals();

          // Step 3: Perform React unmount
          result.unmount();

          // Step 4: Verify globals are cleaned up
          const globalsAfterCleanup = captureDevelopmentGlobals();
          const componentLeftGlobals =
            globalsBeforeCleanup.__START_NEW_GAME__ !== globalsAfterCleanup.__START_NEW_GAME__ ||
            globalsBeforeCleanup.__clientLogTrack__ !== globalsAfterCleanup.__clientLogTrack__;

          if (componentLeftGlobals) {
            console.warn('Component left production globals after unmount');
            cleanupDevelopmentGlobals();
          }

          // Step 5: Clean up async operations
          asyncManager.cleanup();

          return { success: !componentLeftGlobals, metrics: getMetrics() };
        } catch (error) {
          console.error('Production unmount simulation failed:', error);
          return { success: false, metrics: getMetrics() };
        }
      };

      return {
        ...result,
        unmount: enhancedUnmount,
        verifyCleanup,
        getProductionGlobals,
        hasProductionGlobals,
        triggerEffectRerun,
        simulateProductionUnmount,
      };
    },

    renderHook: <Result, Props>(
      callback: (props: Props) => Result,
      options?: { initialProps?: Props },
    ): ProductionHookResult<Result, Props> => {
      const hookId = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      trackHook(hookId);

      const { result, rerender, unmount } = renderHook(callback, options);

      const enhancedUnmount = (): { cleanupSuccess: boolean; metrics: LifecycleMetrics } => {
        updateMetric('unmountCount');

        try {
          unmount();

          // Track hook-specific async operations
          const health = asyncManager.getHealthStatus();
          updateMetric('asyncOperationsCreated', health.activeOperations);

          asyncManager.cleanup();
          cleanupDevelopmentGlobals();

          return { cleanupSuccess: true, metrics: getMetrics() };
        } catch (error) {
          console.error('Production hook unmount failed:', error);
          return { cleanupSuccess: false, metrics: getMetrics() };
        }
      };

      const verifyHookCleanup = (): {
        isClean: boolean;
        remainingGlobals: string[];
        metrics: LifecycleMetrics;
      } => {
        const finalGlobals = captureDevelopmentGlobals();
        const remainingGlobals: string[] = [];

        Object.keys(finalGlobals).forEach((key) => {
          if (
            finalGlobals[key] !== undefined &&
            finalGlobals[key] !== null &&
            finalGlobals[key] !== (initialGlobals as any)[key]
          ) {
            remainingGlobals.push(key);
          }
        });

        const isClean = remainingGlobals.length === 0 && asyncManager.getHealthStatus().healthy;

        return { isClean, remainingGlobals, metrics: getMetrics() };
      };

      const getProductionGlobals = () => captureDevelopmentGlobals();

      const hasProductionGlobals = () => {
        const globals = getProductionGlobals();
        return !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);
      };

      const simulateProductionUnmount = (): { success: boolean; metrics: LifecycleMetrics } => {
        try {
          updateMetric('unmountCount');

          const globalsBeforeCleanup = captureDevelopmentGlobals();
          unmount();
          const globalsAfterCleanup = captureDevelopmentGlobals();

          const hookLeftProductionGlobals =
            globalsBeforeCleanup.__START_NEW_GAME__ !== globalsAfterCleanup.__START_NEW_GAME__ ||
            globalsBeforeCleanup.__clientLogTrack__ !== globalsAfterCleanup.__clientLogTrack__;

          if (hookLeftProductionGlobals) {
            console.warn('Hook left production development globals after unmount');
            cleanupDevelopmentGlobals();
          }

          asyncManager.cleanup();
          return { success: !hookLeftProductionGlobals, metrics: getMetrics() };
        } catch (error) {
          console.error('Production hook unmount simulation failed:', error);
          return { success: false, metrics: getMetrics() };
        }
      };

      return {
        result,
        rerender,
        unmount: enhancedUnmount,
        verifyHookCleanup,
        getProductionGlobals,
        hasProductionGlobals,
        simulateProductionUnmount,
      };
    },

    getMetrics,
    cleanup: () => {
      components.clear();
      hooks.clear();
      asyncManager.cleanup();
      cleanupDevelopmentGlobals();
      restoreDevelopmentGlobals(initialGlobals);
    },
  };
}

/**
 * Production lifecycle provider component
 */
interface ProductionLifecycleProviderProps {
  children: React.ReactNode;
  onEffectRun?: () => void;
  onCleanup?: () => void;
  onGlobalStateChange?: () => void;
}

const ProductionLifecycleContext = React.createContext<{
  registerEffect: (id: string, cleanup: () => void) => void;
  unregisterEffect: (id: string) => void;
  notifyGlobalChange: () => void;
}>({
  registerEffect: () => {},
  unregisterEffect: () => {},
  notifyGlobalChange: () => {},
});

function ProductionLifecycleProvider({
  children,
  onEffectRun,
  onCleanup,
  onGlobalStateChange,
}: ProductionLifecycleProviderProps) {
  const [effects, setEffects] = React.useState<Set<string>>(new Set());

  const registerEffect = React.useCallback(
    (id: string, cleanup: () => void) => {
      setEffects((prev) => new Set(prev).add(id));
      onEffectRun?.();

      return () => {
        setEffects((prev) => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        onCleanup?.();
      };
    },
    [onEffectRun, onCleanup],
  );

  const unregisterEffect = React.useCallback((id: string) => {
    setEffects((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const notifyGlobalChange = React.useCallback(() => {
    onGlobalStateChange?.();
  }, [onGlobalStateChange]);

  React.useEffect(() => {
    return () => {
      // Cleanup all effects when provider unmounts
      effects.forEach((effectId) => {
        console.log(`Cleaning up effect: ${effectId}`);
      });
      onCleanup?.();
    };
  }, [effects, onCleanup]);

  return React.createElement(
    ProductionLifecycleContext.Provider,
    { value: { registerEffect, unregisterEffect, notifyGlobalChange } },
    children,
  );
}

/**
 * Hook for components to register their production lifecycle
 */
export function useProductionLifecycle(componentId: string) {
  const { registerEffect, unregisterEffect, notifyGlobalChange } = React.useContext(
    ProductionLifecycleContext,
  );

  React.useEffect(() => {
    const effectId = `${componentId}-${Date.now()}`;
    const unregister = registerEffect(effectId, () => {
      console.log(`Component ${componentId} effect cleanup`);
    });

    return () => {
      unregister(effectId);
      console.log(`Component ${componentId} unmounted`);
    };
  }, [componentId, registerEffect, unregisterEffect]);

  const trackGlobalChange = React.useCallback(() => {
    notifyGlobalChange();
  }, [notifyGlobalChange]);

  return { trackGlobalChange };
}

/**
 * Global production lifecycle manager instance
 */
export const globalProductionLifecycleManager = createProductionLifecycleManager();

/**
 * Test helper for production component testing
 */
export function testProductionComponent<T extends React.ComponentType<any>>(
  Component: T,
  props: React.ComponentProps<T>,
  testFn: (
    renderResult: ProductionComponentResult<React.ReactElement<typeof Component>>,
  ) => void | Promise<void>,
) {
  const lifecycleManager = createProductionLifecycleManager();

  try {
    const renderResult = lifecycleManager.render(React.createElement(Component, props));

    return testFn(renderResult);
  } finally {
    lifecycleManager.cleanup();
  }
}

/**
 * Test helper for production hook testing
 */
export function testProductionHook<Result, Props>(
  useHook: (props: Props) => Result,
  props: Props,
  testFn: (hookResult: ProductionHookResult<Result, Props>) => void | Promise<void>,
) {
  const lifecycleManager = createProductionLifecycleManager();

  try {
    const hookResult = lifecycleManager.renderHook(useHook, { initialProps: props });

    return testFn(hookResult);
  } finally {
    lifecycleManager.cleanup();
  }
}

/**
 * Utility to verify component cleanup behavior
 */
export function expectComponentCleanup<T extends React.ComponentType<any>>(
  Component: T,
  props: React.ComponentProps<T>,
) {
  const lifecycleManager = createProductionLifecycleManager();

  const renderResult = lifecycleManager.render(React.createElement(Component, props));

  return {
    expectCleanUnmount: () => {
      const unmountResult = renderResult.simulateProductionUnmount();
      expect(unmountResult.success).toBe(true);
      lifecycleManager.cleanup();
    },

    expectNoRemainingGlobals: () => {
      const cleanupResult = renderResult.verifyCleanup();
      expect(cleanupResult.isClean).toBe(true);
      expect(cleanupResult.remainingGlobals).toEqual([]);
      lifecycleManager.cleanup();
    },

    getMetrics: () => renderResult.verifyCleanup().metrics,

    cleanup: () => lifecycleManager.cleanup(),
  };
}
