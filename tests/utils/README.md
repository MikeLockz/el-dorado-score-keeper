# Test Infrastructure Utilities

This directory contains standardized utilities for testing that work with production development patterns rather than fighting against them.

## Overview

The test infrastructure has been designed to handle the reality that production code intentionally sets global variables during development for debugging and feature enhancement. Instead of trying to eliminate these globals, our utilities embrace and properly manage them.

## Core Utilities

### 1. Component Lifecycle Management (`component-lifecycle.ts`)

#### `renderWithFullLifecycle(ui, options?)`

Enhanced render function that ensures proper component unmounting and cleanup.

```typescript
import { renderWithFullLifecycle } from '../utils/component-lifecycle';

const { unmount } = renderWithFullLifecycle(<MyComponent />);
// Component and globals are properly cleaned up when unmount() is called
```

#### `cleanupDevelopmentGlobals()`

Cleans up production development globals (`__START_NEW_GAME__`, `__clientLogTrack__`).

```typescript
import { cleanupDevelopmentGlobals } from '../utils/component-lifecycle';

afterEach(() => {
  cleanupDevelopmentGlobals();
});
```

### 2. Development Globals Management (`development-globals.ts`)

#### `describeWithDevelopmentGlobals(name, fn)`

Enhanced describe wrapper that manages global state throughout test execution.

```typescript
import { describeWithDevelopmentGlobals } from '../utils/development-globals';

describeWithDevelopmentGlobals('My Component', () => {
  // Global state is automatically managed
  it('should work correctly', () => {
    // Test implementation
  });
});
```

### 3. Test Patterns (`test-patterns.ts`)

#### Unit Test Template

```typescript
import { createUnitTestTemplate } from '../utils/test-patterns';

createUnitTestTemplate('My Service', defaultMocks, (mockFactory) => {
  it('should handle operations correctly', () => {
    const service = mockFactory.getMock('service', () => new MyService());
    // Test implementation
  });
});
```

#### Component Test Template

```typescript
import { createComponentTestTemplate } from '../utils/test-patterns';

createComponentTestTemplate('MyComponent', MyComponent, defaultProps, (render) => {
  it('should render correctly', () => {
    const { getByText } = render();
    expect(getByText('Hello')).toBeInTheDocument();
  });
});
```

#### Hook Test Template

```typescript
import { createHookTestTemplate } from '../utils/test-patterns';

createHookTestTemplate('useMyHook', useMyHook, defaultProps, (renderHook) => {
  it('should return expected value', () => {
    const { result } = renderHook();
    expect(result.current.value).toBe('expected');
  });
});
```

### 4. Mock Architecture (`mock-architecture.ts`)

#### `createMockEnvironment()`

Sets up a complete mock environment with production-compatible mocks.

```typescript
import { createMockEnvironment } from '../utils/mock-architecture';

const mocks = createMockEnvironment();

// Use mocks in tests
// mocks.appState, mocks.router, mocks.localStorage, etc.

// Clean up after test
mocks.cleanup();
```

#### `globalMockRegistry`

Central registry for managing mocks with production compatibility.

```typescript
import { globalMockRegistry } from '../utils/mock-architecture';

// Register a mock
const myMock = vi.fn();
globalMockRegistry.registerMock('myMock', myMock, false);

// Reset test mocks (preserves production mocks)
globalMockRegistry.resetTestMocks();
```

### 5. Async Management (`async-management.ts`)

#### `setupAsyncEventManagement()`

Sets up tracking for async operations and event listeners.

```typescript
import { setupAsyncEventManagement } from '../utils/async-management';

const { trackAsync, cleanup, expectClean } = setupAsyncEventManagement();

// Track async operations
trackAsync(someAsyncOperation());

// Verify cleanup
expectClean.expectClean();
cleanup();
```

## Standardized Test Templates

### Unit Tests

```typescript
import { createUnitTestTemplate } from '../utils/test-patterns';

createUnitTestTemplate(
  'UserService',
  {
    apiClient: () => ({ fetch: vi.fn() }),
  },
  (mockFactory) => {
    it('should create user successfully', async () => {
      const apiClient = mockFactory.getMock('apiClient', () => ({
        fetch: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
      }));

      const service = new UserService(apiClient);
      const user = await service.createUser('John');

      expect(user.id).toBe(1);
      expect(apiClient.fetch).toHaveBeenCalledTimes(1);
    });
  },
);
```

### UI Component Tests

