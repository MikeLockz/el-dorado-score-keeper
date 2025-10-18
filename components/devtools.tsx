'use client';
import React from 'react';
import { useAppState } from '@/components/state-provider';
import { useToast } from '@/components/ui/toast';
import type { AppState, RoundState } from '@/lib/state';
import {
  exportBundle,
  listBackfillCandidates,
  backfillGameById,
  deriveGameRoute,
  selectHumanIdFor,
  selectPlayersOrderedFor,
  type BackfillCandidate,
  type BackfillGameResult,
} from '@/lib/state';
import { formatTime } from '@/lib/format';
import { captureBrowserMessage } from '@/lib/observability/browser';
import { saveGeneratedGame } from '@/lib/devtools/generator/saveGeneratedGame';
import type { CurrentUserProfile } from '@/lib/devtools/generator/gameDataGenerator';
import { uuid } from '@/lib/utils';

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
  const { toast } = useToast();
  const [cursor, setCursor] = React.useState<number>(height);
  const [followLive, setFollowLive] = React.useState(true);
  const [preview, setPreview] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const singleRosterPlayers = React.useMemo(
    () => selectPlayersOrderedFor(state, 'single'),
    [state],
  );
  const currentHumanId = React.useMemo(() => selectHumanIdFor(state, 'single'), [state]);
  const fallbackProfileRef = React.useRef<CurrentUserProfile | null>(null);
  const currentUserProfile = React.useMemo(() => {
    if (!currentHumanId) return null;
    const rosterId = state.activeSingleRosterId;
    const roster = rosterId ? state.rosters[rosterId] : null;
    const name =
      roster?.playersById?.[currentHumanId] ?? state.players[currentHumanId] ?? 'Single Player';
    return {
      id: currentHumanId,
      displayName: name,
      avatarSeed: null,
    };
  }, [currentHumanId, state]);
  const effectiveCurrentUser = React.useMemo(() => {
    if (currentUserProfile) return currentUserProfile;
    if (!fallbackProfileRef.current) {
      const fallbackName = 'Dev QA Player';
      fallbackProfileRef.current = {
        id: `dev-${uuid()}`,
        displayName: fallbackName,
        avatarSeed: fallbackName.toLowerCase().replace(/\s+/g, '-'),
      };
    }
    return fallbackProfileRef.current;
  }, [currentUserProfile]);
  const usingFallbackProfile = !currentUserProfile && Boolean(effectiveCurrentUser);
  const generatorPlayerCount = React.useMemo(() => {
    const rosterCount = singleRosterPlayers.length;
    if (rosterCount >= 2) return rosterCount;
    return 4;
  }, [singleRosterPlayers]);
  const [generatorSeed, setGeneratorSeed] = React.useState('');
  const [showGeneratorAdvanced, setShowGeneratorAdvanced] = React.useState(false);
  const [generatorState, setGeneratorState] = React.useState<{
    busy: boolean;
    error: string | null;
    lastGameId: string | null;
    lastGameRoute: string | null;
    lastSeed: string | null;
    lastTitle: string | null;
    usedSyntheticProfile: boolean;
  }>({
    busy: false,
    error: null,
    lastGameId: null,
    lastGameRoute: null,
    lastSeed: null,
    lastTitle: null,
    usedSyntheticProfile: false,
  });

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
  const mountedRef = React.useRef(true);
  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const [backfillState, setBackfillState] = React.useState<{
    candidates: BackfillCandidate[];
    refreshing: boolean;
    loading: boolean;
    lastResult: BackfillGameResult | null;
    error: string | null;
    copying: boolean;
  }>({
    candidates: [],
    refreshing: false,
    loading: false,
    lastResult: null,
    error: null,
    copying: false,
  });
  const [selectedGameId, setSelectedGameId] = React.useState<string | null>(null);

  const refreshBackfill = React.useCallback(async () => {
    setBackfillState((prev) => ({
      ...prev,
      refreshing: true,
      error: prev.loading ? prev.error : null,
    }));
    try {
      const candidates = await listBackfillCandidates();
      if (!mountedRef.current) return;
      setBackfillState((prev) => ({
        ...prev,
        candidates,
        refreshing: false,
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : 'Unable to read archived games from IndexedDB.';
      setBackfillState((prev) => ({
        ...prev,
        refreshing: false,
        error: message,
      }));
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refreshBackfill();
  }, [open, refreshBackfill]);

  React.useEffect(() => {
    if (!backfillState.candidates.length) {
      setSelectedGameId(null);
      return;
    }
    setSelectedGameId((current) => {
      if (current && backfillState.candidates.some((candidate) => candidate.id === current)) {
        return current;
      }
      return backfillState.candidates[0]?.id ?? null;
    });
  }, [backfillState.candidates]);

  const handleBackfillClick = React.useCallback(async () => {
    const candidate =
      backfillState.candidates.find((entry) => entry.id === selectedGameId) ??
      backfillState.candidates[0];
    if (!candidate) return;
    setBackfillState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));
    let result: BackfillGameResult | null = null;
    let errorMessage: string | null = null;
    try {
      result = await backfillGameById(candidate.id);
      if (!result) {
        errorMessage = 'Unable to backfill the selected game.';
      }
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : 'Unable to backfill the selected game.';
    }
    if (mountedRef.current) {
      setBackfillState((prev) => ({
        ...prev,
        loading: false,
        lastResult: result ?? prev.lastResult,
        error: errorMessage,
      }));
    }
    await refreshBackfill();
  }, [backfillState.candidates, refreshBackfill, selectedGameId]);

  const handleCopySummary = React.useCallback(() => {
    const result = backfillState.lastResult;
    if (!result) return;
    setBackfillState((prev) => ({
      ...prev,
      copying: true,
    }));
    void (async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(result.summary, null, 2));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        captureBrowserMessage('devtools.backfill.copy.failed', {
          level: 'warn',
          attributes: { reason },
        });
      } finally {
        if (!mountedRef.current) return;
        setBackfillState((prev) => ({
          ...prev,
          copying: false,
        }));
      }
    })();
  }, [backfillState.lastResult]);

  const handleGenerateGame = React.useCallback(async () => {
    const profile = effectiveCurrentUser;
    if (!profile) {
      toast({
        title: 'Unable to generate game',
        description: 'No player profile could be synthesized for single player mode.',
        variant: 'destructive',
      });
      return;
    }
    const trimmedSeed = generatorSeed.trim();
    setGeneratorState((prev) => ({
      ...prev,
      busy: true,
      error: null,
    }));
    try {
      const result = await saveGeneratedGame({
        currentUser: profile,
        playerCount: generatorPlayerCount,
        seed: trimmedSeed || undefined,
      });
      const route = deriveGameRoute(result.gameRecord);
      setGeneratorState({
        busy: false,
        error: null,
        lastGameId: result.gameRecord.id,
        lastGameRoute: route,
        lastSeed: result.seed,
        lastTitle: result.gameRecord.title,
        usedSyntheticProfile: usingFallbackProfile,
      });
      toast({
        title: 'Synthetic game archived',
        description: `Saved as ${result.gameRecord.title}${
          usingFallbackProfile ? ' (Dev QA Player synthesized)' : ''
        }`,
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate synthetic game.';
      captureBrowserMessage('devtools.generator.failed', {
        level: 'error',
        attributes: {
          reason: message,
          hasSeed: trimmedSeed ? 'yes' : 'no',
          usedSyntheticProfile: usingFallbackProfile ? 'yes' : 'no',
        },
      });
      setGeneratorState((prev) => ({
        ...prev,
        busy: false,
        error: message,
      }));
      toast({
        title: 'Failed to generate game',
        description: message,
        variant: 'destructive',
      });
    }
  }, [effectiveCurrentUser, generatorPlayerCount, generatorSeed, toast, usingFallbackProfile]);

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
                    const reason = e instanceof Error ? e.message : 'Unknown error';
                    captureBrowserMessage('devtools.copy-state.failed', {
                      level: 'warn',
                      attributes: { reason },
                    });
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
                    const reason = e instanceof Error ? e.message : 'Unknown error';
                    captureBrowserMessage('devtools.copy-bundle.failed', {
                      level: 'warn',
                      attributes: { reason },
                    });
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
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(148,163,184,0.25)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
              Synthetic single player archive
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 8, lineHeight: 1.4 }}>
              Generates a complete single player session and stores it in IndexedDB for quick QA.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                onClick={handleGenerateGame}
                disabled={generatorState.busy}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#3b82f6',
                  color: '#0f172a',
                  borderRadius: 4,
                  opacity: generatorState.busy ? 0.7 : 1,
                }}
              >
                {generatorState.busy ? 'Generating…' : 'Generate single player game'}
              </button>
              <button
                type="button"
                onClick={() => setShowGeneratorAdvanced((prev) => !prev)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#334155',
                  color: '#fff',
                  borderRadius: 4,
                }}
                aria-expanded={showGeneratorAdvanced}
              >
                {showGeneratorAdvanced ? 'Hide advanced' : 'Advanced'}
              </button>
            </div>
            {usingFallbackProfile ? (
              <div
                style={{
                  background: 'rgba(59,130,246,0.18)',
                  border: '1px solid rgba(96,165,250,0.45)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 11,
                  marginBottom: 8,
                }}
              >
                No single player human detected. A temporary <strong>Dev QA Player</strong> will be
                synthesized for this archive.
              </div>
            ) : null}
            {showGeneratorAdvanced ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <label style={{ fontSize: 11, opacity: 0.85 }}>Seed (optional)</label>
                <input
                  type="text"
                  value={generatorSeed}
                  onChange={(event) => setGeneratorSeed(event.target.value)}
                  placeholder="Leave blank for randomized seed"
                  style={{
                    background: '#1f2937',
                    color: '#f8fafc',
                    borderRadius: 4,
                    border: '1px solid rgba(148,163,184,0.35)',
                    padding: '4px 6px',
                    fontSize: 12,
                  }}
                />
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  Using {generatorPlayerCount} roster players from the active single player lineup.
                  {usingFallbackProfile
                    ? ' Dev QA Player will fill the human seat automatically.'
                    : ''}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8 }}>
                Using {generatorPlayerCount} roster players from the active single player lineup.
                {usingFallbackProfile
                  ? ' Dev QA Player will fill the human seat automatically.'
                  : ''}
              </div>
            )}
            {generatorState.error ? (
              <div
                style={{
                  background: 'rgba(220,38,38,0.25)',
                  border: '1px solid rgba(248,113,113,0.6)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 11,
                  marginBottom: 8,
                }}
              >
                {generatorState.error}
              </div>
            ) : null}
            {generatorState.lastGameId ? (
              <div
                style={{
                  background: 'rgba(22,163,74,0.15)',
                  border: '1px solid rgba(34,197,94,0.45)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                <div>
                  Last archive:{' '}
                  <strong>{generatorState.lastTitle ?? generatorState.lastGameId}</strong>
                </div>
                <div>ID: {generatorState.lastGameId}</div>
                <div>
                  <a
                    href={generatorState.lastGameRoute ?? undefined}
                    style={{ color: '#bfdbfe', textDecoration: 'underline' }}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in archive viewer
                  </a>
                </div>
                <div>Seed used: {generatorState.lastSeed}</div>
                {generatorState.usedSyntheticProfile ? (
                  <div>Human profile: synthetic Dev QA Player</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(148,163,184,0.25)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Archived backfill</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Remaining: {backfillState.candidates.length}</span>
              {backfillState.refreshing ? <span style={{ opacity: 0.8 }}>Refreshing…</span> : null}
            </div>
            {backfillState.candidates.length > 0 ? (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, opacity: 0.85 }}>
                  Select game (latest {Math.min(10, backfillState.candidates.length)} shown):
                </label>
                <select
                  value={selectedGameId ?? ''}
                  onChange={(event) => setSelectedGameId(event.target.value || null)}
                  style={{
                    background: '#1f2937',
                    color: '#f8fafc',
                    borderRadius: 4,
                    border: '1px solid rgba(148,163,184,0.35)',
                    padding: '4px 6px',
                    fontSize: 12,
                  }}
                >
                  {backfillState.candidates.slice(0, 10).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {formatTime(candidate.finishedAt)} • {candidate.title} (v
                      {candidate.metadataVersion})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ opacity: 0.75, marginBottom: 8, fontSize: 11 }}>
                All archived games have canonical player metadata.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                onClick={handleBackfillClick}
                disabled={
                  backfillState.loading ||
                  backfillState.candidates.length === 0 ||
                  backfillState.refreshing
                }
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#22c55e',
                  color: '#0f172a',
                  borderRadius: 4,
                  opacity: backfillState.loading || backfillState.candidates.length === 0 ? 0.7 : 1,
                }}
              >
                {backfillState.loading ? 'Backfilling…' : 'Backfill selected game'}
              </button>
              <button
                onClick={() => {
                  void refreshBackfill();
                }}
                disabled={backfillState.refreshing}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#334155',
                  color: '#fff',
                  borderRadius: 4,
                  opacity: backfillState.refreshing ? 0.7 : 1,
                }}
              >
                Refresh list
              </button>
            </div>
            {backfillState.error ? (
              <div
                style={{
                  background: 'rgba(220,38,38,0.25)',
                  border: '1px solid rgba(248,113,113,0.6)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 11,
                  marginBottom: 8,
                }}
              >
                {backfillState.error}
              </div>
            ) : null}
            {backfillState.lastResult ? (
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
                  Last result: {backfillState.lastResult.record.title} (
                  {backfillState.lastResult.id}) •{' '}
                  {backfillState.lastResult.updated ? 'updated' : 'already current'}
                </div>
                <textarea
                  readOnly
                  value={JSON.stringify(backfillState.lastResult.summary, null, 2)}
                  style={{
                    width: '100%',
                    height: 140,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    background: '#0f172a',
                    color: '#e2e8f0',
                    borderRadius: 4,
                    border: '1px solid rgba(148,163,184,0.35)',
                    padding: 8,
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={handleCopySummary}
                    disabled={backfillState.copying}
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      background: '#334155',
                      color: '#fff',
                      borderRadius: 4,
                      opacity: backfillState.copying ? 0.7 : 1,
                    }}
                  >
                    {backfillState.copying ? 'Copying…' : 'Copy summary JSON'}
                  </button>
                </div>
              </div>
            ) : null}
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
