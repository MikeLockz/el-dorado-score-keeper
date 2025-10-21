# Browser Test Automation Options for El Dorado Score Keeper

## Prerequisites

- ✅ Playwright already configured (`playwright.smoke.config.ts`)
- ✅ Next.js development environment
- ✅ Basic understanding of your game's flow
- ✅ Access to add `data-testid` attributes to React components

## Current Setup Analysis

Your Next.js game already has:

- **Playwright** configured (`playwright.smoke.config.ts`) with basic smoke tests
- Test script: `npm run test:playwright`
- Screenshot-based visual regression testing

## Game Flow

Based on your requirements, the happy path follows:

- Start new game → Play rounds → View final score

## File Structure for Implementation

```
el-dorado-score-keeper/
├── tests/playwright/
│   ├── smoke.spec.ts                 # ✅ Already exists
│   └── happy-path.spec.ts            # 🆕 To be created
├── playwright.happy-path.config.ts   # 🆕 To be created
├── package.json                      # ✅ Already exists (will add scripts)
└── BROWSER_TEST_AUTOMATION.md        # ✅ This file
```

## Implementation Checklist

### Phase 1: Setup Configuration ⏱️ 15 minutes

- [ ] Create `playwright.happy-path.config.ts`
- [ ] Add npm scripts to `package.json`
- [ ] Verify existing Playwright setup works

### Phase 2: Add Test IDs to Components ⏱️ 30-60 minutes

- [ ] Add test IDs to new game page components
- [ ] Add test IDs to game board elements
- [ ] Add test IDs to player interaction elements
- [ ] Add test IDs to score display components
- [ ] Add test IDs to game completion modal

### Phase 3: Create Happy Path Test ⏱️ 45-90 minutes

- [ ] Create `tests/playwright/happy-path.spec.ts`
- [ ] Implement navigation test
- [ ] Implement game initialization test
- [ ] Implement gameplay interaction loop
- [ ] Implement game completion validation
- [ ] Add score range validation

### Phase 4: Testing & Refinement ⏱️ 30-60 minutes

- [ ] Run initial test and debug issues
- [ ] Adjust timeouts based on game duration
- [ ] Fine-tune element selectors
- [ ] Test in headed mode for debugging
- [ ] Verify CI/CD integration

**Total Estimated Time: 2-4 hours**

## Testing Options Comparison

### Option 1: Playwright End-to-End Tests ⭐ (Recommended)

**Best for:** Most comprehensive testing that closely mimics real user behavior

**Pros:**

- ✅ You already have it configured
- ✅ Tests run in real browsers (Chrome, Firefox, Safari)
- ✅ Can handle complex interactions (drag-and-drop, keyboard shortcuts)
- ✅ Built-in waiting for network requests and animations
- ✅ Excellent debugging tools (trace viewer, screenshots, videos)
- ✅ CI/CD integration ready
- ✅ Great visual regression capabilities

**Cons:**

- Slightly longer setup time for complex flows

**Implementation:**

```typescript
// tests/playwright/happy-path.spec.ts
test('Complete happy path game', async ({ page }) => {
  // 1. Navigate to new game
  await page.goto('/single-player/new');

  // 2. Start new game
  await page.click('[data-testid=start-game-btn]');

  // 3. Play through rounds (simulate typical interactions)
  // 4. Complete game
  // 5. Verify final score
  // 6. Take screenshots for visual regression
});
```

### Option 2: Cypress

**Best for:** Excellent developer experience and interactive testing

**Pros:**

- ✅ Interactive test runner with live preview
- ✅ Time travel debugging
- ✅ Very readable, intuitive API
- ✅ Excellent community and documentation
- ✅ Fast test execution

**Cons:**

- ❌ Would need to add new dependency
- ❌ Different browser support model than Playwright

### Option 3: Puppeteer

**Best for:** Lightweight Chrome automation

**Pros:**

- ✅ Fast and lightweight
- ✅ Fine-grained control over browser behavior
- ✅ Good for headless automation

**Cons:**

- ❌ Chrome-only (no cross-browser testing)
- ❌ Less high-level API than Playwright
- ❌ More manual waiting/handling needed

### Option 4: TestCafe

**Best for:** No WebDriver required, easy setup

**Pros:**

- ✅ Easy setup process
- ✅ Good cross-browser support
- ✅ No extra browser plugins needed

**Cons:**

- ❌ Smaller community
- ❌ Less popular than Playwright/Cypress

## Recommended Implementation: Playwright Happy Path Test

Given your existing setup and the **non-deterministic nature of games**, here's the optimal approach:

### Complete Test Structure with Test IDs

```typescript
// tests/playwright/happy-path.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Game Happy Path', () => {
  test('Complete full game flow', async ({ page }) => {
    // 1. Navigate to new game page
    await page.goto('/single-player/new');
    await expect(page.locator('[data-testid="new-game-page"]')).toBeVisible();
    await expect(page).toHaveScreenshot('new-game-page.png');

    // 2. Start new game
    await page.click('[data-testid="start-game-button"]');
    await page.waitForLoadState('networkidle');

    // 3. Verify game board is loaded
    await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(page.locator('[data-testid="player-hand"]')).toBeVisible();
    await expect(page.locator('[data-testid="score-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="round-indicator"]')).toBeVisible();

    // 4. Play through game rounds (simplified interactions)
    for (let round = 1; round <= 5; round++) {
      // Example: 5 rounds
      // Wait for player's turn
      await expect(page.locator('[data-testid="player-turn-indicator"]')).toBeVisible();

      // Check if player has cards to play
      const cardsAvailable = await page
        .locator('[data-testid="player-hand"] [data-testid="player-card"]')
        .count();

      if (cardsAvailable > 0) {
        // Play first available card
        await page.click('[data-testid="player-hand"] [data-testid="player-card"]:first-child');
        await page.click('[data-testid="play-card-button"]');

        // Wait for AI opponent to respond (if applicable)
        await page.waitForTimeout(1000); // Simple wait for game state update
      }

      // End turn if needed
      const endTurnButton = page.locator('[data-testid="end-turn-button"]');
      if (await endTurnButton.isVisible()) {
        await endTurnButton.click();
      }

      // Verify round progression
      await page.waitForTimeout(2000); // Allow game state to settle
    }

    // 5. Verify game completion
    await expect(page.locator('[data-testid="game-complete-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="final-score-display"]')).toBeVisible();

    // 6. Validate final score range (not exact value)
    const scoreText = await page.locator('[data-testid="final-score-display"]').textContent();
    const finalScore = parseInt(scoreText?.match(/\d+/)?.[0] || '0');
    expect(finalScore).toBeGreaterThan(0);
    expect(finalScore).toBeLessThan(10000); // Reasonable upper bound

    // 7. Take screenshot for manual inspection (not automated comparison)
    await page.screenshot({ path: 'game-completed-sample.png', fullPage: true });

    // 8. Test play again functionality
    await page.click('[data-testid="play-again-button"]');
    await expect(page.locator('[data-testid="new-game-page"]')).toBeVisible();
  });
});
```

### Key Features to Test

1. **Navigation** - Game flow between screens
2. **Game Initialization** - New game setup
3. **Core Interactions** - Clicks, selections, game moves
4. **State Management** - Score updates, turn changes
5. **Game Completion** - Final score display
6. **UI Layout Consistency** - Structural integrity, not pixel-perfect matches

### Testing Strategy for Non-Deterministic Games

**What to Test (Deterministic):**

- ✅ UI layout and component presence
- ✅ Game state transitions (start → playing → complete)
- ✅ Button/interaction availability
- ✅ Navigation flow
- ✅ Error handling
- ✅ Score calculation logic (range validation)

**What NOT to Test (Non-Deterministic):**

- ❌ Exact screenshot comparisons during gameplay
- ❌ Specific card values or positions
- ❌ Exact final scores (unless testing calculation bounds)
- ❌ Specific game outcomes

**Visual Testing Approach:**

- **Layout Screenshots**: Compare only static screens (landing, settings, new game)
- **Component Screenshots**: Test individual UI components in isolation
- **Gameplay Screenshots**: Take for manual inspection, not automated comparison
- **Structure Validation**: Verify elements exist and are positioned correctly

### Enhanced Test Configuration

```typescript
// playwright.happy-path.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  testMatch: '**/happy-path.spec.ts',
  timeout: 180_000, // Longer timeout for game completion
  retries: 1,
  expect: {
    // Less strict screenshot comparison for static pages only
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05, // More tolerance for minor variations
      threshold: 0.2, // Allow more color variations
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100',
    headless: true,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
});
```

### Element Identification Strategy

#### Why Use Test IDs?

- **Reliable**: Won't break when text changes or styling updates
- **Clear intent**: Obvious these are for testing purposes
- **Maintainable**: Easy to find and update test attributes
- **Semantic**: Describe the purpose, not the appearance

#### Recommended Test ID Convention

