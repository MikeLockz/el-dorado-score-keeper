import { describe, it, expect } from 'vitest';

import { generateMetadata as spLiveMetadata } from '@/app/single-player/[gameId]/page';
import { generateMetadata as spScorecardMetadata } from '@/app/single-player/[gameId]/scorecard/page';
import { generateMetadata as spSummaryMetadata } from '@/app/single-player/[gameId]/summary/page';
import { generateMetadata as scorecardLiveMetadata } from '@/app/scorecard/[scorecardId]/page';
import { generateMetadata as scorecardSummaryMetadata } from '@/app/scorecard/[scorecardId]/summary/page';
import { generateMetadata as playerDetailMetadata } from '@/app/players/[playerId]/page';
import { generateMetadata as rosterDetailMetadata } from '@/app/rosters/[rosterId]/page';
import { generateMetadata as gameDetailMetadata } from '@/app/games/[gameId]/page';

const ctx = <T extends Record<string, unknown>>(params: T) => ({ params } as { params: T });

describe('URL view metadata', () => {
  it('includes game id in single-player live metadata', async () => {
    const result = await spLiveMetadata(ctx({ gameId: 'abc123' }));
    expect(result.title).toContain('abc123');
    expect(result.openGraph?.url).toBe('/single-player/abc123');
  });

  it('includes sub-route metadata for single-player scorecard and summary', async () => {
    const scorecard = await spScorecardMetadata(ctx({ gameId: 'game-1' }));
    const summary = await spSummaryMetadata(ctx({ gameId: 'game-1' }));
    expect(scorecard.title).toContain('game-1');
    expect(scorecard.openGraph?.url).toBe('/single-player/game-1/scorecard');
    expect(summary.title).toContain('game-1');
    expect(summary.openGraph?.url).toBe('/single-player/game-1/summary');
  });

  it('produces scorecard metadata with session id', async () => {
    const live = await scorecardLiveMetadata(ctx({ scorecardId: 'session-9' }));
    const summary = await scorecardSummaryMetadata(ctx({ scorecardId: 'session-9' }));
    expect(live.title).toContain('session-9');
    expect(summary.title).toContain('session-9');
    expect(summary.openGraph?.url).toBe('/scorecard/session-9/summary');
  });

  it('embeds entity ids for player and roster detail pages', async () => {
    const player = await playerDetailMetadata(ctx({ playerId: 'player-42' }));
    const roster = await rosterDetailMetadata(ctx({ rosterId: 'roster-99' }));
    expect(player.title).toContain('player-42');
    expect(player.openGraph?.url).toBe('/players/player-42');
    expect(roster.title).toContain('roster-99');
    expect(roster.openGraph?.url).toBe('/rosters/roster-99');
  });

  it('produces archived game metadata', async () => {
    const meta = await gameDetailMetadata(ctx({ gameId: 'archived-1' }));
    expect(meta.title).toContain('archived-1');
    expect(meta.openGraph?.url).toBe('/games/archived-1');
  });
});
