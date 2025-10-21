/**
 * Development Feature Testing Support
 *
 * This module provides utilities for testing development-specific features
 * that rely on global state and debugging capabilities, ensuring these
 * features work correctly in tests while maintaining proper isolation.
 */

import { vi } from 'vitest';
import * as React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { renderHook, RenderHookResult } from '@testing-library/react';
import { captureDevelopmentGlobals, cleanupDevelopmentGlobals } from './component-lifecycle';
import { restoreDevelopmentGlobals } from './development-globals';
import { createProductionLifecycleManager } from './production-lifecycle';

/**
 * Development feature interface
 */
export interface DevelopmentFeature {
  name: string;
  globalKey: string;
  defaultValue?: any;
  validator?: (value: any) => boolean;
  cleanup?: (value: any) => void;
}

/**
 * Development feature test result
 */
export interface DevelopmentFeatureTestResult {
  feature: DevelopmentFeature;
  isAvailable: boolean;
  value: any;
  worksCorrectly: boolean;
  cleanupSuccessful: boolean;
  warnings: string[];
}

/**
 * Development feature testing environment
 */
export interface DevelopmentFeatureTestEnvironment {
  registerFeature: (feature: DevelopmentFeature) => void;
  enableFeature: (featureName: string, value?: any) => void;
  disableFeature: (featureName: string) => void;
  testFeature: (
    featureName: string,
    testFn: (feature: any) => void | Promise<void>,
  ) => Promise<void>;
  verifyAllFeatures: () => DevelopmentFeatureTestResult[];
  cleanup: () => void;
}

/**
 * Creates a development feature testing environment
 */
export function createDevelopmentFeatureTestEnvironment(): DevelopmentFeatureTestEnvironment {
  const features = new Map<string, DevelopmentFeature>();
  const lifecycleManager = createProductionLifecycleManager();
  let originalGlobals = captureDevelopmentGlobals();

  const registerFeature = (feature: DevelopmentFeature) => {
    features.set(feature.name, feature);
  };

  const enableFeature = (featureName: string, value?: any) => {
    const feature = features.get(featureName);
    if (!feature) {
      throw new Error(`Unknown development feature: ${featureName}`);
    }

    const finalValue = value !== undefined ? value : feature.defaultValue;
    if (feature.validator && !feature.validator(finalValue)) {
      throw new Error(`Invalid value for feature ${featureName}: ${finalValue}`);
    }

    (globalThis as any)[feature.globalKey] = finalValue;
  };

  const disableFeature = (featureName: string) => {
    const feature = features.get(featureName);
    if (!feature) {
      throw new Error(`Unknown development feature: ${featureName}`);
    }

    const currentValue = (globalThis as any)[feature.globalKey];
    if (feature.cleanup) {
      feature.cleanup(currentValue);
    }

    delete (globalThis as any)[feature.globalKey];
  };

  const testFeature = async (
    featureName: string,
    testFn: (feature: any) => void | Promise<void>,
  ) => {
    const feature = features.get(featureName);
    if (!feature) {
      throw new Error(`Unknown development feature: ${featureName}`);
    }

    const originalValue = (globalThis as any)[feature.globalKey];
    const testValue = feature.defaultValue || createDefaultValue(feature);

    try {
      // Enable the feature for testing
      enableFeature(featureName, testValue);

      // Run the test
      await testFn(testValue);
    } finally {
      // Clean up
      if (originalValue !== undefined) {
        (globalThis as any)[feature.globalKey] = originalValue;
      } else {
        disableFeature(featureName);
      }
    }
  };

  const verifyAllFeatures = (): DevelopmentFeatureTestResult[] => {
    const results: DevelopmentFeatureTestResult[] = [];

    features.forEach((feature) => {
      const originalValue = (globalThis as any)[feature.globalKey];
      const warnings: string[] = [];

      try {
        // Test availability
        const isAvailable = (globalThis as any)[feature.globalKey] !== undefined;

        // Test functionality
        const testValue = feature.defaultValue || createDefaultValue(feature);
        enableFeature(feature.name, testValue);
        const currentValue = (globalThis as any)[feature.globalKey];
        const worksCorrectly =
          currentValue === testValue && (!feature.validator || feature.validator(currentValue));

        // Test cleanup
        disableFeature(feature.name);
        const cleanupSuccessful = (globalThis as any)[feature.globalKey] === undefined;

        // Restore original value
        if (originalValue !== undefined) {
          (globalThis as any)[feature.globalKey] = originalValue;
        }

        results.push({
          feature,
          isAvailable,
          value: currentValue,
          worksCorrectly,
          cleanupSuccessful,
          warnings,
        });
      } catch (error) {
        warnings.push(`Error testing feature: ${error}`);

        // Ensure cleanup even on error
        if (originalValue !== undefined) {
          (globalThis as any)[feature.globalKey] = originalValue;
        } else {
          delete (globalThis as any)[feature.globalKey];
        }

        results.push({
          feature,
          isAvailable: false,
          value: undefined,
          worksCorrectly: false,
          cleanupSuccessful: false,
          warnings,
        });
      }
    });

    return results;
  };

  const cleanup = () => {
    // Clean up all features
    features.forEach((feature) => {
      const currentValue = (globalThis as any)[feature.globalKey];
      if (feature.cleanup && currentValue) {
        feature.cleanup(currentValue);
      }
      delete (globalThis as any)[feature.globalKey];
    });

    lifecycleManager.cleanup();
    cleanupDevelopmentGlobals();
    restoreDevelopmentGlobals(originalGlobals);
  };

  return {
    registerFeature,
    enableFeature,
    disableFeature,
    testFeature,
    verifyAllFeatures,
    cleanup,
  };
}

