import * as React from 'react';
import type { AppEvent, AppState } from '@/lib/state/types';
import type { KnownAppEvent } from '@/lib/state/types';
import { selectSpIsRoundDone, selectSpNextToPlay } from '@/lib/state/selectors-sp';
import {
  prefillPrecedingBotBids,
  computeBotPlay,
  resolveCompletedTrick,
  finalizeRoundIfDone,
} from './engine';

function isSpDeal(e: AppEvent): e is KnownAppEvent<'sp/deal'> {
  return (e as { type?: string }).type === 'sp/deal';
}

export type UseEngineParams = {
  state: AppState;
  humanId: string;
  currentRoundNo: number;
  appendMany: (events: ReadonlyArray<AppEvent>) => Promise<void> | void;
  isBatchPending: boolean;
  rng?: () => number;
  onAdvance?: (nextRound: number, nextDealerId: string) => void;
  onSaved?: () => void;
};

export function useSinglePlayerEngine(params: UseEngineParams): void {
  const { state, humanId, currentRoundNo, appendMany, isBatchPending, rng, onAdvance, onSaved } =
    params;

  const phase = state.sp.phase;
  const hasDeal = !!state.sp.trump && (state.sp.order?.length ?? 0) > 0;

  const isRoundDone = selectSpIsRoundDone(state);

  // During bidding, auto-bid preceding bots so their bids are visible
  React.useEffect(() => {
    if (!hasDeal) return;
    if (isBatchPending) return;
    const rState = state.rounds[currentRoundNo]?.state;
    if (rState !== 'bidding') return;
    const batch = prefillPrecedingBotBids(state, currentRoundNo, humanId, rng);
    if (batch.length > 0) void appendMany(batch);
  }, [state, currentRoundNo, humanId, rng, appendMany, hasDeal, isBatchPending]);

  // Bot plays during playing phase
  React.useEffect(() => {
    if (phase !== 'playing') return;
    if (!hasDeal) return;
    if (isBatchPending) return;
    if (state.sp.reveal) return; // pause bot plays during reveal
    if (isRoundDone) return;
    const next = selectSpNextToPlay(state);
    if (!next || next === humanId) return;
    const batch = computeBotPlay(state, next, rng);
    if (batch.length === 0) return;
    const t = setTimeout(() => void appendMany(batch), 250);
    return () => clearTimeout(t);
  }, [state, phase, humanId, rng, appendMany, hasDeal, isBatchPending, isRoundDone]);

  // Resolve completed trick
  React.useEffect(() => {
    if (phase !== 'playing') return;
    if (!hasDeal) return;
    if (isBatchPending) return;
    const batch = resolveCompletedTrick(state);
    if (batch.length === 0) return;
    const t = setTimeout(() => void appendMany(batch), 400);
    return () => clearTimeout(t);
  }, [state, phase, appendMany, hasDeal, isBatchPending]);

  // Finalize round when done; may also advance to next round
  React.useEffect(() => {
    if (!isRoundDone) return;
    if (isBatchPending) return;
    const batch = finalizeRoundIfDone(state, { now: Date.now() });
    if (batch.length === 0) return;
    void (async () => {
      await appendMany(batch);
      // Notify UI of advancement if present by inspecting the batch
      const nextDeal = batch.find(isSpDeal);
      if (nextDeal && onAdvance) onAdvance(nextDeal.payload.roundNo, nextDeal.payload.dealerId);
      if (onSaved) onSaved();
    })();
  }, [state, isRoundDone, isBatchPending, appendMany, onAdvance, onSaved]);
}
