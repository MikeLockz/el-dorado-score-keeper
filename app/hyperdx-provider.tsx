'use client';

import { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import {
  ensureBrowserTelemetry,
  isBrowserTelemetryEnabled,
  captureBrowserException,
  type BrowserTelemetry,
} from '@/lib/observability/browser';

const buildPathKey = (pathname: string, search: string) => {
  if (!search) return pathname;
  return `${pathname}?${search}`;
};

export function HyperDXProvider({ children }: PropsWithChildren) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const search = useMemo(() => searchParams?.toString() ?? '', [searchParams]);

  const initializationRef = useRef<Promise<BrowserTelemetry> | null>(null);
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isBrowserTelemetryEnabled()) {
      lastTrackedPathRef.current = null;
      return;
    }

    if (!initializationRef.current) {
      initializationRef.current = ensureBrowserTelemetry().catch((error) => {
        captureBrowserException(error, { context: 'hyperdx-init' });
        return ensureBrowserTelemetry();
      });
    }

    let cancelled = false;
    const pathKey = buildPathKey(pathname, search);

    initializationRef.current
      ?.then((telemetry) => {
        if (cancelled) return;
        if (!telemetry) return;
        if (lastTrackedPathRef.current === pathKey) return;
        lastTrackedPathRef.current = pathKey;
        telemetry.track('page.viewed', {
          path: pathKey,
          pathname,
          search,
          title: typeof document !== 'undefined' ? document.title : undefined,
          referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        });
      })
      .catch((error) => {
        captureBrowserException(error, { context: 'hyperdx-pageview' });
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  return <>{children}</>;
}