/**
 * Creates a default value for a development feature
 */
function createDefaultValue(feature: DevelopmentFeature): any {
  switch (feature.name) {
    case 'startNewGame':
      return vi.fn().mockResolvedValue(true);
    case 'clientLogTrack':
      return vi.fn();
    case 'devTools':
      return { enabled: true, actions: [] };
    case 'debugMode':
      return true;
    default:
      return null;
  }
}

/**
 * Known development features
 */
export const KNOWN_DEVELOPMENT_FEATURES: DevelopmentFeature[] = [
  {
    name: 'startNewGame',
    globalKey: '__START_NEW_GAME__',
    defaultValue: vi.fn().mockResolvedValue(true),
    validator: (value) => typeof value === 'function',
    cleanup: (value) => {
      if (value && typeof value.mockClear === 'function') {
        value.mockClear();
      }
    },
  },
  {
    name: 'clientLogTrack',
    globalKey: '__clientLogTrack__',
    defaultValue: vi.fn(),
    validator: (value) => typeof value === 'function',
    cleanup: (value) => {
      if (value && typeof value.mockClear === 'function') {
        value.mockClear();
      }
    },
  },
];

/**
 * React component wrapper for development feature testing
 */
interface DevelopmentFeatureWrapperProps {
  children: React.ReactNode;
  features?: Record<string, any>;
  onFeatureChange?: (featureName: string, value: any) => void;
}

function DevelopmentFeatureWrapper({
  children,
  features = {},
  onFeatureChange,
}: DevelopmentFeatureWrapperProps) {
  // Set up features on mount
  React.useEffect(() => {
    Object.entries(features).forEach(([name, value]) => {
      const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
      if (feature) {
        (globalThis as any)[feature.globalKey] = value;
        onFeatureChange?.(name, value);
      }
    });

    return () => {
      // Clean up features on unmount
      Object.keys(features).forEach((name) => {
        const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
        if (feature) {
          delete (globalThis as any)[feature.globalKey];
        }
      });
    };
  }, [features, onFeatureChange]);

  return React.createElement(React.Fragment, null, children);
}

/**
 * Hook for working with development features
 */
export function useDevelopmentFeature(featureName: string) {
  const [isAvailable, setIsAvailable] = React.useState(false);
  const [value, setValue] = React.useState<any>();

  React.useEffect(() => {
    const checkFeature = () => {
      const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === featureName);
      if (feature) {
        const globalValue = (globalThis as any)[feature.globalKey];
        setIsAvailable(globalValue !== undefined);
        setValue(globalValue);
      }
    };

    checkFeature();

    // Set up interval to check for changes
    const interval = setInterval(checkFeature, 100);
    return () => clearInterval(interval);
  }, [featureName]);

  const setFeatureValue = React.useCallback(
    (newValue: any) => {
      const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === featureName);
      if (feature) {
        if (newValue !== undefined) {
          (globalThis as any)[feature.globalKey] = newValue;
        } else {
          delete (globalThis as any)[feature.globalKey];
        }
        setValue(newValue);
      }
    },
    [featureName],
  );

  return { isAvailable, value, setFeatureValue };
}

