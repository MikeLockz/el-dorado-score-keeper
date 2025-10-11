import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ScorecardSummaryPage from '@/app/scorecard/[scorecardId]/summary/page';
import { INITIAL_STATE } from '@/lib/state';
import * as analytics from '@/lib/observability/events';

const setMockAppState = (globalThis as any).__setMockAppState as (value: any) => void;
const setMockParams = (globalThis as any).__setMockParams as (
  params: Record<string, string>,
) => void;

const originalWindow = globalThis.window;
let originalPrint: typeof window.print | undefined;

function buildAppState() {
  const state = structuredClone(INITIAL_STATE);
  (state as any).rosters = {
    'roster-1': {
      name: 'Squad Alpha',
      playersById: { p1: 'Alice', p2: 'Bob' },
      displayOrder: { p1: 0, p2: 1 },
      type: 'scorecard',
      createdAt: Date.now(),
    },
  };
  (state as any).scores = { p1: 42, p2: 38 };
  return state;
}

describe('scorecard summary export', () => {
  beforeEach(() => {
    const context = {
      state: buildAppState(),
      height: 0,
      ready: true,
      append: vi.fn(),
      appendMany: vi.fn(),
      isBatchPending: false,
      previewAt: vi.fn(),
      warnings: [],
      clearWarnings: vi.fn(),
      timeTravelHeight: null,
      setTimeTravelHeight: vi.fn(),
      timeTraveling: false,
      context: { mode: 'scorecard', gameId: null, scorecardId: 'roster-1' },
    };
    setMockAppState(context);
    setMockParams({ scorecardId: 'roster-1' });
    originalPrint = originalWindow?.print;
  });

  afterEach(() => {
    if (originalWindow && originalPrint) {
      originalWindow.print = originalPrint;
    }
    vi.restoreAllMocks();
  });

  it('tracks export analytics when printing summary', async () => {
    const printSpy = vi.fn();
    if (originalWindow) {
      originalWindow.print = printSpy as typeof window.print;
    }

    const trackSummaryExportSpy = vi.spyOn(analytics, 'trackScorecardSummaryExport');

    render(<ScorecardSummaryPage />);

    await waitFor(() => expect(screen.getByText('Score totals')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Print summary' }));

    expect(trackSummaryExportSpy).toHaveBeenCalledWith({
      scorecardId: 'roster-1',
      format: 'print',
      source: 'scorecard.summary.page',
    });
    expect(printSpy).toHaveBeenCalled();
  });
});
