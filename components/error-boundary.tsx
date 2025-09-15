'use client';
import React from 'react';

declare global {
  interface Window {
    analyticsAuthToken?: string;
  }
}

type ErrorInfo = {
  componentStack?: string;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((args: { error: Error; reset: () => void }) => React.ReactNode);
  onError?: (error: Error, info: ErrorInfo & { errorId: string }) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null, errorId: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    const errorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.setState({ errorId });
    try {
      const infoArg = info?.componentStack
        ? ({ componentStack: info.componentStack, errorId } as const)
        : ({ errorId } as const);
      this.props.onError?.(error, infoArg as ErrorInfo & { errorId: string });
    } catch {}
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
    try {
      this.props.onReset?.();
    } catch {}
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return (fallback as (args: { error: Error; reset: () => void }) => React.ReactNode)({
          error: this.state.error,
          reset: this.reset,
        });
      }
      if (fallback) return fallback;
      const isProd = process.env.NODE_ENV === 'production';
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background, #0b1220)',
            color: 'var(--foreground, #e5e7eb)',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 640,
              width: '100%',
              background: 'rgba(31,41,55,0.6)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
            {!isProd && (
              <pre
                style={{
                  marginTop: 12,
                  whiteSpace: 'pre-wrap',
                  overflow: 'auto',
                  background: 'rgba(0,0,0,0.2)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                {String(this.state.error?.message || this.state.error)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={this.reset}
                style={{
                  padding: '8px 12px',
                  background: '#0ea5e9',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Try again
              </button>
              <button
                onClick={() => {
                  try {
                    // Force a full reload to recover from persistent issues
                    window.location.reload();
                  } catch {}
                }}
                style={{
                  padding: '8px 12px',
                  background: '#334155',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lightweight client logger that posts to a debug endpoint and console
async function logClientError(payload: {
  errorId: string;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  path?: string | undefined;
  ua?: string | undefined;
}) {
  try {
    // Always mirror to console for local visibility
    console.error('[ui error]', payload);
  } catch {}
  try {
    // Scope: prefer Worker or no-op only for Single Player route; otherwise use default /api/log
    const worker = process.env.NEXT_PUBLIC_ANALYTICS_WORKER_URL;
    const bp = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const curPath = payload.path || (typeof window !== 'undefined' ? window.location.pathname : '');
    const isSinglePlayer =
      !!curPath &&
      (curPath === `${bp}/single-player/` || curPath.startsWith(`${bp}/single-player/`));
    const isGhPages =
      typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname);

    let endpoint: string | null = '/api/log';
    if (isSinglePlayer) {
      if (worker && typeof worker === 'string' && worker.trim().length > 0) {
        endpoint = worker;
      } else if (isGhPages) {
        endpoint = null; // Avoid 405 noise on static hosting for SP page
      }
    }

    if (!endpoint) return; // Skip network logging per scope
    const authToken = typeof window !== 'undefined' ? window.analyticsAuthToken : undefined;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Include authToken passthrough for Workers that enforce it
      body: JSON.stringify({ type: 'error', ...payload, authToken }),
      keepalive: true,
      // Allow posting cross-origin to Workers
      mode: endpoint.startsWith('http') ? 'cors' : 'same-origin',
    });
  } catch {
    // Swallow logging errors
  }
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, info) => {
        const payload: {
          errorId: string;
          message: string;
          stack?: string | undefined;
          path?: string | undefined;
          ua?: string | undefined;
          componentStack?: string | undefined;
        } = {
          errorId: info.errorId,
          message:
            typeof (error as { message?: unknown })?.message === 'string'
              ? ((error as { message?: unknown }).message as string)
              : typeof (error as { toString?: () => string })?.toString === 'function'
                ? (error as { toString?: () => string }).toString() || 'Unknown error'
                : 'Unknown error',
        };
        const maybeStack: unknown = (error as { stack?: unknown })?.stack;
        if (typeof maybeStack === 'string') payload.stack = maybeStack;
        if (typeof window !== 'undefined' && typeof window.location?.pathname === 'string') {
          payload.path = window.location.pathname;
        }
        if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
          payload.ua = navigator.userAgent;
        }
        if (info.componentStack) payload.componentStack = info.componentStack;
        void logClientError(payload);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