/**
 * Test helper for development feature testing
 */
export function testDevelopmentFeature(
  featureName: string,
  testFn: (feature: any) => void | Promise<void>,
) {
  const environment = createDevelopmentFeatureTestEnvironment();

  // Register known features
  KNOWN_DEVELOPMENT_FEATURES.forEach((feature) => {
    environment.registerFeature(feature);
  });

  try {
    return environment.testFeature(featureName, testFn);
  } finally {
    environment.cleanup();
  }
}

/**
 * Test helper for component with development features
 */
export function testComponentWithDevelopmentFeatures<T extends React.ComponentType<any>>(
  Component: T,
  props: React.ComponentProps<T>,
  features: Record<string, any>,
  testFn: (
    renderResult: RenderResult,
    featureHelpers: {
      getFeature: (name: string) => any;
      setFeature: (name: string, value: any) => void;
      hasFeature: (name: string) => boolean;
    },
  ) => void | Promise<void>,
) {
  const environment = createDevelopmentFeatureTestEnvironment();

  // Register known features
  KNOWN_DEVELOPMENT_FEATURES.forEach((feature) => {
    environment.registerFeature(feature);
  });

  try {
    const renderResult = render(
      React.createElement(
        DevelopmentFeatureWrapper,
        { features },
        React.createElement(Component, props),
      ),
    );

    const featureHelpers = {
      getFeature: (name: string) => {
        const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
        return feature ? (globalThis as any)[feature.globalKey] : undefined;
      },
      setFeature: (name: string, value: any) => {
        environment.enableFeature(name, value);
      },
      hasFeature: (name: string) => {
        const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
        return feature ? (globalThis as any)[feature.globalKey] !== undefined : false;
      },
    };

    return testFn(renderResult, featureHelpers);
  } finally {
    environment.cleanup();
  }
}

/**
 * Test helper for hook with development features
 */
export function testHookWithDevelopmentFeatures<Result, Props>(
  useHook: (props: Props) => Result,
  initialProps: Props,
  features: Record<string, any>,
  testFn: (
    hookResult: RenderHookResult<Result, Props>,
    featureHelpers: {
      getFeature: (name: string) => any;
      setFeature: (name: string, value: any) => void;
      hasFeature: (name: string) => boolean;
    },
  ) => void | Promise<void>,
) {
  const environment = createDevelopmentFeatureTestEnvironment();

  // Register known features
  KNOWN_DEVELOPMENT_FEATURES.forEach((feature) => {
    environment.registerFeature(feature);
  });

  try {
    const hookResult = renderHook(
      (props) => {
        // Enable features in hook context
        Object.entries(features).forEach(([name, value]) => {
          environment.enableFeature(name, value);
        });

        return useHook(props);
      },
      { initialProps },
    );

    const featureHelpers = {
      getFeature: (name: string) => {
        const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
        return feature ? (globalThis as any)[feature.globalKey] : undefined;
      },
      setFeature: (name: string, value: any) => {
        environment.enableFeature(name, value);
        // Trigger rerender to pick up the change
        hookResult.rerender();
      },
      hasFeature: (name: string) => {
        const feature = KNOWN_DEVELOPMENT_FEATURES.find((f) => f.name === name);
        return feature ? (globalThis as any)[feature.globalKey] !== undefined : false;
      },
    };

    return testFn(hookResult, featureHelpers);
  } finally {
    environment.cleanup();
  }
}

/**
 * Global development feature testing environment
 */
export const globalDevelopmentFeatureEnvironment = createDevelopmentFeatureTestEnvironment();

/**
 * Initialize global development features
 */
globalDevelopmentFeatureEnvironment.registerFeature(...KNOWN_DEVELOPMENT_FEATURES);
