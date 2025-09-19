import type { AppEvent, KnownAppEvent } from '@/lib/state';

export type SpCtaStage =
  | 'idle'
  | 'continue'
  | 'reveal'
  | 'next-hand'
  | 'next-round'
  | 'new-game'
  | 'finalizing';

export type SpCtaMeta = {
  stage: SpCtaStage;
  label: string;
  autoWait: boolean;
};

type DeriveOpts = {
  totalTricksSoFar: number;
  tricksThisRound: number;
  isFinalRound: boolean;
};

function isKnownEventOfType<T extends AppEvent['type']>(
  event: AppEvent,
  type: T,
): event is KnownAppEvent<T> {
  return event.type === type;
}

export function deriveSpCtaMeta(
  batch: ReadonlyArray<AppEvent>,
  opts: DeriveOpts,
): SpCtaMeta {
  const { totalTricksSoFar, tricksThisRound, isFinalRound } = opts;
  if (!Array.isArray(batch) || batch.length === 0) {
    return { stage: 'idle', label: 'Continue', autoWait: false };
  }

  if (batch.some((evt) => evt.type === 'sp/trick/reveal-set')) {
    return { stage: 'reveal', label: 'Revealing...', autoWait: true };
  }

  if (batch.some((evt) => evt.type === 'sp/trick/cleared')) {
    const roundComplete = tricksThisRound > 0 && totalTricksSoFar >= tricksThisRound;
    if (roundComplete) {
      return isFinalRound
        ? { stage: 'new-game', label: 'New Game', autoWait: false }
        : { stage: 'next-round', label: 'Next Round', autoWait: false };
    }
    return { stage: 'next-hand', label: 'Next Hand', autoWait: false };
  }

  const phaseSet = batch.find((evt): evt is KnownAppEvent<'sp/phase-set'> =>
    isKnownEventOfType(evt, 'sp/phase-set'),
  );
  if (phaseSet?.payload?.phase === 'summary') {
    return { stage: 'next-round', label: 'Next Round', autoWait: false };
  }
  if (phaseSet?.payload?.phase === 'game-summary') {
    return { stage: 'new-game', label: 'New Game', autoWait: false };
  }

  if (batch.some((evt) => evt.type === 'sp/deal')) {
    return { stage: 'next-round', label: 'Next Round', autoWait: false };
  }

  if (batch.some((evt) => evt.type === 'round/finalize')) {
    return { stage: 'finalizing', label: 'Finalizing...', autoWait: true };
  }

  return { stage: 'continue', label: 'Continue', autoWait: false };
}