```typescript
import { createComponentTestTemplate } from '../utils/test-patterns';

createComponentTestTemplate(
  'UserCard',
  UserCard,
  {
    user: { id: 1, name: 'John' },
    onEdit: vi.fn(),
  },
  (render) => {
    it('should display user information', () => {
      const { getByText } = render();
      expect(getByText('John')).toBeInTheDocument();
    });

    it('should call onEdit when edit button is clicked', () => {
      const props = { user: { id: 1, name: 'John' }, onEdit: vi.fn() };
      const { getByRole } = render(props);

      fireEvent.click(getByRole('button', { name: 'Edit' }));
      expect(props.onEdit).toHaveBeenCalledWith(1);
    });
  },
);
```

### Hook Tests

```typescript
import { createHookTestTemplate } from '../utils/test-patterns';

createHookTestTemplate('useUser', useUser, { userId: 1 }, (renderHook) => {
  it('should return user data', async () => {
    const { result, waitForNextUpdate } = renderHook();

    await waitForNextUpdate();
    expect(result.current.user).toEqual({ id: 1, name: 'John' });
  });

  it('should handle production globals correctly', () => {
    const { hasProductionGlobals, unmount } = renderHook();

    // Test hook behavior
    expect(hasProductionGlobals()).toBe(false);

    unmount(); // Proper cleanup
  });
});
```

### Integration Tests

```typescript
import { createIntegrationTestTemplate } from '../utils/test-patterns';

createIntegrationTestTemplate('User Registration Flow', () => {
  it('should complete full registration flow', async () => {
    // Set up mock environment
    const mocks = createMockEnvironment();

    try {
      // Test the full flow
      const result = await completeRegistration(userData);
      expect(result.success).toBe(true);
    } finally {
      mocks.cleanup();
    }
  });
});
```

## Best Practices

### 1. Always Use Enhanced Cleanup

```typescript
afterEach(() => {
  cleanupDevelopmentGlobals();
});
```

### 2. Use Production-Compatible Mocks

```typescript
// Good: Production compatible
globalMockRegistry.registerMock('fetch', mockFetch, true);

// Avoid: Breaks production features
globalThis.fetch = vi.fn(); // This breaks production debugging
```

### 3. Track Async Operations

```typescript
it('should handle async operations', async () => {
  const { trackAsync, expectClean } = setupAsyncEventManagement();

  const result = await trackAsync(someAsyncOperation());

  expect(result).toBe('expected');
  expectClean.expectClean();
});
```

### 4. Use Standardized Test Templates

```typescript
// Good: Uses template
createComponentTestTemplate('MyComponent', MyComponent, defaultProps, (render) => {
  // Test implementation
});

// Avoid: Manual setup
describe('MyComponent', () => {
  beforeEach(() => {
    // Manual setup code
  });
  // Test implementation
});
```

## Migration Guide

### From Traditional Tests

**Before:**

```typescript
describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work', () => {
    render(<MyComponent />);
    // Test implementation
  });
});
```

**After:**

```typescript
createComponentTestTemplate('MyComponent', MyComponent, defaultProps, (render) => {
  it('should work', () => {
    const { getByText } = render();
    // Test implementation
  });
});
```

### From Manual Mock Setup

**Before:**

```typescript
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

afterEach(() => {
  mockFetch.mockClear();
});
```

**After:**

```typescript
const mocks = createMockEnvironment();
// Use mocks.fetch

afterEach(() => {
  mocks.cleanup();
});
```

## Troubleshooting

### Test Still Fails Due to Global State

1. **Check if you're using enhanced cleanup:**

   ```typescript
   afterEach(() => {
     cleanupDevelopmentGlobals();
   });
   ```

2. **Use the enhanced test templates:**

   ```typescript
   describeWithDevelopmentGlobals('My Test', () => {
     // Test implementation
   });
   ```

3. **Verify production globals are being managed:**
   ```typescript
   const { hasProductionGlobals } = renderHookWithDevelopmentGlobalAwareness(() => useMyHook());
   console.log('Has production globals:', hasProductionGlobals());
   ```

### Async Operations Not Cleaning Up

1. **Track async operations:**

   ```typescript
   const { trackAsync, expectClean } = setupAsyncEventManagement();
   trackAsync(myAsyncOperation());
   expectClean.expectClean();
   ```

2. **Wait for operations:**
   ```typescript
   await waitForAsyncOperations();
   ```

### Event Listeners Not Cleaning Up

1. **Use the event tracker:**

   ```typescript
   const { trackEventListener, cleanup } = setupAsyncEventManagement();
   trackEventListener(element, 'click', handler);
   cleanup();
   ```

2. **Verify cleanup:**
   ```typescript
   const health = asyncManager.getHealthStatus();
   expect(health.trackedListeners).toBe(0);
   ```

## Future Enhancements

1. **Automatic test pattern detection** - Analyze existing tests and suggest template usage
2. **Performance monitoring** - Track test execution times and resource usage
3. **Visual debugging tools** - UI for visualizing global state and async operations
4. **Integration with IDE** - VS Code extension for test pattern suggestions
