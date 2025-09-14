'use client';

export function logEvent(type: string, extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const body = {
      type,
      path: location.pathname + location.search,
      ua: navigator.userAgent,
      ts: Date.now(),
      ...(extra || {}),
    } as const;
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon('/api/log', blob);
      return;
    }
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Best effort non-blocking for page transitions
      keepalive: true,
    });
  } catch {
    // Swallow logging errors; never block navigation/UI
  }
}

