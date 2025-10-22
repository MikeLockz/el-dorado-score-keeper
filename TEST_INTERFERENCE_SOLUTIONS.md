# Fixing Test Interference from Global State Pollution

## 🎯 **Overview**

Your test suite has **global state pollution** issues where tests are interfering with each other. This happens when tests share mutable global state and don't properly clean up after themselves, causing flaky and unreliable test results.

## 🔍 **Root Cause Analysis**

### **Sources of Global State Pollution**

#### **1. Global Mock References**

```typescript
// In tests/setup/jsdom.ts
const appStateRef: { current: MockAppState | null } = { current: null };
const routerRef: { current: RouterStub } = { current: createRouter() };
const paramsRef: { current: ParamsRecord } = { current: {} };
```

**Problem:** These global references persist between tests and can be modified by one test, affecting subsequent tests.

#### **2. Global Development Globals**

```typescript
// Production globals set by components
(globalThis as any).__START_NEW_GAME__(globalThis as any).__clientLogTrack__;
```

**Problem:** Components set these globals during testing but they're not properly cleaned up.

#### **3. Mock Implementation Persistence**

```typescript
let listGamesMockImpl: ListGamesFn;
let restoreGameMockImpl: RestoreGameFn;
let deleteGameMockImpl: DeleteGameFn;
let newGameConfirmMock: NewGameConfirmMock;
```

**Problem:** Mock implementations persist across test runs and aren't properly reset.

#### **4. DOM Event Listeners**

The Phase 4 integration test detected many uncleared event listeners:

```
Event listeners not cleaned up: click, mousedown, mouseup, keydown, etc.
```

**Problem:** React components aren't being properly unmounted, leaving behind event listeners.

#### **5. Browser API Mocks**

```typescript
const originalFetch = (globalThis as any).fetch;
const fetchMock = vi.fn(async () => ({...}));
(globalThis as any).fetch = fetchMock;
```

**Problem:** Global browser API mocks persist between tests.

## 🛠️ **Comprehensive Solution Strategy**

### **Phase 1: Enhanced Test Isolation Infrastructure**

#### **1. Create Test Context Manager**

```typescript
// tests/utils/test-context-manager.ts
export interface TestContext {
  appState: MockAppState;
  router: RouterStub;
  params: ParamsRecord;
  mocks: {
    listGames: ListGamesFn;
    restoreGame: RestoreGameFn;
    deleteGame: DeleteGameFn;
    newGameConfirm: NewGameConfirmMock;
    fetch: ReturnType<typeof vi.fn>;
  };
  cleanup: () => void;
}

export function createTestContext(overrides?: Partial<TestContext>): TestContext {
  // Create isolated test context
}

export function withTestContext<T>(testFn: (context: TestContext) => T): T {
  // Run test with proper isolation and cleanup
}
```

#### **2. Global State Reset Utilities**

```typescript
// tests/utils/global-state-reset.ts
export function resetGlobalState() {
  // Reset all global refs to clean state
  appStateRef.current = createDefaultAppState();
  routerRef.current = createRouter();
  paramsRef.current = {};

  // Reset all mocks
  resetAllMocks();

  // Clear development globals
  cleanupDevelopmentGlobals();

  // Clear DOM
  document.body.innerHTML = '';

  // Clear timers
  vi.clearAllTimers();
}

export function resetMockImplementations() {
  listGamesMockImpl = vi.fn(async () => []);
  restoreGameMockImpl = vi.fn(async () => undefined);
  deleteGameMockImpl = vi.fn(async () => undefined);
  newGameConfirmMock = { show: async () => true };
  fetchMock.mockClear();
}
```

#### **3. Enhanced Component Cleanup**

```typescript
// tests/utils/component-cleanup.ts
export function cleanupComponent(renderResult: RenderResult) {
  // Enhanced unmounting with proper cleanup
  renderResult.unmount();

  // Wait for React cleanup cycles
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Clean up development globals
  cleanupDevelopmentGlobals();

  // Clean up any remaining event listeners
  cleanupEventListeners();

  // Clear any pending async operations
  clearTimeoutsAndIntervals();
}

function cleanupEventListeners() {
  // Detect and remove orphaned event listeners
  const elements = document.querySelectorAll('*');
  elements.forEach((element) => {
    // Remove all event listeners (this is a simplified approach)
    const newElement = element.cloneNode(true);
    element.parentNode?.replaceChild(newElement, element);
  });
}
```

