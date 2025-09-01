"use client"
import React from 'react'
import { StateProvider } from '@/components/state-provider'

export default function StateRoot({ children }: { children: React.ReactNode }) {
  const onWarn = React.useCallback((code: string, info?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[state warn]', code, info)
    }
  }, [])
  return <StateProvider onWarn={onWarn}>{children}</StateProvider>
}

