import { getBrowserObservabilityProvider } from '@/config/observability-provider';
import { syncOptOut } from '@/lib/observability/vendors/posthog';

export type AnalyticsPreference = 'enabled' | 'disabled';

export const ANALYTICS_OPT_OUT_KEY = 'el-dorado:analytics:opt-out';

type PreferenceListener = (preference: AnalyticsPreference) => void;

const listeners = new Set<PreferenceListener>();

let cachedPreference: AnalyticsPreference | undefined;

const isBrowser = () => typeof window !== 'undefined';

const parsePreference = (value: string | null | undefined): AnalyticsPreference =>
  value === 'disabled' ? 'disabled' : 'enabled';

const readStoredPreference = (): AnalyticsPreference => {
  if (!isBrowser()) return 'enabled';
  try {
    const value = window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY);
    return parsePreference(value);
  } catch {
    return 'enabled';
  }
};

const persistPreference = (preference: AnalyticsPreference) => {
  if (!isBrowser()) return;
  try {
    if (preference === 'disabled') {
      window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, 'disabled');
    } else {
      window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    }
  } catch {
    // Ignored – browsers can throw when storage disabled (Safari private mode, etc.).
  }
};

const notifyListeners = (preference: AnalyticsPreference) => {
  for (const listener of listeners) {
    try {
      listener(preference);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Preference listener failed.', error);
      }
    }
  }
};

const applyVendorPreference = (preference: AnalyticsPreference) => {
  if (!isBrowser()) return;
  try {
    const provider = getBrowserObservabilityProvider();
    if (provider === 'posthog' || provider === 'custom') {
      syncOptOut(preference);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[analytics] Failed to sync analytics preference to vendor.', error);
    }
  }
};

const ensureCachedPreference = (): AnalyticsPreference => {
  if (cachedPreference) return cachedPreference;
  cachedPreference = readStoredPreference();
  applyVendorPreference(cachedPreference);
  return cachedPreference;
};

if (isBrowser()) {
  cachedPreference = readStoredPreference();
  applyVendorPreference(cachedPreference);

  window.addEventListener('storage', (event) => {
    if (event.key !== ANALYTICS_OPT_OUT_KEY) return;
    const next = parsePreference(event.newValue ?? undefined);
    cachedPreference = next;
    applyVendorPreference(next);
    notifyListeners(next);
  });
}

export const getAnalyticsPreference = (): AnalyticsPreference => ensureCachedPreference();

export const syncAnalyticsPreferenceWithVendor = () => {
  const preference = ensureCachedPreference();
  applyVendorPreference(preference);
};

export const setAnalyticsPreference = (preference: AnalyticsPreference) => {
  const normalised = preference === 'disabled' ? 'disabled' : 'enabled';
  cachedPreference = normalised;
  persistPreference(normalised);
  applyVendorPreference(normalised);
  notifyListeners(normalised);
};

export const subscribeToAnalyticsPreference = (listener: PreferenceListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const __resetAnalyticsPreferenceForTests = () => {
  listeners.clear();
  cachedPreference = undefined;
};
