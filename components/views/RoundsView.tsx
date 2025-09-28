'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Plus, Minus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import clsx from 'clsx';
import React from 'react';

import styles from './rounds-view.module.scss';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type RoundState = 'locked' | 'bidding' | 'complete' | 'scored';

function labelForRoundState(s: RoundState) {
  return s === 'locked'
    ? 'Locked'
    : s === 'bidding'
      ? 'Active'
      : s === 'complete'
        ? 'Complete'
        : 'Scored';
}

function getRoundStateClass(state: RoundState) {
  switch (state) {
    case 'locked':
      return styles.roundStateLocked;
    case 'bidding':
      return styles.roundStateBidding;
    case 'complete':
      return styles.roundStateComplete;
    case 'scored':
      return styles.roundStateScored;
  }
}

function getPlayerCellClass(state: RoundState) {
  switch (state) {
    case 'locked':
      return styles.playerCellLocked;
    case 'bidding':
      return styles.playerCellBidding;
    case 'complete':
      return styles.playerCellComplete;
    case 'scored':
      return styles.playerCellScored;
    default:
      return styles.playerCellLocked;
  }
}

export default function RoundsView() {
  const { state, append } = useAppState();
  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }));

  const incrementBid = async (round: number, playerId: string, max: number) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0;
    const next = Math.min(max, current + 1);
    if (next !== current)
      await append({
        type: 'bid/set',
        payload: { round, playerId, bid: next },
        eventId: uuid(),
        ts: Date.now(),
      });
  };
  const decrementBid = async (round: number, playerId: string) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0;
    const next = Math.max(0, current - 1);
    if (next !== current)
      await append({
        type: 'bid/set',
        payload: { round, playerId, bid: next },
        eventId: uuid(),
        ts: Date.now(),
      });
  };
  const toggleMade = async (round: number, playerId: string, made: boolean) => {
    await append({
      type: 'made/set',
      payload: { round, playerId, made },
      eventId: uuid(),
      ts: Date.now(),
    });
  };

  function PlayerCell({
    roundNum,
    tricks,
    playerId,
    playerName,
  }: {
    roundNum: number;
    tricks: number;
    playerId: string;
    playerName: string;
  }) {
    const rState = (state.rounds[roundNum]?.state ?? 'locked') as RoundState;
    const bid = state.rounds[roundNum]?.bids[playerId] ?? 0;
    const made = state.rounds[roundNum]?.made[playerId] ?? null;
    const max = tricks;
    return (
      <div
        key={`${roundNum}-${playerId}`}
        className={clsx(styles.playerCell, getPlayerCellClass(rState))}
      >
        {rState === 'locked' && (
          <>
            <div className={styles.placeholderRow}>
              <span>-</span>
            </div>
            <div className={styles.infoRow}>
              <span>-</span>
            </div>
          </>
        )}
        {rState === 'bidding' && (
          <>
            <div className={styles.bidControls}>
              <Button
                size="sm"
                variant="outline"
                className={styles.bidButton}
                onClick={() => decrementBid(roundNum, playerId)}
                disabled={bid <= 0}
              >
                <Minus className={styles.iconTiny} />
              </Button>
              <span className={styles.bidValue}>{bid}</span>
              <Button
                size="sm"
                variant="outline"
                className={styles.bidButton}
                onClick={() => incrementBid(roundNum, playerId, max)}
                disabled={bid >= max}
              >
                <Plus className={styles.iconTiny} />
              </Button>
            </div>
            <div className={styles.bidSummary}>
              <span className={styles.bidLabel}>Bid</span>
              <span className={styles.bidCurrent}>{bid}</span>
            </div>
          </>
        )}
        {rState === 'complete' && (
          <>
            <div className={styles.completeSummary}>Bid: {bid}</div>
            <div className={styles.completeControls}>
              <button
                type="button"
                className={clsx(styles.completeButton, made === true && styles.completeButtonActive)}
                onClick={() => toggleMade(roundNum, playerId, true)}
                aria-pressed={made === true}
                aria-label={`Mark made for ${playerName}`}
              >
                <Check className={styles.iconSmall} />
              </button>
              <button
                type="button"
                className={clsx(
                  styles.completeButton,
                  styles.completeButtonMiss,
                  made === false && styles.completeButtonActive,
                )}
                onClick={() => toggleMade(roundNum, playerId, false)}
                aria-pressed={made === false}
                aria-label={`Mark missed for ${playerName}`}
              >
                <X className={styles.iconSmall} />
              </button>
            </div>
          </>
        )}
        {rState === 'scored' && (
          <>
            <div className={styles.scoredSummary}>
              <span>{made ? 'Made' : 'Missed'}</span>
              <span>Bid: {bid}</span>
            </div>
            <div className={styles.scoredTotals}>
              <span
                className={clsx(
                  made ? styles.scoredValuePositive : styles.scoredValueNegative,
                )}
              >
                {(made ? 1 : -1) * (5 + bid)}
              </span>
              <span className={styles.scoreTotal}>{state.scores[playerId] ?? 0}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  const cycleRoundState = async (round: number) => {
    const current = state.rounds[round]?.state ?? 'locked';
    if (current === 'locked') return;
    if (current === 'bidding') {
      await append({
        type: 'round/state-set',
        payload: { round, state: 'complete' },
        eventId: uuid(),
        ts: Date.now(),
      });
      return;
    }
    if (current === 'complete') {
      const allMarked = players.every((p) => (state.rounds[round]?.made[p.id] ?? null) !== null);
      if (allMarked) {
        await append({
          type: 'round/finalize',
          payload: { round },
          eventId: uuid(),
          ts: Date.now(),
        });
      }
      return;
    }
    if (current === 'scored') {
      await append({
        type: 'round/state-set',
        payload: { round, state: 'bidding' },
        eventId: uuid(),
        ts: Date.now(),
      });
    }
  };

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Rounds</h1>
      <Card className={styles.card}>
        {/* Header row */}
        <div
          className={styles.gridHeader}
          style={{ gridTemplateColumns: `3rem repeat(${players.length}, 1fr)` }}
        >
          <div className={styles.gridHeaderCell}>
            Rd
          </div>
          {players.map((p) => (
            <div
              key={p.id}
              className={styles.gridHeaderCell}
            >
              {p.name.substring(0, 2)}
            </div>
          ))}
        </div>

        {/* Per-round rows as their own grids to avoid wrapping across rounds */}
        {Array.from({ length: 10 }, (_, i) => ({ round: i + 1, tricks: 10 - i })).map((round) => (
          <div
            key={round.round}
            className={styles.roundRow}
            style={{ gridTemplateColumns: `3rem repeat(${players.length}, 1fr)` }}
          >
            <div
              className={clsx(
                styles.roundCell,
                getRoundStateClass((state.rounds[round.round]?.state ?? 'locked') as RoundState),
              )}
              onClick={() => cycleRoundState(round.round)}
            >
              <div className={styles.roundStateValue}>{round.tricks}</div>
              <div className={styles.roundStateLabel}>
                {labelForRoundState((state.rounds[round.round]?.state ?? 'locked') as RoundState)}
              </div>
            </div>
            {players.map((p) => (
              <PlayerCell
                key={`${round.round}-${p.id}`}
                roundNum={round.round}
                tricks={round.tricks}
                playerId={p.id}
                playerName={p.name}
              />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
