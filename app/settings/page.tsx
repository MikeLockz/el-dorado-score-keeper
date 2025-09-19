'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

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
    <div className="mx-auto max-w-4xl px-3 py-6">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground mb-2">Theme</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Choose how the app looks. When set to System, it follows your device setting.
          </p>
          <div className="inline-flex items-center gap-2">
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
    </div>
  );
}
