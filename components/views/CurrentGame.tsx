'use client';

import React from 'react';
import { useAppState } from '@/components/state-provider';
import {
  events,
  ROUNDS_TOTAL,
  selectCumulativeScoresAllRounds,
  selectPlayersOrdered,
  selectRoundInfosAll,
  tricksForRound,
} from '@/lib/state';
import type { RoundState } from '@/lib/state';
import ScorecardGrid, {
  LiveOverlay,
  ScorecardPlayerColumn,
  ScorecardRoundEntry,
  ScorecardRoundView,
} from './scorecard/ScorecardGrid';

type Props = {
  live?: LiveOverlay;
  biddingInteractiveIds?: string[];
  onConfirmBid?: (round: number, playerId: string, bid: number) => void;
  disableRoundStateCycling?: boolean;
  disableInputs?: boolean;
};

export default function CurrentGame({
  live,
  biddingInteractiveIds,
  onConfirmBid,
  disableRoundStateCycling,
  disableInputs,
}: Props) {
  const { state, append, ready } = useAppState();
  const players = selectPlayersOrdered(state);

  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundInfoByRound = React.useMemo(() => selectRoundInfosAll(state), [state]);

  const DEFAULT_COLUMNS = 4;
  const columns: ScorecardPlayerColumn[] = React.useMemo(() => {
    if (!ready) {
      return Array.from({ length: DEFAULT_COLUMNS }, (_, idx) => ({
        id: `placeholder-${idx}`,
        name: '-',
        placeholder: true,
      }));
    }
    return players.map((player) => ({ id: player.id, name: player.name }));
  }, [players, ready]);

  const rounds: ScorecardRoundView[] = React.useMemo(() => {
    return Array.from({ length: ROUNDS_TOTAL }, (_, index) => {
      const roundNumber = index + 1;
      const roundData = state.rounds[roundNumber];
      const info = roundInfoByRound[roundNumber];
      const stateValue: RoundState = roundData?.state ?? 'locked';
      const entries: Record<string, ScorecardRoundEntry> = {};

      for (const column of columns) {
        if (column.placeholder) {
          entries[column.id] = {
            bid: 0,
            made: null,
            present: false,
            cumulative: 0,
            placeholder: true,
            taken: null,
          };
          continue;
        }
        const present = roundData?.present?.[column.id] !== false;
        const bid = present ? (roundData?.bids?.[column.id] ?? 0) : 0;
        const made = present ? (roundData?.made?.[column.id] ?? null) : null;
        const cumulative = totalsByRound[roundNumber]?.[column.id] ?? 0;
        const taken = live?.counts?.[column.id] ?? null;
        entries[column.id] = { bid, made, present, cumulative, taken };
      }

      return {
        round: roundNumber,
        tricks: info?.tricks ?? tricksForRound(roundNumber),
        state: stateValue,
        info: {
          sumBids: info?.sumBids ?? 0,
          overUnder: info?.overUnder ?? 'match',
          showBidChip: stateValue === 'bidding' || stateValue === 'scored',
        },
        entries,
      };
    });
  }, [columns, live, roundInfoByRound, state.rounds, totalsByRound]);

  const incrementBid = React.useCallback(
    async (round: number, playerId: string, max: number) => {
      const current = state.rounds[round]?.bids[playerId] ?? 0;
      const next = Math.min(max, current + 1);
      if (next !== current) await append(events.bidSet({ round, playerId, bid: next }));
    },
    [append, state.rounds],
  );

  const decrementBid = React.useCallback(
    async (round: number, playerId: string) => {
      const current = state.rounds[round]?.bids[playerId] ?? 0;
      const next = Math.max(0, current - 1);
      if (next !== current) await append(events.bidSet({ round, playerId, bid: next }));
    },
    [append, state.rounds],
  );

  const toggleMade = React.useCallback(
    async (round: number, playerId: string, desired: boolean) => {
      const current = state.rounds[round]?.made[playerId] ?? null;
      const next = current === desired ? null : desired;
      await append(events.madeSet({ round, playerId, made: next }));
    },
    [append, state.rounds],
  );

  const cycleRoundState = React.useCallback(
    async (round: number) => {
      if (disableRoundStateCycling) return;
      const current = state.rounds[round]?.state ?? 'locked';
      if (current === 'locked') return;
      if (current === 'bidding') {
        await append(events.roundStateSet({ round, state: 'complete' }));
        return;
      }
      if (current === 'playing') {
        await append(events.roundStateSet({ round, state: 'complete' }));
        return;
      }
      if (current === 'complete') {
        const roundData = state.rounds[round];
        const allMarked = players.every(
          (player) =>
            roundData?.present?.[player.id] === false ||
            (roundData?.made?.[player.id] ?? null) !== null,
        );
        if (!allMarked) return;
        await append(events.roundFinalize({ round }));
        return;
      }
      if (current === 'scored') {
        await append(events.roundStateSet({ round, state: 'bidding' }));
      }
    },
    [append, disableRoundStateCycling, players, state.rounds],
  );

  const handleIncrementBid = React.useCallback(
    (round: number, playerId: string, max: number) => {
      void incrementBid(round, playerId, max);
    },
    [incrementBid],
  );

  const handleDecrementBid = React.useCallback(
    (round: number, playerId: string) => {
      void decrementBid(round, playerId);
    },
    [decrementBid],
  );

  const handleToggleMade = React.useCallback(
    (round: number, playerId: string, desired: boolean) => {
      void toggleMade(round, playerId, desired);
    },
    [toggleMade],
  );

  const handleCycleRoundState = React.useCallback(
    (round: number) => {
      void cycleRoundState(round);
    },
    [cycleRoundState],
  );

  return (
    <ScorecardGrid
      columns={columns}
      rounds={rounds}
      live={live}
      revealWinnerId={state.sp?.reveal?.winnerId ?? null}
      biddingInteractiveIds={biddingInteractiveIds}
      disableRoundStateCycling={disableRoundStateCycling}
      disableInputs={disableInputs}
      onCycleRoundState={handleCycleRoundState}
      onIncrementBid={handleIncrementBid}
      onDecrementBid={handleDecrementBid}
      onToggleMade={handleToggleMade}
      onConfirmBid={onConfirmBid}
    />
  );
}
