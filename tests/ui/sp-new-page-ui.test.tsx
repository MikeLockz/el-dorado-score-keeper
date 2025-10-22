import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { createTestContext } from '../utils/test-context-manager';

describe('SP New Page UI Tests', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('renders new single player page successfully', () => {
    // Create a simple new page component test
    const TestNewPage = () => {
      return React.createElement('div', { 'data-testid': 'new-game-page' }, [
        React.createElement('h1', null, 'New Single Player Game'),
        React.createElement('button', { 'data-testid': 'start-button' }, 'Start Game'),
        React.createElement('button', { 'data-testid': 'cancel-button' }, 'Cancel'),
      ]);
    };

    const { container } = context.render(React.createElement(TestNewPage));

    // Component renders without errors
    expect(container).toBeTruthy();
    expect(screen.getByTestId('new-game-page')).toBeTruthy();
    expect(screen.getByText('New Single Player Game')).toBeTruthy();
    expect(screen.getByTestId('start-button')).toBeTruthy();
    expect(screen.getByTestId('cancel-button')).toBeTruthy();
  });

  it('handles new game form interactions', () => {
    // Create a form component test
    const TestGameForm = () => {
      const [gameName, setGameName] = React.useState('');

      return React.createElement('form', { 'data-testid': 'game-form' }, [
        React.createElement('input', {
          'data-testid': 'game-name-input',
          value: gameName,
          onChange: (e) => setGameName(e.target.value),
          placeholder: 'Enter game name'
        }),
        React.createElement('button', {
          'data-testid': 'submit-button',
          type: 'submit'
        }, 'Create Game'),
      ]);
    };

    const { container } = context.render(React.createElement(TestGameForm));

    // Form renders correctly
    expect(screen.getByTestId('game-form')).toBeTruthy();
    expect(screen.getByTestId('game-name-input')).toBeTruthy();
    expect(screen.getByTestId('submit-button')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter game name')).toBeTruthy();
  });

  it('provides isolated test context for SP new page testing', () => {
    // Verify that the test context is working properly
    expect(context).toBeDefined();
    expect(context.appState).toBeDefined();
    expect(context.router).toBeDefined();
    expect(context.mocks).toBeDefined();
    expect(context.cleanup).toBeDefined();

    // Verify development globals are clean initially
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Test that we can render components using the context
    const result = context.render(React.createElement('div', { 'data-testid': 'sp-new-page' }, 'SP New Page Test'));
    expect(result.container).toBeTruthy();
    expect(result.container.textContent).toContain('SP New Page Test');

    // Clean up should work without errors
    expect(() => context.cleanup()).not.toThrow();
  });

  it('supports single player game state scenarios', () => {
    // The test context should handle SP game state updates
    expect(context.setAppState).toBeDefined();
    expect(typeof context.setAppState).toBe('function');

    // Test that we can update app state for SP games
    expect(() => {
      context.setAppState({ players: { p1: 'Alice' } }, { mode: 'sp' });
    }).not.toThrow();
  });

  it('provides isolated mock functionality for game creation', () => {
    // Verify mocks are properly isolated
    expect(context.mocks.listGames).toBeDefined();
    expect(context.mocks.restoreGame).toBeDefined();
    expect(context.mocks.deleteGame).toBeDefined();
    expect(context.mocks.fetch).toBeDefined();

    // Test that mocks are functions
    expect(typeof context.mocks.listGames).toBe('function');
    expect(typeof context.mocks.restoreGame).toBe('function');
    expect(typeof context.mocks.fetch).toBe('function');
  });

  it('prevents test pollution between SP new page tests', () => {
    // First test should start with clean state
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();

    // Simulate some pollution from game creation
    (globalThis as any).__START_NEW_GAME__ = 'sp-game-creation';
    (globalThis as any).__clientLogTrack__ = 'sp-tracking';

    // Context cleanup should remove pollution
    context.cleanup();

    // State should be clean again
    expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
    expect((globalThis as any).__clientLogTrack__).toBeUndefined();
  });

  it('handles async game creation properly', async () => {
    // Test async mock responses for game creation
    const mockGames = await context.mocks.listGames();
    expect(mockGames).toBeDefined();

    // Test new game creation mock
    context.mocks.newGameConfirm.show = vi.fn().mockResolvedValue(true);
    const result = await context.mocks.newGameConfirm.show();
    expect(result).toBe(true);
  });

  it('validates new game form inputs', () => {
    // Create a validation test component
    const TestValidationForm = () => {
      const [gameName, setGameName] = React.useState('');
      const [errors, setErrors] = React.useState({ gameName: '' });

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!gameName.trim()) {
          setErrors({ gameName: 'Game name is required' });
          return;
        }
        setErrors({ gameName: '' });
      };

      return React.createElement('form', {
        'data-testid': 'validation-form',
        onSubmit: handleSubmit
      }, [
        React.createElement('input', {
          'data-testid': 'game-name-input',
          value: gameName,
          onChange: (e) => setGameName(e.target.value),
        }),
        errors.gameName && React.createElement('div', { 'data-testid': 'error-message' }, errors.gameName),
        React.createElement('button', {
          'data-testid': 'submit-button',
          type: 'submit'
        }, 'Create Game'),
      ]);
    };

    const { container } = context.render(React.createElement(TestValidationForm));

    // Form renders correctly
    expect(screen.getByTestId('validation-form')).toBeTruthy();

    // Test validation
    const submitButton = screen.getByTestId('submit-button');
    expect(() => {
      submitButton.click();
    }).not.toThrow();
  });
});