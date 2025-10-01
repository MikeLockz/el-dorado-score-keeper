'use client';
import React from 'react';

import { captureBrowserException } from '@/lib/observability/browser';
import { logEvent } from '@/lib/client-log';

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
function logClientError(payload: {
  errorId: string;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  path?: string | undefined;
  ua?: string | undefined;
}) {
  try {
    logEvent('client.error', {
      errorId: payload.errorId,
      message: payload.message,
      stack: payload.stack,
      componentStack: payload.componentStack,
      path: payload.path,
      ua: payload.ua,
    });
  } catch {
    // Swallow logging errors
  }
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, info) => {
        const errMsg = (() => {
          const e = error as { message?: unknown; toString?: (() => string) | undefined };
          if (typeof e?.message === 'string') return e.message;
          if (typeof e?.toString === 'function') {
            try {
              return e.toString() || 'Unknown error';
            } catch {}
          }
          return 'Unknown error';
        })();
        const path =
          typeof window !== 'undefined' && typeof window.location?.pathname === 'string'
            ? window.location.pathname
            : undefined;
        captureBrowserException(error, {
          scope: 'app.error-boundary',
          errorId: info.errorId,
          path,
          hasComponentStack: info.componentStack ? 'yes' : 'no',
        });
        const payload: {
          errorId: string;
          message: string;
          stack?: string | undefined;
          path?: string | undefined;
          ua?: string | undefined;
          componentStack?: string | undefined;
        } = {
          errorId: info.errorId,
          message: errMsg,
        };
        const maybeStack: unknown = (error as { stack?: unknown })?.stack;
        if (typeof maybeStack === 'string') payload.stack = maybeStack;
        if (path) {
          payload.path = path;
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
