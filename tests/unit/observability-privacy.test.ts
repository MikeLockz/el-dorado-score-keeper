import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncOptOutMock = vi.fn();

vi.mock('@/config/observability-provider', () => ({
  getBrowserObservabilityProvider: () => 'posthog',
}));

vi.mock('@/lib/observability/vendors/posthog', () => ({
  syncOptOut: syncOptOutMock,
}));

const OPT_OUT_KEY = 'el-dorado:analytics:opt-out';

const loadPrivacyModule = async () => import('@/lib/observability/privacy');

const originalWindow = (globalThis as { window?: Window }).window;

describe('analytics preference store', () => {
  beforeEach(() => {
    vi.resetModules();
    syncOptOutMock.mockClear();
    if (!(globalThis as { window?: Window }).window) {
      (globalThis as any).window = globalThis as Window & typeof globalThis;
    }
    const w = (globalThis as any).window as Window & typeof globalThis;
    w.localStorage = (globalThis as any).localStorage;
    const storageListeners = new Set<(event: StorageEvent) => void>();
    w.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'storage') return;
      if (typeof listener === 'function') {
        storageListeners.add(listener as (event: StorageEvent) => void);
      }
    }) as any;
    w.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'storage') return;
      if (typeof listener === 'function') {
        storageListeners.delete(listener as (event: StorageEvent) => void);
      }
    }) as any;
    w.dispatchEvent = ((event: Event) => {
      if (event.type === 'storage') {
        storageListeners.forEach((listener) => listener(event as StorageEvent));
      }
      return true;
    }) as any;
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    if (originalWindow) {
      (globalThis as any).window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  it('defaults to enabled when no preference stored', async () => {
    const privacy = await loadPrivacyModule();
    expect(privacy.getAnalyticsPreference()).toBe('enabled');
    expect(syncOptOutMock).toHaveBeenCalledWith('enabled');
  });

  it('persists toggles and notifies listeners', async () => {
    const privacy = await loadPrivacyModule();
    const listener = vi.fn();
    const unsubscribe = privacy.subscribeToAnalyticsPreference(listener);

    privacy.setAnalyticsPreference('disabled');

    expect(window.localStorage.getItem(OPT_OUT_KEY)).toBe('disabled');
    expect(syncOptOutMock).toHaveBeenLastCalledWith('disabled');
    expect(listener).toHaveBeenCalledWith('disabled');

    privacy.setAnalyticsPreference('enabled');
    expect(window.localStorage.getItem(OPT_OUT_KEY)).toBeNull();
    expect(syncOptOutMock).toHaveBeenLastCalledWith('enabled');
    expect(listener).toHaveBeenLastCalledWith('enabled');

    unsubscribe();
  });

  it('reacts to storage events from other tabs', async () => {
    const privacy = await loadPrivacyModule();
    const listener = vi.fn();
    privacy.subscribeToAnalyticsPreference(listener);

    const event = new Event('storage') as StorageEvent;
    Object.assign(event as unknown as Record<string, unknown>, {
      key: OPT_OUT_KEY,
      newValue: 'disabled',
    });

    window.dispatchEvent(event);

    expect(listener).toHaveBeenCalledWith('disabled');
    expect(syncOptOutMock).toHaveBeenLastCalledWith('disabled');
  });

  it('applies stored preference immediately on load', async () => {
    window.localStorage.setItem(OPT_OUT_KEY, 'disabled');
    const privacy = await loadPrivacyModule();

    expect(privacy.getAnalyticsPreference()).toBe('disabled');
    expect(syncOptOutMock).toHaveBeenLastCalledWith('disabled');
  });
});
