/**
 * Standardized test patterns for development-global-aware testing.
 *
 * This module provides consistent test templates that work with production
 * global state patterns rather than trying to eliminate them entirely.
 */

import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { renderHook, RenderHookOptions, RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import * as React from 'react';
import {
  cleanupDevelopmentGlobals,
  clearTimeoutsAndIntervals,
  captureDevelopmentGlobals,
} from './component-lifecycle';
import { restoreDevelopmentGlobals } from './development-globals';
import { describeWithDevelopmentGlobals } from './development-globals';

/**
 * Mock factory interface for consistent mock management
 */
export interface MockFactory<T = any> {
  getMock: (key: string, factory: () => T) => T;
  resetAll: () => void;
  resetOnlyTestMocks: () => void;
  restoreAll: () => void;
}

/**
 * Creates a development-global-aware mock factory
 */
export function createDevelopmentGlobalAwareMockFactory<T = any>(
  defaults: Partial<T> = {},
): MockFactory<T> {
  const mocks = new Map<string, any>();
  const productionMocks = new Set<string>();

  return {
    getMock: (key: string, factory: () => T) => {
      if (!mocks.has(key)) {
        mocks.set(key, vi.fn(factory()));
      }
      return mocks.get(key)!;
    },

    resetAll: () => {
      mocks.forEach((mock) => {
        if (!productionMocks.has(String(mock))) {
          mock.mockReset();
        }
      });
    },

    resetOnlyTestMocks: () => {
      mocks.forEach((mock, key) => {
        if (!key.startsWith('production-')) {
          mock.mockReset();
        }
      });
    },

    restoreAll: () => {
      mocks.forEach((mock) => {
        if (!productionMocks.has(String(mock))) {
          mock.mockRestore();
        }
      });
      mocks.clear();
    },
  };
}

/**
 * Enhanced render function for React components with full lifecycle management
 */
export function renderWithDevelopmentGlobalAwareness<T extends React.ReactElement>(
  ui: T,
  options?: RenderOptions,
): Omit<RenderResult, 'unmount'> & { unmount: () => void } {
  const result = render(ui, options);

  const enhancedUnmount = () => {
    result.unmount();
    cleanupDevelopmentGlobals();
    clearTimeoutsAndIntervals();
  };

  return { ...result, unmount: enhancedUnmount };
}

/**
 * Enhanced renderHook function for testing React hooks with development global awareness
 */
export function renderHookWithDevelopmentGlobalAwareness<Result, Props>(
  renderCallback: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props>,
): Omit<RenderHookResult<Result, Props>, 'unmount'> & {
  unmount: () => void;
  hasProductionGlobals: () => boolean;
  getProductionGlobals: () => any;
} {
  const { result, rerender, unmount } = renderHook(renderCallback, options);

  const initialGlobals = captureDevelopmentGlobals();

  const enhancedUnmount = () => {
    unmount();
    const finalGlobals = captureDevelopmentGlobals();
    const hookLeftProductionGlobals =
      initialGlobals.__START_NEW_GAME__ !== finalGlobals.__START_NEW_GAME__ ||
      initialGlobals.__clientLogTrack__ !== finalGlobals.__clientLogTrack__;

    if (hookLeftProductionGlobals) {
      console.warn('Hook left production development globals after unmount');
      cleanupDevelopmentGlobals();
    }
  };

  return {
    result,
    rerender,
    unmount: enhancedUnmount,
    hasProductionGlobals: () => {
      const globals = captureDevelopmentGlobals();
      return !!(globals.__START_NEW_GAME__ || globals.__clientLogTrack__);
    },
    getProductionGlobals: () => captureDevelopmentGlobals(),
  };
}

/**
 * Template for unit tests that work with development globals
 */
export function createUnitTestTemplate<T = any>(
  testName: string,
  defaultMocks: Partial<T> = {},
  testFn: (mockFactory: MockFactory<T>) => void,
) {
  return describeWithDevelopmentGlobals(testName, () => {
    let mockFactory: MockFactory<T>;
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
      mockFactory = createDevelopmentGlobalAwareMockFactory(defaultMocks);
      vi.clearAllMocks();
    });

    afterEach(() => {
      mockFactory.resetOnlyTestMocks();
      restoreDevelopmentGlobals(originalGlobals);
      cleanupDevelopmentGlobals();
      clearTimeoutsAndIntervals();
    });

    testFn(mockFactory);
  });
}

