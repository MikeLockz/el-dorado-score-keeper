'use client';
import React from 'react';
import { startRound, mulberry32, deriveSeed } from '@/lib/single-player';
// import CurrentGame from '@/components/views/CurrentGame';
import SinglePlayerMobile from '@/components/views/SinglePlayerMobile';
import type { PlayerId, Card } from '@/lib/single-player';
import { useAppState } from '@/components/state-provider';
import { ROUNDS_TOTAL } from '@/lib/state/logic';
import {
  selectPlayersOrdered,
  events,
  selectSpTricksForRound,
  selectSpHandBySuit,
} from '@/lib/state';
import { useSinglePlayerEngine } from '@/lib/single-player/use-engine';
import { INITIAL_STATE } from '@/lib/state';

export default function SinglePlayerPage() {
  const { state, append, appendMany, ready, isBatchPending } = useAppState();
  // Deterministic RNG per session/round for bots, derived from session seed
  const rngRef = React.useRef<() => number>(() => Math.random());
  // Stable base when sessionSeed is absent: capture once per mount
  const baseFallbackRef = React.useRef<number>(Math.floor(Date.now()));
  const sessionSeed = state.sp.sessionSeed ?? null;
  const baseSeed = (sessionSeed ?? baseFallbackRef.current) as number;
  React.useEffect(() => {
    const roundNo = (state.sp?.roundNo as number | null) ?? 1;
    const botSeed = deriveSeed(baseSeed, roundNo, 1);
    rngRef.current = mulberry32(botSeed);
  }, [baseSeed, state.sp?.roundNo]);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [humanIdx, setHumanIdx] = React.useState(0);
  // Round is authoritative in store (state.sp.roundNo); default to 1 at startup
  // In some static-exported deployments, the state may briefly be an initial shell before
  // the provider hydrates. Default to the known initial shape to avoid undefined access.
  const spSafe = (state.sp ?? INITIAL_STATE.sp) as typeof state.sp;
  const spLeaderId = (spSafe?.leaderId as PlayerId | null) ?? null;
  const [saved, setSaved] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const [autoDealt, setAutoDealt] = React.useState(false);

  const appPlayers = React.useMemo(() => selectPlayersOrdered(state), [state]);
  // Use full roster for single-player; manage seat order via Players screen
  const activePlayers = appPlayers;
  const players = React.useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const spTricks = selectSpTricksForRound(state);
  const useTwoDecks = activePlayers.length > 5;
  const sp = spSafe;
  const spPhase = sp.phase;
  const spRoundNo = sp.roundNo ?? 1;
  const spTrump = sp.trump;
  const spTrumpCard = sp.trumpCard;
  const spOrder = sp.order;
  const spTrickPlays = (sp.trickPlays ?? []).map((p, i) => ({
    player: p.playerId as PlayerId,
    card: { suit: p.card.suit, rank: p.card.rank } as Card,
    order: i,
  }));
  const spTrickCounts = sp.trickCounts as Record<PlayerId, number>;
  const spTrumpBroken = sp.trumpBroken;

  const onDeal = async () => {
    setSaved(false);
    setSelectedCard(null);
    const deal = startRound(
      {
        round: spRoundNo,
        players,
        dealer,
        tricks: spTricks,
        useTwoDecks,
      },
      deriveSeed(baseSeed, spRoundNo, 0),
    );
    // Persist deal + leader + set current scoring round to bidding atomically
    try {
      await appendMany([
        events.spDeal({
          roundNo: spRoundNo,
          dealerId: dealer,
          order: deal.order,
          trump: deal.trump,
          trumpCard: { suit: deal.trumpCard.suit, rank: deal.trumpCard.rank },
          hands: deal.hands,
        }),
        events.spLeaderSet({ leaderId: deal.firstToAct }),
        events.roundStateSet({ round: spRoundNo, state: 'bidding' }),
      ]);
    } catch (e) {
      console.warn('Failed to persist deal', e);
    }
  };

  // Auto-deal when starting a new single-player game
  React.useEffect(() => {
    if (!ready) return;
    if (autoDealt) return;
    const haveDeal = !!spTrump && (spOrder?.length ?? 0) > 0;
    // If we're in setup, or we have no deal materialized yet, prepare a deal
    if (spPhase !== 'setup' && haveDeal) return;
    // Need at least 2 players to deal
    if (activePlayers.length < 2) return;
    setAutoDealt(true);
    void onDeal();
  }, [ready, spPhase, autoDealt, activePlayers.length, spTrump, spOrder]);

  // Safety: if the scoring round is in bidding/playing but SP has no deal materialized yet,
  // and no trick is in progress and no reveal is active, deal now.
  React.useEffect(() => {
    if (!ready) return;
    if (isBatchPending) return;
    const haveDeal =
      !!spTrump &&
      (spOrder?.length ?? 0) > 0 &&
      Object.values(sp.hands ?? {}).some((arr) => (arr?.length ?? 0) > 0);
    if (haveDeal) return;
    const rState = state.rounds[spRoundNo]?.state ?? 'locked';
    if (rState !== 'bidding' && rState !== 'playing') return;
    const trickInProgress = (sp.trickPlays?.length ?? 0) > 0;
    if (trickInProgress || sp.reveal) return;
    if (activePlayers.length < 2) return;
    void onDeal();
  }, [
    ready,
    isBatchPending,
    spTrump,
    spOrder,
    sp.hands,
    sp.trickPlays,
    sp.reveal,
    state.rounds,
    spRoundNo,
    activePlayers.length,
  ]);

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
    currentRoundNo: spRoundNo,
    appendMany: (evts) => {
      // adapt to engine's readonly signature and void return type
      return Promise.resolve(appendMany([...evts])).then(() => undefined);
    },
    isBatchPending,
    rng: rngRef.current,
    onAdvance: (_nextRound, nextDealerId) => {
      const idx = Math.max(
        0,
        players.findIndex((p) => p === nextDealerId),
      );
      setDealerIdx(idx);
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

  return <SinglePlayerMobile humanId={human} rng={rngRef.current} />;
}