```tsx
// Use kebab-case for consistency
data-testid="start-game-button"
data-testid="final-score-display"
data-testid="player-hand"
data-testid="game-board"
data-testid="round-indicator"
data-testid="action-buttons"
data-testid="game-complete-modal"
data-testid="play-again-button"
```

#### Adding Test IDs to Components

```tsx
// Example: Update your React components
<button
  data-testid="start-game-button"
  onClick={handleStartGame}
  className="btn-primary"
>
  Start New Game
</button>

<div data-testid="game-board" className="board-container">
  {/* Game board content */}
</div>

<div data-testid="score-display" className="score-area">
  <span data-testid="current-score">{score}</span>
  <span data-testid="round-number">Round {round}</span>
</div>
```

#### Advanced Testing Techniques

**1. State-Based Testing with Test IDs:**

```typescript
// Test game state transitions rather than exact outcomes
await expect(page.locator('[data-testid="game-status"]')).toHaveText('playing');
await expect(page.locator('[data-testid="round-number"]')).toBeVisible();
await expect(page.locator('[data-testid="score-display"]')).toBeVisible();
```

**2. Range Validation with Test IDs:**

```typescript
// Verify score is within reasonable bounds using test ID
const scoreElement = page.locator('[data-testid="final-score-display"]');
const scoreText = await scoreElement.textContent();
const score = parseInt(scoreText || '0');
expect(score).toBeGreaterThan(0);
expect(score).toBeLessThan(10000); // Reasonable upper bound
```

**3. Element Presence Testing with Test IDs:**

```typescript
// Test that game elements exist regardless of their content
await expect(page.locator('[data-testid="player-hand"]')).toBeVisible();
await expect(page.locator('[data-testid="game-board"]')).toBeVisible();
await expect(page.locator('[data-testid="action-buttons"]')).toBeVisible();
```

**4. Interaction Testing with Test IDs:**

```typescript
// Interact with specific game elements
await page.click('[data-testid="start-game-button"]');
await page.click('[data-testid="player-hand-card"]:first-child');
await page.click('[data-testid="play-card-button"]');
await page.click('[data-testid="end-turn-button"]');
```

**5. Complex Selection with Test IDs:**

```typescript
// Select elements within specific containers
const playerHand = page.locator('[data-testid="player-hand"]');
const firstCard = playerHand.locator('[data-testid="player-card"]:first-child');
await firstCard.click();

// Check element count within container
const cardsInHand = await page
  .locator('[data-testid="player-hand"] [data-testid="player-card"]')
  .count();
expect(cardsInHand).toBeGreaterThan(0);
```

### Integration with CI/CD

```json
// package.json scripts
{
  "test:e2e": "playwright test --config=playwright.happy-path.config.ts",
  "test:e2e:headed": "playwright test --config=playwright.happy-path.config.ts --headed",
  "test:e2e:debug": "playwright test --config=playwright.happy-path.config.ts --debug",
  "test:e2e:smoke": "playwright test --config=playwright.smoke.config.ts",
  "test:e2e:all": "npm run test:e2e:smoke && npm run test:e2e"
}
```

## Updated Testing Strategy

### Focus Areas for Non-Deterministic Games

**1. Functional Testing (Priority):**

- Game starts and progresses correctly
- UI elements appear/disappear at appropriate times
- Navigation between game states works
- Game completion flow functions

**2. Visual Testing (Secondary):**

- Static page layouts (landing, settings, new game screens)
- Component structure and positioning
- Responsive behavior
- Theme consistency

**3. State Validation:**

- Score displays update correctly
- Game state indicators are accurate
- Player hand/board interactions work
- Turn management functions

**4. Error Resilience:**

- Game handles invalid moves gracefully
- UI recovers from unexpected states
- Network interruptions don't break game flow

### What This Approach Gives You

✅ **Reliable automated tests** that won't fail due to game randomness
✅ **Visual regression protection** for static UI elements
✅ **Functional verification** of core game mechanics
✅ **Confidence** that game flow works end-to-end
✅ **Maintainable tests** that don't require constant updating
✅ **CI/CD integration** for automated verification

This approach focuses on testing the **structure and behavior** of your game rather than exact visual outcomes, making it robust against the non-deterministic nature of gameplay while still providing comprehensive coverage of your application's functionality.

## Required Test ID Additions

To implement this test, you'll need to add these `data-testid` attributes to your React components:

### Pages & Containers

```tsx
// New game page container
<div data-testid="new-game-page">

// Game board area
<div data-testid="game-board">

// Player hand area
<div data-testid="player-hand">

// Score display area
<div data-testid="score-display">

// Game complete modal
<div data-testid="game-complete-modal">
```

