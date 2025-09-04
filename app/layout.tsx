import type React from 'react';
import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import StateRoot from '@/components/state-root';
import Devtools from '@/components/devtools';
import Header from '@/components/header';

// Use system fonts to avoid network fetches during build

export const metadata: Metadata = {
  title: 'El Dorado Score Keeper',
  description: 'Score keeper for El Dorado',
  generator: 'v0.app',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
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
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <StateRoot>
            <Header />
            <main className="min-h-screen bg-background">{children}</main>
            {process.env.NODE_ENV !== 'production' ? <Devtools /> : null}
          </StateRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
