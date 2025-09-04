'use client';
import React from 'react';

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

  static override getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    const errorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.setState({ errorId });
    try {
      this.props.onError?.(error, { componentStack: info?.componentStack, errorId });
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
    // eslint-disable-next-line no-console
    console.error('[ui error]', payload);
  } catch {}
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'error', ...payload }),
      keepalive: true,
    });
  } catch {
    // Swallow logging errors
  }
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, info) => {
        const base: { errorId: string; message: string; stack?: string; path?: string; ua?: string; componentStack?: string } = {
          errorId: info.errorId,
          message: String(error?.message || error),
          stack: typeof (error as any)?.stack === 'string' ? (error as any).stack : undefined,
          path: typeof window !== 'undefined' ? window.location?.pathname : undefined,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        };
        if (info.componentStack) base.componentStack = info.componentStack;
        void logClientError(base);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