### Interactive Elements

```tsx
// Buttons
<button data-testid="start-game-button">
<button data-testid="play-card-button">
<button data-testid="end-turn-button">
<button data-testid="play-again-button">

// Game cards/cards in hand
<div data-testid="player-card">

// Status indicators
<span data-testid="player-turn-indicator">
<span data-testid="round-indicator">

// Score displays
<span data-testid="final-score-display">
```

## Ready-to-Use Commands

### Test Execution Commands

```bash
# Run happy path tests (headless)
npm run test:e2e

# Run tests with browser window for debugging
npm run test:e2e:headed

# Run tests in debug mode with step-through
npm run test:e2e:debug

# Run both smoke and happy path tests
npm run test:e2e:all

# Run existing smoke tests only
npm run test:e2e:smoke
```

### Development Commands

```bash
# Verify Playwright installation
npx playwright install

# Run specific test file
npx playwright test --config=playwright.happy-path.config.ts tests/playwright/happy-path.spec.ts

# Run tests with trace viewer
npx playwright test --config=playwright.happy-path.config.ts --trace on

# View test reports
npx playwright show-report
```

## Common Pitfalls & Solutions

### ❌ Test IDs Not Found

**Problem:** Tests fail because `data-testid` attributes don't exist
**Solution:** Double-check component names and add missing test IDs

### ❌ Timeouts During Gameplay

**Problem:** Tests timeout waiting for game state changes
**Solution:** Increase timeout in config or add strategic waits

```typescript
// Add explicit waits for game state changes
await page.waitForSelector('[data-testid="player-turn-indicator"]');
await page.waitForTimeout(1000); // Allow animations to complete
```

### ❌ Element Not Visible

**Problem:** Elements exist but aren't interactable
**Solution:** Wait for visibility before interaction

```typescript
await page.waitForSelector('[data-testid="play-card-button"]', { state: 'visible' });
await page.click('[data-testid="play-card-button"]');
```

### ❌ Score Parsing Fails

**Problem:** Score text contains non-numeric characters
**Solution:** Use regex to extract numbers

```typescript
const scoreText = await scoreElement.textContent();
const score = parseInt(scoreText?.match(/\d+/)?.[0] || '0');
```

### ❌ Game Duration Too Long

**Problem:** Tests take too long to complete
**Solution:** Create a simplified test version or mock game mechanics

```typescript
// Option 1: Reduce game rounds for testing
for (let round = 1; round <= 3; round++) { // Instead of 10 rounds

// Option 2: Add test-specific fast mode
await page.click('[data-testid="test-mode-toggle"]');
```

## Game-Specific Customization Guide

### Adapting the Test Template

1. **Adjust Game Loop Logic**

```typescript
// If your game has variable round lengths
while ((await page.locator('[data-testid="game-status"]').textContent()) !== 'Game Complete') {
  // Your game-specific turn logic here
}
```

2. **Custom Score Validation**

```typescript
// If your game has specific score ranges
const finalScore = parseInt(scoreText?.match(/\d+/)?.[0] || '0');
expect(finalScore).toBeBetween(0, 500); // Your game's score range
```

3. **Game-Specific Interactions**

```typescript
// Add your game's unique interactions
await page.click('[data-testid="select-character"]');
await page.click('[data-testid="place-worker"]');
await page.click('[data-testid="draw-cards"]');
```

## Debugging Tips

### Use Headed Mode for Development

```bash
npm run test:e2e:headed
```

### Add Step-Through Debugging

```bash
npm run test:e2e:debug
```

### Take Screenshots for Debugging

```typescript
await page.screenshot({
  path: `debug-step-${step}.png`,
  fullPage: true,
});
```

### Inspect Game State

```typescript
// Log game state to console
const gameState = await page.evaluate(() => {
  return {
    score: document.querySelector('[data-testid="current-score"]')?.textContent,
    round: document.querySelector('[data-testid="round-number"]')?.textContent,
    status: document.querySelector('[data-testid="game-status"]')?.textContent,
  };
});
console.log('Game State:', gameState);
```

## Next Steps

1. **Start with Phase 1** (Setup Configuration) - 15 minutes
2. **Work through the checklist** phase by phase
3. **Use the debugging tips** if you encounter issues
4. **Customize the game loop** based on your specific game mechanics
5. **Run tests regularly** during development to catch regressions

This approach focuses on testing the **structure and behavior** of your game using reliable test ID selectors, making it robust against the non-deterministic nature of gameplay while still providing comprehensive coverage of your application's functionality.