### **Phase 2: Test Pattern Improvements**

#### **1. Standardized Test Pattern**

```typescript
// Replace existing pattern:
beforeEach(() => {
  // setup
});
afterEach(() => {
  // cleanup
});

// With new pattern:
describe('Feature', () => {
  let testContext: TestContext;

  beforeEach(() => {
    testContext = createTestContext();
  });

  afterEach(() => {
    testContext.cleanup();
  });

  it('should work correctly', () => {
    // Use testContext.appState, testContext.router, etc.
  });
});
```

#### **2. Isolated Mock Management**

```typescript
// Instead of global mock assignments:
const setMockAppState = (globalThis as any).__setMockAppState;

// Use context-based mocks:
const testContext = createTestContext({
  appState: customAppState,
  mocks: {
    listGames: vi.fn(async () => mockGames),
    // ...
  },
});
```

#### **3. Enhanced Assertion Helpers**

```typescript
// tests/utils/assertion-helpers.ts
export function expectDevelopmentGlobalsClean() {
  expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
  expect((globalThis as any).__clientLogTrack__).toBeUndefined();
}

export function expectEventListenersClean() {
  // Check that no orphaned event listeners exist
  // Implementation depends on your event listener tracking
}

export function expectGlobalStateReset() {
  expectDevelopmentGlobalsClean();
  expectEventListenersClean();
  expect(document.body.innerHTML).toBe('');
}
```

### **Phase 3: Specific Test File Fixes**

#### **1. Phase 4 Production Integration Test**

**Issues:** Event listener pollution, lifecycle management

**Solution:**

```typescript
// tests/integration/phase-4-production-integration.test.tsx
describe('Phase 4: Production Integration Tests', () => {
  let testContext: TestContext;

  beforeEach(() => {
    testContext = createTestContext();
    // Additional setup for production testing
  });

  afterEach(() => {
    testContext.cleanup();
    // Additional production-specific cleanup
    expectGlobalStateReset();
  });

  it('should properly manage production component lifecycle', async () => {
    // Test with proper isolation
    const { render, unmount } = testContext;

    const component = render(<ProductionComponent />);
    // ... test logic

    unmount(component);

    // Verify cleanup
    expectGlobalStateReset();
  });
});
```

#### **2. Games Page UI Test**

**Issues:** Mock function call tracking, global state interference

**Solution:**

```typescript
// tests/ui/games-page-ui.test.tsx
describe('Games page new game flow', () => {
  let testContext: TestContext;

  beforeEach(() => {
    testContext = createTestContext({
      mocks: {
        listGames: vi.fn(async () => mockGames),
        deleteGame: vi.fn(async () => {}),
        // ... other specific mocks
      }
    });
  });

  afterEach(() => {
    testContext.cleanup();
  });

  it('confirms before starting a new game and navigates on success', async () => {
    const { render, mocks } = testContext;

    render(<GamesPage />);

    // Act
    await userEvent.click(screen.getByText('New Game'));
    await userEvent.click(screen.getByText('Confirm'));

    // Assert with context-specific mocks
    expect(mocks.listGames).toHaveBeenCalled();
    // ... other assertions
  });
});
```

#### **3. Player Statistics Tests**

**Issues:** Multiple element selection, DOM pollution

**Solution:**

```typescript
// tests/unit/components/player-statistics/advanced-insights-panel.test.tsx
describe('AdvancedInsightsPanel Component Tests', () => {
  let testContext: TestContext;

  beforeEach(() => {
    testContext = createTestContext();
    // Create unique container for each test
    const container = document.createElement('div');
    container.setAttribute('data-testid', 'test-container');
    document.body.appendChild(container);
  });

  afterEach(() => {
    testContext.cleanup();
    // Clean up test container
    document.body.innerHTML = '';
  });

  it('renders advanced metrics with formatted values', () => {
    const { render } = testContext;

    render(
      <AdvancedInsightsPanel
        metrics={mockMetrics}
        container="[data-testid='test-container']"
      />
    );

    // Use specific selectors to avoid multiple matches
    expect(screen.getByTestId('test-container').querySelectorAll('[data-metric="3"]')).toHaveLength(1);
  });
});
```