/**
 * Template for UI component tests with proper component lifecycle
 */
export function createComponentTestTemplate<T extends React.ComponentType<any>>(
  componentName: string,
  Component: T,
  defaultProps: React.ComponentProps<T>,
  testFn: (
    renderFn: (
      props?: React.ComponentProps<T>,
    ) => Omit<RenderResult, 'unmount'> & { unmount: () => void },
    defaultProps: React.ComponentProps<T>,
  ) => void,
) {
  return describeWithDevelopmentGlobals(`${componentName} Component Tests`, () => {
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
      vi.clearAllMocks();
    });

    afterEach(() => {
      restoreDevelopmentGlobals(originalGlobals);
      cleanupDevelopmentGlobals();
      clearTimeoutsAndIntervals();
    });

    const renderComponent = (props?: Partial<React.ComponentProps<T>>) => {
      return renderWithDevelopmentGlobalAwareness(
        React.createElement(Component, { ...defaultProps, ...props }),
      );
    };

    testFn(renderComponent, defaultProps);
  });
}

/**
 * Template for integration tests with production global patterns
 */
export function createIntegrationTestTemplate(
  testName: string,
  testFn: () => void | Promise<void>,
) {
  return describeWithDevelopmentGlobals(`${testName} Integration`, () => {
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
      vi.clearAllMocks();
    });

    afterEach(() => {
      restoreDevelopmentGlobals(originalGlobals);
      cleanupDevelopmentGlobals();
      clearTimeoutsAndIntervals();
    });

    testFn();
  });
}

/**
 * Template for hook testing with production global awareness
 */
export function createHookTestTemplate<Result, Props>(
  hookName: string,
  useHook: (props: Props) => Result,
  defaultProps: Props,
  testFn: (
    renderHookFn: (props?: Partial<Props>) => Omit<RenderHookResult<Result, Props>, 'unmount'> & {
      unmount: () => void;
      hasProductionGlobals: () => boolean;
      getProductionGlobals: () => any;
    },
  ) => void,
) {
  return describeWithDevelopmentGlobals(`${hookName} Hook Tests`, () => {
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
      vi.clearAllMocks();
    });

    afterEach(() => {
      restoreDevelopmentGlobals(originalGlobals);
      cleanupDevelopmentGlobals();
      clearTimeoutsAndIntervals();
    });

    const renderHookWithDefaults = (props?: Partial<Props>) => {
      return renderHookWithDevelopmentGlobalAwareness(
        (hookProps) => useHook({ ...defaultProps, ...hookProps }),
        { initialProps: { ...defaultProps, ...props } as Props },
      );
    };

    testFn(renderHookWithDefaults);
  });
}

/**
 * Template for testing development features that rely on globals
 */
export function createDevelopmentFeatureTest<T>(
  featureName: string,
  testFn: (globals: { __START_NEW_GAME__?: Function; __clientLogTrack__?: Function }) => T,
) {
  return describe(`Development Feature: ${featureName}`, () => {
    let originalGlobals: ReturnType<typeof captureDevelopmentGlobals>;

    beforeEach(() => {
      originalGlobals = captureDevelopmentGlobals();
    });

    afterEach(() => {
      restoreDevelopmentGlobals(originalGlobals);
    });

    it('should work with development globals', () => {
      const currentGlobals = captureDevelopmentGlobals();
      const result = testFn(currentGlobals);
      expect(result).toBeDefined();
    });

    it('should clean up development globals', () => {
      testFn(captureDevelopmentGlobals());

      const finalGlobals = captureDevelopmentGlobals();
      expect(finalGlobals.__START_NEW_GAME__).toBe(originalGlobals.__START_NEW_GAME__);
      expect(finalGlobals.__clientLogTrack__).toBe(originalGlobals.__clientLogTrack__);
    });
  });
}

/**
 * Test helper that creates a standardized mock context for tests
 */
export function createStandardMockContext(overrides: any = {}) {
  return {
    state: {},
    height: 0,
    ready: true,
    append: vi.fn(async () => 0),
    appendMany: vi.fn(async () => 0),
    isBatchPending: false,
    previewAt: async () => ({}),
    warnings: [],
    clearWarnings: vi.fn(),
    timeTravelHeight: null,
    setTimeTravelHeight: vi.fn(),
    timeTraveling: false,
    ...overrides,
  };
}

/**
 * Test helper that creates a standardized router mock
 */
export function createStandardRouterMock() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}
