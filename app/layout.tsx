import type React from 'react';
import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '@/styles/global.scss';
import { ThemeProvider } from '@/components/theme-provider';
import StateRoot from '@/components/state-root';
import { AppErrorBoundary } from '@/components/error-boundary';
import Devtools from '@/components/devtools';
import Header from '@/components/header';
import { BrowserTelemetryProvider } from './browser-telemetry-provider';

import styles from './layout.module.scss';

// Use system fonts to avoid network fetches during build

const bp = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'El Dorado Score Keeper',
  description: 'Score keeper for El Dorado',
  generator: 'v0.app',
  manifest: `${bp}/site.webmanifest`,
  icons: {
    icon: [
      { url: `${bp}/favicon.ico` },
      { url: `${bp}/favicon.svg`, type: 'image/svg+xml' },
      { url: `${bp}/favicon-96x96.png`, sizes: '96x96', type: 'image/png' },
    ],
    apple: `${bp}/apple-touch-icon.png`,
    // Remove mask-icon until available in /public
  },
  openGraph: {
    title: 'El Dorado Score Keeper',
    description: 'Score keeper for El Dorado',
    siteName: 'El Dorado Score Keeper',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'El Dorado Score Keeper',
    description: 'Score keeper for El Dorado',
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={styles.body}>
        <Script id="promote-css-preloads" strategy="beforeInteractive">
          {`
            (function () {
              if (typeof document === 'undefined') return;
              var promote = function () {
                var links = document.querySelectorAll('link[rel="preload"][as="style"]');
                links.forEach(function (link) {
                  if (link.rel === 'stylesheet') return;
                  link.rel = 'stylesheet';
                  link.removeAttribute('as');
                  if (!link.hasAttribute('data-precedence')) {
                    link.setAttribute('data-precedence', 'next');
                  }
                });
              };
              if (document.readyState === 'complete' || document.readyState === 'interactive') {
                promote();
              } else {
                document.addEventListener('DOMContentLoaded', promote, { once: true });
              }
            })();
          `}
        </Script>
        {/* Skip link for keyboard/screen reader users */}
        <a href="#main" className={styles.skipLink}>
          Skip to content
        </a>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          value={{
            light: 'light',
            dark: 'dark',
          }}
        >
          <Suspense fallback={null}>
            <BrowserTelemetryProvider>
              <AppErrorBoundary>
                <StateRoot>
                  <Header />
                  <main id="main" className={styles.main}>
                    {children}
                  </main>
                  {process.env.NODE_ENV !== 'production' ? <Devtools /> : null}
                </StateRoot>
              </AppErrorBoundary>
            </BrowserTelemetryProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
