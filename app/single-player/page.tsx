'use client';
import React from 'react';
import { startRound, bots } from '@/lib/single-player';
import CurrentGame from '@/components/views/CurrentGame';
import { CardGlyph } from '@/components/ui';
import type { PlayerId, Card } from '@/lib/single-player';
import { useAppState } from '@/components/state-provider';
import { tricksForRound, ROUNDS_TOTAL } from '@/lib/state/logic';
import {
  selectPlayersOrdered,
  events,
  archiveCurrentGameAndReset,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpTricksForRound,
  selectSpHandBySuit,
  selectSpIsRoundDone,
  selectSpRotatedOrder,
} from '@/lib/state';
import { useSinglePlayerEngine } from '@/lib/single-player/use-engine';
import { INITIAL_STATE } from '@/lib/state';

export default function SinglePlayerPage() {
  const { state, append, appendMany, ready, isBatchPending } = useAppState();
  // Deterministic RNG per session for bots
  const [seed, setSeed] = React.useState<string>(() =>
    String(Math.floor(Date.now() % 1_000_000_000)),
  );
  const rngRef = React.useRef<() => number>(() => Math.random());
  const initRng = React.useCallback((s: string) => {
    const n = Number(s);
    const seedNum = Number.isFinite(n) ? Math.floor(n) : 0;
    function mulberry32(a: number) {
      let t = a >>> 0;
      return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }
    rngRef.current = mulberry32(seedNum);
  }, []);
  React.useEffect(() => {
    initRng(seed);
    // re-init when component mounts or seed changes
  }, [initRng, seed]);
  const [playersCount, setPlayersCount] = React.useState(4);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [humanIdx, setHumanIdx] = React.useState(0);
  const [roundNo, setRoundNo] = React.useState(1);
  // In some static-exported deployments, the state may briefly be an initial shell before
  // the provider hydrates. Default to the known initial shape to avoid undefined access.
  const spSafe = (state.sp ?? INITIAL_STATE.sp) as typeof state.sp;
  const spLeaderId = (spSafe?.leaderId as PlayerId | null) ?? null;
  const [saved, setSaved] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const [initializedScoring, setInitializedScoring] = React.useState(false);
  const [autoDealt, setAutoDealt] = React.useState(false);

  const appPlayers = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const activePlayers = React.useMemo(
    () => appPlayers.slice(0, playersCount),
    [appPlayers, playersCount],
  );
  const players = React.useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const spTricks = selectSpTricksForRound(state);
  const useTwoDecks = playersCount > 5;
  const sp = spSafe;
  const spPhase = sp.phase;
  const spRoundNo = sp.roundNo ?? roundNo;
  const spTrump = sp.trump;
  const spTrumpCard = sp.trumpCard;
  const spOrder = sp.order;
  const spHands = sp.hands as Record<PlayerId, Card[]>;
  const spTrickPlays = (sp.trickPlays ?? []).map((p, i) => ({
    player: p.playerId as PlayerId,
    card: p.card as any as Card,
    order: i,
  }));
  const spTrickCounts = sp.trickCounts as Record<PlayerId, number>;
  const spTrumpBroken = sp.trumpBroken;

  const onDeal = async () => {
    setSaved(false);
    setSelectedCard(null);
    // On first deal for this session, archive current game and reset scoring roster
    if (!initializedScoring) {
      const desired = activePlayers.map((p) => ({ id: p.id, name: p.name }));
      try {
        await archiveCurrentGameAndReset();
      } catch (e) {
        console.warn('Failed to archive current game; continuing with reset roster step', e);
      }
      // Remove any existing players (best-effort; reducer ignores unknown IDs)
      const existingIds = Object.keys(state.players || {});
      for (const id of existingIds) {
        try {
          await append(events.playerRemoved({ id }));
        } catch {}
      }
      // Add desired players in order, ensuring names match
      for (const p of desired) {
        try {
          await append(events.playerAdded({ id: p.id, name: p.name }));
        } catch {}
      }
      // Explicitly set display order to desired order
      try {
        await append(events.playersReordered({ order: desired.map((d) => d.id) }));
      } catch {}
      setInitializedScoring(true);
    }
    const deal = startRound(
      {
        round: roundNo,
        players,
        dealer,
        tricks: spTricks,
        useTwoDecks,
      },
      Date.now(),
    );
    // Persist deal + leader + set current scoring round to bidding atomically
    try {
      await appendMany([
        events.spDeal({
          roundNo: roundNo,
          dealerId: dealer,
          order: deal.order,
          trump: deal.trump,
          trumpCard: { suit: deal.trumpCard.suit as any, rank: deal.trumpCard.rank as any },
          hands: deal.hands as any,
        }),
        events.spLeaderSet({ leaderId: deal.firstToAct }),
        events.roundStateSet({ round: roundNo, state: 'bidding' }),
      ]);
    } catch (e) {
      console.warn('Failed to persist deal', e);
    }
  };

  // Auto-deal when starting a new single-player game
  React.useEffect(() => {
    if (!ready) return;
    if (spPhase !== 'setup') return;
    if (autoDealt) return;
    // Ensure we have enough players in the scorekeeper to fill seats
    if (activePlayers.length < playersCount) return;
    setAutoDealt(true);
    void onDeal();
  }, [ready, spPhase, autoDealt, activePlayers.length, playersCount]);

  // Removed: localStorage snapshot/restore – now fully store-driven

  const humanBySuit = selectSpHandBySuit(state, human);

  // Formatting helpers for card display
  const rankLabel = React.useCallback((rank: number): string => {
    if (rank === 14) return 'A';
    if (rank === 13) return 'K';
    if (rank === 12) return 'Q';
    if (rank === 11) return 'J';
    return String(rank);
  }, []);
  const suitSymbol = React.useCallback((suit: string): string => {
    return suit === 'spades' ? '♠' : suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : '♣';
  }, []);
  const suitColorClass = React.useCallback((suit: string): string => {
    // Hearts/Diamonds in red; Clubs/Spades default foreground
    return suit === 'hearts' || suit === 'diamonds'
      ? 'text-red-700 dark:text-red-300'
      : 'text-foreground';
  }, []);
  const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  const nameFor = React.useCallback(
    (pid: string) => activePlayers.find((ap) => ap.id === pid)?.name ?? pid,
    [activePlayers],
  );
  const BotBadge = () => (
    <span className="ml-1 text-[10px] uppercase rounded px-1 border border-border text-muted-foreground">
      BOT
    </span>
  );

  const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : false;

  // Centralized SP orchestration
  useSinglePlayerEngine({
    state,
    humanId: human,
    currentRoundNo: roundNo,
    appendMany,
    isBatchPending,
    rng: rngRef.current,
    onAdvance: (nextRound, nextDealerId) => {
      const idx = Math.max(
        0,
        players.findIndex((p) => p === nextDealerId),
      );
      setDealerIdx(idx);
      setRoundNo(nextRound);
    },
    onSaved: () => setSaved(true),
  });

  // One-time cleanup: if SP session is done, normalize any stray bidding/playing rounds to 'scored'
  const cleanedRef = React.useRef(false);
  React.useEffect(() => {
    if (!ready) return;
    if (spPhase !== 'done') return;
    if (isBatchPending) return;
    if (cleanedRef.current) return;
    const batch: any[] = [];
    for (let r = 1; r <= ROUNDS_TOTAL; r++) {
      const rd = state.rounds[r];
      const st = rd?.state ?? 'locked';
      if (st !== 'bidding' && st !== 'playing') continue;
      // Only flip to scored if all present players have a non-null 'made' value
      let allMarked = true;
      for (const pid of Object.keys(state.players)) {
        if (rd?.present?.[pid] === false) continue;
        const m = rd?.made?.[pid];
        if (m == null) {
          allMarked = false;
          break;
        }
      }
      if (allMarked) batch.push(events.roundStateSet({ round: r, state: 'scored' }));
    }
    if (batch.length > 0) {
      cleanedRef.current = true;
      void appendMany(batch);
    } else {
      cleanedRef.current = true;
    }
  }, [ready, spPhase, isBatchPending, state.rounds, state.players, appendMany]);

  // Round finalization now handled by useSinglePlayerEngine

  return (
    <main className="p-4 space-y-6">
      <div className="space-y-2">
        <div className="border rounded">
          {spOrder.length > 0 && (
            <div className="flex items-center justify-between px-2 py-1 border-b">
              {(() => {
                const dealerName = selectSpDealerName(state);
                return (
                  <div className="text-xs text-muted-foreground">
                    Round {roundNo}
                    <span className="mx-2 text-muted-foreground">•</span>
                    <span>Dealer: {dealerName ?? '-'}</span>
                  </div>
                );
              })()}
              <div className="flex items-center gap-4">
                {(() => {
                  const info = selectSpTrumpInfo(state);
                  return (
                    <div
                      className="text-sm font-mono inline-flex items-center gap-1"
                      title={
                        info.trumpCard
                          ? `Trump card: ${rankLabel(info.trumpCard.rank)} of ${info.trumpCard.suit}`
                          : undefined
                      }
                    >
                      <span className="text-xs text-muted-foreground mr-1">Trump:</span>
                      {info.trump && info.trumpCard ? (
                        <CardGlyph suit={info.trump} rank={info.trumpCard.rank} size="sm" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const rotated = selectSpRotatedOrder(state);
                  const first = rotated[0] ?? null;
                  const name = first
                    ? (activePlayers.find((ap) => ap.id === first)?.name ?? first)
                    : null;
                  return (
                    <div className="text-xs text-muted-foreground">
                      <span className="mr-1">First:</span>
                      <span>{name ?? '—'}</span>
                    </div>
                  );
                })()}
                <div className="text-sm font-mono inline-flex items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Lead:</span>
                  {(() => {
                    const lead = spTrickPlays[0]?.card as any;
                    if (!lead) return <span className="text-xs text-muted-foreground">—</span>;
                    return <CardGlyph suit={lead.suit} rank={lead.rank} size="sm" />;
                  })()}
                </div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <span className="mr-1">Trump Played:</span>
                  <span className={spTrumpBroken ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-muted-foreground'}>
                    {spTrumpBroken ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}
          {(() => {
            const overlay = spPhase === 'playing' ? selectSpLiveOverlay(state) : null;
            return (
              <CurrentGame
                live={overlay ?? undefined}
                biddingInteractiveIds={[human]}
                // When SP session is done, make the grid fully read-only regardless of any row state
                disableInputs={isBatchPending || spPhase === 'done'}
                onConfirmBid={(r, pid, bid) => {
                  // Confirm this player's bid, auto-bid others if needed, then start playing
                  (async () => {
                    try {
                      if (isBatchPending) return;
                      // Ignore confirmations for non-current rounds to avoid corrupting other rows
                      if (r !== roundNo) return;
                      // Set this player's bid and auto-bids for others in one batch
                      const batch: any[] = [events.bidSet({ round: r, playerId: pid, bid })];
                      for (const p of spOrder) {
                        if (p === pid) continue;
                        const currentBid = state.rounds[r]?.bids?.[p] ?? null;
                        if (currentBid == null) {
                          const amount = bots.botBid(
                            {
                              trump: spTrump!,
                              hand: spHands[p] ?? [],
                              tricksThisRound: spTricks,
                              seatIndex: spOrder.findIndex((x) => x === p),
                              bidsSoFar: (state.rounds[r]?.bids ?? {}) as any,
                              selfId: p,
                              rng: rngRef.current,
                            },
                            'normal',
                          );
                          batch.push(events.bidSet({ round: r, playerId: p, bid: amount }));
                        }
                      }
                      // Start playing
                      batch.push(events.roundStateSet({ round: r, state: 'playing' }));
                      batch.push(events.spPhaseSet({ phase: 'playing' }));
                      await appendMany(batch);
                    } catch (e) {
                      console.warn('confirm bid failed', e);
                    }
                  })();
                }}
                disableRoundStateCycling
              />
            );
          })()}
          {spPhase === 'playing' && state.sp.reveal && (
            <div
              className={`px-3 py-2 border-t flex items-center justify-between ${(() => {
                const rState = state.rounds[spRoundNo]?.state ?? 'locked';
                switch (rState) {
                  case 'bidding':
                    return 'bg-sky-50 dark:bg-sky-900/30';
                  case 'playing':
                    return 'bg-indigo-50 dark:bg-indigo-900/30';
                  case 'complete':
                    return 'bg-orange-50 dark:bg-orange-900/30';
                  case 'scored':
                    return 'bg-emerald-50 dark:bg-emerald-900/30';
                  default:
                    return 'bg-muted';
                }
              })()}`}
            >
              <div className="text-sm">
                <span className="text-muted-foreground mr-2">Hand Winner:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {(() => {
                    const winnerId = state.sp.reveal?.winnerId as string;
                    const p = activePlayers.find((ap) => ap.id === winnerId);
                    return p?.name ?? winnerId;
                  })()}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className="inline-flex items-center rounded bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 text-sm"
                  disabled={isBatchPending}
                  onClick={() => {
                    if (isBatchPending) return;
                    const winnerId = state.sp.reveal?.winnerId as string;
                    const batch: any[] = [
                      events.spTrickCleared({ winnerId }),
                      events.spLeaderSet({ leaderId: winnerId }),
                      events.spTrickRevealClear({}),
                    ];
                    void appendMany(batch);
                  }}
                >
                  {(() => {
                    const needed = tricksForRound(spRoundNo);
                    const total = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
                    return total + 1 >= needed ? 'Next Round' : 'Next Hand';
                  })()}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {spOrder.length > 0 && (
        <div className="space-y-2">
          {isDev && (
            <div className="flex items-center gap-2 text-xs">
              <label className="text-muted-foreground">Seed:</label>
              <input
                className="px-2 py-1 border rounded bg-background"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                style={{ width: 120 }}
              />
              <button
                type="button"
                className="border rounded px-2 py-1"
                onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000)))}
              >
                Randomize
              </button>
              <button
                type="button"
                className="border rounded px-2 py-1"
                onClick={() => initRng(seed)}
              >
                Apply
              </button>
              <span className="text-muted-foreground">(bots use deterministic RNG)</span>
            </div>
          )}
          <h2 className="text-lg font-semibold">
            Your Hand ({activePlayers.find((ap) => ap.id === human)?.name ?? human})
          </h2>
          {spPhase === 'bidding' ? (
            <div className="space-y-1">
              {suitOrder.map((s) => {
                const row = humanBySuit[s];
                if (row.length === 0) return null;
                return (
                  <div key={`bid-row-${s}`} className="flex items-center gap-2">
                    <div className={`w-5 text-center ${suitColorClass(s)}`}>{suitSymbol(s)}</div>
                    <div className="flex flex-wrap gap-1">
                      {row.map((c, i) => (
                        <CardGlyph
                          key={`bid-${s}-${c.rank}-${i}`}
                          suit={c.suit}
                          rank={c.rank}
                          size="sm"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="space-y-1">
                {suitOrder.map((s) => {
                  const row = humanBySuit[s];
                  if (row.length === 0) return null;
                  return (
                    <div key={`play-row-${s}`} className="flex items-center gap-2">
                      <div className={`w-5 text-center ${suitColorClass(s)}`}>{suitSymbol(s)}</div>
                      <div className="flex flex-wrap gap-1">
                        {row.map((c, idx) => {
                          const ledSuit = spTrickPlays[0]?.card.suit as any;
                          const canFollow = (spHands[human] ?? []).some((h) => h.suit === ledSuit);
                          let legal = true;
                          if (!ledSuit) {
                            const hasNonTrump = (spHands[human] ?? []).some(
                              (h) => h.suit !== spTrump,
                            );
                            if (!spTrumpBroken && hasNonTrump && c.suit === spTrump) legal = false;
                          } else if (canFollow) {
                            legal = c.suit === ledSuit;
                          }
                          const effectiveLeader =
                            (spTrickPlays[0]?.player as PlayerId | undefined) ?? spLeaderId;
                          const leaderIdx = spOrder.findIndex((p) => p === effectiveLeader);
                          const rotated =
                            leaderIdx < 0
                              ? spOrder
                              : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
                          const nextToPlay = rotated[spTrickPlays.length];
                          const isHumansTurn = nextToPlay === human && !state.sp.reveal;
                          const isSelected = selectedCard === c;
                          return (
                            <button
                              key={`play-${s}-${c.rank}-${idx}`}
                              className={`${legal && isHumansTurn ? '' : 'opacity-40'} ${isSelected ? 'ring-2 ring-sky-500 rounded' : ''}`}
                              disabled={!legal || !isHumansTurn}
                              onClick={() => {
                                if (!legal || !isHumansTurn) return;
                                setSelectedCard((prev) => (prev === c ? null : c));
                              }}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const ledSuitNow = spTrickPlays[0]?.card.suit as any;
                                const canFollowNow = (spHands[human] ?? []).some(
                                  (h) => h.suit === ledSuitNow,
                                );
                                let legalNow = true;
                                if (!ledSuitNow) {
                                  const hasNonTrump = (spHands[human] ?? []).some(
                                    (h) => h.suit !== spTrump,
                                  );
                                  if (!spTrumpBroken && hasNonTrump && c.suit === spTrump)
                                    legalNow = false;
                                } else if (canFollowNow) {
                                  legalNow = c.suit === ledSuitNow;
                                }
                                const effectiveLeaderNow =
                                  (spTrickPlays[0]?.player as PlayerId | undefined) ?? spLeaderId;
                                const leaderIdxNow = spOrder.findIndex(
                                  (p) => p === effectiveLeaderNow,
                                );
                                const rotatedNow =
                                  leaderIdxNow < 0
                                    ? spOrder
                                    : [
                                        ...spOrder.slice(leaderIdxNow),
                                        ...spOrder.slice(0, leaderIdxNow),
                                      ];
                                const nextToPlayNow = rotatedNow[spTrickPlays.length];
                                if (!legalNow || nextToPlayNow !== human) return;
                                void append(
                                  events.spTrickPlayed({
                                    playerId: human,
                                    card: { suit: c.suit as any, rank: c.rank },
                                  }),
                                );
                                setSelectedCard(null);
                              }}
                              title={`${rankLabel(c.rank)} of ${c.suit}`}
                            >
                              <CardGlyph suit={c.suit} rank={c.rank} size="sm" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="inline-flex items-center rounded border px-3 py-1 text-sm"
                  disabled={!selectedCard || isBatchPending || !!state.sp.reveal}
                  onClick={() => {
                    if (!selectedCard) return;
                    if (state.sp.reveal) return;
                    const ledSuit = spTrickPlays[0]?.card.suit as any;
                    const canFollow = (spHands[human] ?? []).some((h) => h.suit === ledSuit);
                    let legal = true;
                    if (!ledSuit) {
                      const hasNonTrump = (spHands[human] ?? []).some((h) => h.suit !== spTrump);
                      if (!spTrumpBroken && hasNonTrump && selectedCard.suit === spTrump)
                        legal = false;
                    } else if (canFollow) {
                      legal = selectedCard.suit === ledSuit;
                    }
                    const effectiveLeader =
                      (spTrickPlays[0]?.player as PlayerId | undefined) ?? spLeaderId;
                    const leaderIdx = spOrder.findIndex((p) => p === effectiveLeader);
                    const rotated =
                      leaderIdx < 0
                        ? spOrder
                        : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
                    const nextToPlay = rotated[spTrickPlays.length];
                    if (!legal || nextToPlay !== human) return;
                    if (isBatchPending) return;
                    void append(
                      events.spTrickPlayed({
                        playerId: human,
                        card: { suit: selectedCard.suit as any, rank: selectedCard.rank },
                      }),
                    );
                    setSelectedCard(null);
                  }}
                >
                  Play Selected
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
