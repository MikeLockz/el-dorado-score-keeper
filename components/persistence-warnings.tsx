'use client';

import React from 'react';

import { useAppState } from '@/components/state-provider';
import { useToast } from '@/components/ui/toast';

const WARNING_DEBOUNCE_MS = 120_000;

type WarningRecord = {
  code: string;
  info?: unknown;
  at: number;
};

type WarningToastConfig = {
  title: string;
  defaultDescription: string;
  variant: 'warning' | 'destructive';
  duration?: number;
  buildDescription?: (warning: WarningRecord) => string;
};

const WARNING_CONFIG: Record<string, WarningToastConfig> = {
  'sp.snapshot.persist.quota_exceeded': {
    title: 'Storage almost full',
    defaultDescription:
      'Single-player progress may stop saving. Free space or clear browser storage, then resume.',
    variant: 'warning',
    duration: 9000,
    buildDescription: (warning) => {
      if (!warning.info || typeof warning.info !== 'object') {
        return (
          'Single-player progress may stop saving. Free space or clear browser storage, then resume.'
        );
      }
      const info = warning.info as Record<string, unknown>;
      const ratioValue = info.usageRatio ?? info.usage_ratio;
      const ratio =
        typeof ratioValue === 'number' && Number.isFinite(ratioValue) ? ratioValue : undefined;
      if (ratio === undefined) {
        return (
          'Single-player progress may stop saving. Free space or clear browser storage, then resume.'
        );
      }
      const percent = Math.min(100, Math.max(0, Number((ratio * 100).toFixed(1))));
      return `Storage is ${percent}% full. Free space or clear browser storage so we can keep saving your game.`;
    },
  },
  'sp.snapshot.persist.repeated_failures': {
    title: 'Single-player saves are failing',
    defaultDescription:
      'We\'ll keep retrying automatically. Keep this tab open and review the persistence troubleshooting guide.',
    variant: 'warning',
    duration: 9000,
  },
};

export function PersistenceWarningBridge() {
  const { warnings } = useAppState();
  const { toast } = useToast();
  const seenRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    if (!warnings.length) return;
    for (const warning of warnings) {
      const config = WARNING_CONFIG[warning.code];
      if (!config) continue;
      const lastAt = seenRef.current.get(warning.code) ?? 0;
      if (warning.at - lastAt < WARNING_DEBOUNCE_MS) continue;
      seenRef.current.set(warning.code, warning.at);
      const description = config.buildDescription
        ? config.buildDescription(warning)
        : config.defaultDescription;
      toast({
        title: config.title,
        description,
        variant: config.variant,
        duration: config.duration,
      });
    }
  }, [warnings, toast]);

  return null;
}

export default PersistenceWarningBridge;
