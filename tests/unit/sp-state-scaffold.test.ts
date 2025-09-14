import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, type AppState } from '@/lib/state/types';
import { payloadSchemas, validateEventStrict } from '@/lib/state/validation';
import { makeEvent } from '@/lib/state/events';
import { selectPrimaryCTA, selectSummaryData } from '@/lib/state/selectors-sp';

const now = 1_700_000_000_000;

describe('SP Phase 1 scaffolding', () => {
  it('adds new sp fields with sensible defaults', () => {
    const s: AppState = INITIAL_STATE;
    expect(s.sp.handPhase).toBe('idle');
    expect(s.sp.lastTrickSnapshot).toBeNull();
    // optional timestamp should be absent by default
    expect('summaryEnteredAt' in s.sp ? s.sp.summaryEnteredAt : undefined).toBeUndefined();
  });

  it('validation accepts extended sp/phase-set values', () => {
    const schema = payloadSchemas['sp/phase-set'];
    const phases = ['setup', 'bidding', 'playing', 'summary', 'game-summary', 'done'] as const;
    for (const p of phases) {
      const parsed = schema.safeParse({ phase: p });
      expect(parsed.success).toBe(true);
      // also ensure validateEventStrict accepts the event
      const e = validateEventStrict(
        makeEvent('sp/phase-set', { phase: p }, { ts: now, eventId: `ph-${p}` }),
      );
      expect(e.type).toBe('sp/phase-set');
    }
  });

  it('stub selectors are present and return structured defaults', () => {
    const s = INITIAL_STATE;
    const cta = selectPrimaryCTA(s);
    expect(cta).toEqual({ label: 'Continue', kind: 'none' });

    const sum = selectSummaryData(s);
    expect(sum.round).toBeNull();
    expect(sum.dealerId).toBeNull();
    expect(sum.trump).toBeNull();
    expect(Array.isArray(sum.players)).toBe(true);
  });
});
