'use client';

import { type ChangeEvent, useCallback, useMemo, useSyncExternalStore } from 'react';

import {
  getAnalyticsPreference,
  setAnalyticsPreference,
  subscribeToAnalyticsPreference,
  type AnalyticsPreference,
} from '@/lib/observability/privacy';

const STORAGE_SCOPE_DESCRIPTION =
  'The preference is saved to this browser only and can be changed at any time.';

const getServerSnapshot = (): AnalyticsPreference => 'enabled';

type AnalyticsOptOutSectionClasses = {
  section?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  toggle?: string | undefined;
  input?: string | undefined;
  label?: string | undefined;
  helper?: string | undefined;
  devHelper?: string | undefined;
};

type AnalyticsOptOutSectionProps = {
  classes?: AnalyticsOptOutSectionClasses;
};

export function AnalyticsOptOutSection({ classes }: AnalyticsOptOutSectionProps) {
  const preference = useSyncExternalStore(
    subscribeToAnalyticsPreference,
    getAnalyticsPreference,
    getServerSnapshot,
  );

  const checked = preference === 'enabled';

  const statusMessage = useMemo(
    () => (checked ? 'Analytics are enabled.' : 'Analytics are paused for this browser.'),
    [checked],
  );

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextPreference: AnalyticsPreference = event.target.checked ? 'enabled' : 'disabled';
    setAnalyticsPreference(nextPreference);
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[analytics] preference set to ${nextPreference}`);
    }
  }, []);

  return (
    <section className={classes?.section} aria-labelledby="analytics-preference-heading">
      <div>
        <h2 id="analytics-preference-heading" className={classes?.title}>
          Analytics
        </h2>
        <p className={classes?.description}>
          Control gameplay telemetry. Toggle to stop page views and event capture from being sent to
          analytics services for this browser.
        </p>
      </div>

      <label className={classes?.toggle} htmlFor="analytics-opt-out-toggle">
        <input
          id="analytics-opt-out-toggle"
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          className={classes?.input}
        />
        <span className={classes?.label}>Enable analytics</span>
      </label>

      <p className={classes?.helper} role="status" aria-live="polite">
        {statusMessage}
        <br />
        {STORAGE_SCOPE_DESCRIPTION}
      </p>
      {process.env.NODE_ENV !== 'production' && !checked ? (
        <p className={classes?.devHelper} data-testid="analytics-dev-note">
          Analytics events are suppressed. Refreshing keeps this opt-out until you re-enable it.
        </p>
      ) : null}
    </section>
  );
}

export default AnalyticsOptOutSection;
