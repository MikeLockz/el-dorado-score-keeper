"use client"
import React from 'react'
import { useAppState } from '@/components/state-provider'

export default function Devtools() {
  const { height, state, previewAt } = useAppState()
  const [cursor, setCursor] = React.useState<number>(height)
  const [preview, setPreview] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => { setCursor(height) }, [height])

  const onChange = async (h: number) => {
    setCursor(h)
    setLoading(true)
    try {
      const s = await previewAt(h)
      setPreview(s)
    } finally {
      setLoading(false)
    }
  }

  const players = Object.keys(state.players).length
  const scores = Object.keys(state.scores).length

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 50 }}>
      <div style={{ background: 'rgba(17,24,39,0.9)', color: '#fff', padding: 12, borderRadius: 8, width: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>DevTools</strong>
          <span>height: {height}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={0} max={height} value={cursor} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ width: 36, textAlign: 'right' }}>{cursor}</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>
          <div>live players: {players}, scores: {scores}</div>
          <div>preview: {loading ? 'loading…' : preview ? `players ${Object.keys(preview.players).length}, scores ${Object.keys(preview.scores).length}` : '—'}</div>
        </div>
      </div>
    </div>
  )
}

