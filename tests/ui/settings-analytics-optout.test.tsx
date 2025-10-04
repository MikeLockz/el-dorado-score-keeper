import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import type { AnalyticsPreference } from '@/lib/observability/privacy';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
    systemTheme: 'light',
    resolvedTheme: 'light',
  }),
}));

const preferenceState: {
  value: AnalyticsPreference;
  listeners: Set<(next: AnalyticsPreference) => void>;
} = {
  value: 'enabled',
  listeners: new Set(),
};

const setAnalyticsPreferenceMock = vi.fn((next: AnalyticsPreference) => {
  preferenceState.value = next;
  for (const listener of preferenceState.listeners) {
    listener(next);
  }
});

vi.mock('@/lib/observability/privacy', () => ({
  getAnalyticsPreference: () => preferenceState.value,
  setAnalyticsPreference: (pref: AnalyticsPreference) => setAnalyticsPreferenceMock(pref),
  subscribeToAnalyticsPreference: (listener: (pref: AnalyticsPreference) => void) => {
    preferenceState.listeners.add(listener);
    return () => preferenceState.listeners.delete(listener);
  },
}));

import SettingsPage from '@/app/settings/page';

describe('settings analytics opt-out toggle', () => {
  beforeEach(() => {
    preferenceState.value = 'enabled';
    preferenceState.listeners.clear();
    setAnalyticsPreferenceMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the toggle and reflects preference changes', async () => {
    render(<SettingsPage />);
    const toggle = screen.getByLabelText('Enable analytics');
    expect((toggle as HTMLInputElement).checked).toBe(true);

    fireEvent.click(toggle);
    expect(setAnalyticsPreferenceMock).toHaveBeenCalledWith('disabled');
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Analytics are paused for this browser/i)).toBeTruthy();
    expect(screen.getByTestId('analytics-dev-note')).toBeTruthy();

    // Simulate preference being re-enabled externally
    await act(async () => {
      preferenceState.value = 'enabled';
      preferenceState.listeners.forEach((listener) => listener('enabled'));
    });

    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Analytics are enabled/i)).toBeTruthy();
  });
});
