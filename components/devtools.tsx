'use client';
import React from 'react';
import { useAppState } from '@/components/state-provider';
import type { AppState, RoundState } from '@/lib/state';
import { exportBundle } from '@/lib/state';
import { formatTime } from '@/lib/format';

export default function Devtools() {
  const {
    height,
    state,
    previewAt,
    warnings,
    clearWarnings,
    timeTravelHeight,
    setTimeTravelHeight,
    timeTraveling,
  } = useAppState();
  const [cursor, setCursor] = React.useState<number>(height);
  const [followLive, setFollowLive] = React.useState(true);
  const [preview, setPreview] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (followLive) setCursor(height);
  }, [height, followLive]);

  const onChange = (h: number) => {
    setFollowLive(false);
    setCursor(h);
    setTimeTravelHeight(h);
    setLoading(true);
    void (async () => {
      try {
        const s = await previewAt(h);
        setPreview(s);
      } finally {
        setLoading(false);
      }
    })();
  };

  const players = Object.keys(state.players).length;
  const scores = Object.keys(state.scores).length;

  const [open, setOpen] = React.useState(false);

  // Helper: readable label for a round state
  function labelForRoundState(s: RoundState): string {
    switch (s) {
      case 'locked':
        return 'Locked';
      case 'bidding':
        return 'Active';
      case 'playing':
        return 'Playing';
      case 'complete':
        return 'Complete';
      case 'scored':
        return 'Scored';
      default:
        return String(s);
    }
  }

  // Collapsed floating opener button (very small)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 8,
          bottom: 8,
          zIndex: 50,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'rgba(17,24,39,0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          fontSize: 10,
          lineHeight: '16px',
          textAlign: 'center',
          opacity: 0.7,
        }}
        title="Open DevTools"
        aria-label="Open DevTools"
      >
        DT
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 50 }}>
      <div
        style={{
          background: 'rgba(17,24,39,0.9)',
          color: '#fff',
          padding: 12,
          borderRadius: 8,
          width: 320,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>DevTools</strong>
          <span>height: {height}</span>
        </div>
        <div style={{ position: 'absolute', right: 8, top: 8 }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              cursor: 'pointer',
              opacity: 0.8,
            }}
            aria-label="Close DevTools"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={height}
            value={cursor}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 48, textAlign: 'right' }}>{cursor}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            onClick={() => {
              const nextHeight = Math.max(0, cursor - 1);
              if (nextHeight === cursor) return;
              onChange(nextHeight);
            }}
            disabled={cursor === 0}
            style={{
              fontSize: 11,
              padding: '2px 6px',
              background: '#334155',
              color: '#fff',
              borderRadius: 4,
              opacity: cursor === 0 ? 0.6 : 1,
            }}
            title="Step back one event height"
          >
            Undo
          </button>
          <button
            onClick={() => {
              setFollowLive(true);
              setCursor(height);
              setPreview(null);
              setTimeTravelHeight(null);
            }}
            disabled={followLive}
            style={{
              fontSize: 11,
              padding: '2px 6px',
              background: '#334155',
              color: '#fff',
              borderRadius: 4,
              opacity: followLive ? 0.6 : 1,
            }}
            title="Follow live state and keep slider at the latest height"
          >
            Go live
          </button>
        </div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>
          <div>
            live players: {players}, scores: {scores}
          </div>
          <div>
            preview:{' '}
            {loading
              ? 'loading…'
              : preview
                ? `players ${Object.keys(preview.players).length}, scores ${Object.keys(preview.scores).length}, sp round ${preview.sp?.roundNo ?? '—'} phase ${preview.sp?.phase ?? '—'}`
                : '—'}
          </div>
          <div style={{ marginTop: 4 }}>
            {(() => {
              const r = state.sp?.roundNo ?? null;
              const st: RoundState | undefined = r ? state.rounds[r]?.state : undefined;
              return r && st
                ? `round ${r} state: ${labelForRoundState(st)} (${st})`
                : 'round state: —';
            })()}
          </div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
            mode: {timeTraveling ? `time-travel @ ${timeTravelHeight}` : 'live'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
                  } catch (e) {
                    console.warn('copy state failed', e);
                  }
                })();
              }}
              style={{
                fontSize: 11,
                padding: '4px 6px',
                background: '#334155',
                color: '#fff',
                borderRadius: 4,
              }}
              title="Copy current app state JSON to clipboard"
            >
              Copy state JSON
            </button>
            <button
              onClick={() => {
                void (async () => {
                  try {
                    const bundle = await exportBundle('app-db');
                    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
                  } catch (e) {
                    console.warn('copy bundle failed', e);
                  }
                })();
              }}
              style={{
                fontSize: 11,
                padding: '4px 6px',
                background: '#334155',
                color: '#fff',
                borderRadius: 4,
              }}
              title="Copy full event bundle JSON to clipboard"
            >
              Copy bundle JSON
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            <span>warnings: {warnings.length}</span>
            {warnings.length > 0 && (
              <>
                <button
                  onClick={clearWarnings}
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: '2px 6px',
                    background: '#334155',
                    color: '#fff',
                    borderRadius: 4,
                  }}
                >
                  clear
                </button>
                <div style={{ marginTop: 4, maxHeight: 80, overflow: 'auto' }}>
                  {warnings.slice(0, 3).map((w, i) => (
                    <div key={i} style={{ opacity: 0.9 }}>
                      {formatTime(w.at)} — {w.code}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
