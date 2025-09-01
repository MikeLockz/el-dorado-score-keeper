import type React from "react"
import type { Metadata, Viewport } from "next"
import "@/app/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import StateRoot from "@/components/state-root"
import Devtools from "@/components/devtools"
import Header from "@/components/header"

// Use system fonts to avoid network fetches during build

export const metadata: Metadata = {
  title: "El Dorado Score Keeper",
  description: "Score keeper for El Dorado",
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
    other: [
      { rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '#0ea5e9' },
    ],
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
}

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StateRoot>
            <Header />
            <main className="min-h-screen bg-background">{children}</main>
            {process.env.NODE_ENV !== 'production' ? <Devtools /> : null}
          </StateRoot>
        </ThemeProvider>
      </body>
    </html>
  )
}