### **Phase 4: Infrastructure Improvements**

#### **1. Enhanced jsdom Setup**

```typescript
// tests/setup/jsdom.ts (enhanced)
beforeEach(() => {
  // Reset global state
  resetGlobalState();

  // Clean DOM
  document.body.innerHTML = '';

  // Reset development globals
  cleanupDevelopmentGlobals();

  // Clear all timers and intervals
  vi.clearAllTimers();

  // Reset fetch mock
  fetchMock.mockClear();
});

afterEach(() => {
  // Additional cleanup
  expectGlobalStateReset();
});
```

#### **2. Parallel Test Support**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Enable test isolation
    isolate: true,

    // Run tests in separate threads
    threads: true,

    // Max workers for parallel execution
    maxWorkers: 4,

    // Test timeout
    testTimeout: 10000,

    // Hook timeout
    hookTimeout: 5000,
  },
});
```

#### **3. Global State Monitoring**

```typescript
// tests/utils/global-state-monitor.ts
export function createGlobalStateMonitor() {
  const snapshots: string[] = [];

  return {
    captureSnapshot() {
      snapshots.push(
        JSON.stringify({
          appState: appStateRef.current,
          router: routerRef.current,
          params: paramsRef.current,
          developmentGlobals: {
            __START_NEW_GAME__: (globalThis as any).__START_NEW_GAME__,
            __clientLogTrack__: (globalThis as any).__clientLogTrack__,
          },
          domContent: document.body.innerHTML,
        }),
      );
    },

    verifyNoLeaks() {
      if (snapshots.length > 1) {
        console.warn('Global state leaked between tests:', {
          before: snapshots[0],
          after: snapshots[snapshots.length - 1],
        });
      }
    },
  };
}
```

## 🚀 **Implementation Roadmap**

### **Week 1: Foundation**

1. **Create test context manager** (`tests/utils/test-context-manager.ts`)
2. **Implement global state reset utilities** (`tests/utils/global-state-reset.ts`)
3. **Add enhanced component cleanup** (`tests/utils/component-cleanup.ts`)

### **Week 2: Infrastructure**

1. **Update jsdom setup** with enhanced isolation
2. **Create assertion helpers** for state verification
3. **Add global state monitoring** for debugging

### **Week 3: Test Migration**

1. **Fix Phase 4 integration test** with proper isolation
2. **Fix games-page-ui test** with context-based approach
3. **Fix player statistics tests** with unique containers

### **Week 4: Validation**

1. **Run all tests in isolation** to verify fixes
2. **Run tests in parallel** to ensure no interference
3. **Add CI monitoring** for test flakiness
4. **Re-enable all disabled tests**

## 📊 **Success Metrics**

### **Before Fix:**

- ❌ 6 failed test files out of 157
- ❌ Test interference between files
- ❌ Flaky test results
- ❌ Global state pollution

### **After Fix:**

- ✅ 0 failed test files
- ✅ Complete test isolation
- ✅ Deterministic test results
- ✅ Clean global state management

## 🔧 **Quick Wins (Implement Today)**

1. **Add afterEach cleanup to all failing tests:**

```typescript
afterEach(() => {
  cleanupDevelopmentGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});
```

2. **Reset global mocks in beforeEach:**

```typescript
beforeEach(() => {
  resetGlobalState();
  resetMockImplementations();
});
```

3. **Add state verification in afterEach:**

```typescript
afterEach(() => {
  expectDevelopmentGlobalsClean();
  expect(document.body.innerHTML).toBe('');
});
```

## 🎯 **Immediate Actions**

1. **Start with Phase 1** - Create the isolation infrastructure
2. **Fix the easiest test first** - Start with player statistics tests
3. **Gradually re-enable tests** - One at a time to verify fixes
4. **Monitor for flakiness** - Watch for re-emerging interference

This comprehensive approach will eliminate test interference and give you a reliable, deterministic test suite that can run safely in parallel.
