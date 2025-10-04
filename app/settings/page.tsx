'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { AnalyticsOptOutSection } from '@/components/settings/analytics-opt-out';

import styles from './page.module.scss';

export default function SettingsPage() {
  const { theme, setTheme, systemTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted
    ? theme === 'system'
      ? (systemTheme ?? resolvedTheme)
      : theme
    : 'system';

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Settings</h1>
      <div className={styles.sectionGroup}>
        <section className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Theme</h2>
            <p className={styles.sectionDescription}>
              Choose how the app looks. When set to System, it follows your device setting.
            </p>
            <div className={styles.buttonGroup}>
              <Button
                type="button"
                variant={current === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                Light
              </Button>
              <Button
                type="button"
                variant={current === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                Dark
              </Button>
              <Button
                type="button"
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('system')}
              >
                System
              </Button>
            </div>
          </div>
        </section>

        <AnalyticsOptOutSection
          classes={{
            section: styles.section,
            title: styles.sectionTitle,
            description: styles.sectionDescription,
            toggle: styles.preferenceToggle,
            input: styles.preferenceToggleInput,
            label: styles.preferenceToggleLabel,
            helper: styles.preferenceHelper,
            devHelper: styles.preferenceHelperDev,
          }}
        />
      </div>
    </div>
  );
}
