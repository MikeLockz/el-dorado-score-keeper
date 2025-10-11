import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RouteHydrationContext } from '@/lib/state';

let deriveRouteContext: (pathname: string | null) => RouteHydrationContext;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/components/state-provider')>(
    '@/components/state-provider',
  );
  deriveRouteContext = actual.deriveRouteContext;
});

describe('deriveRouteContext', () => {
  it('detects single-player game routes', () => {
    const ctx = deriveRouteContext('/single-player/abc123');
    expect(ctx).toEqual({ mode: 'single-player', gameId: 'abc123', scorecardId: null });
  });

  it('ignores reserved single-player segments', () => {
    const ctx = deriveRouteContext('/single-player/new');
    expect(ctx).toEqual({ mode: null, gameId: null, scorecardId: null });
  });

  it('rejects malformed ids', () => {
    const ctx = deriveRouteContext('/single-player/xyz');
    expect(ctx).toEqual({ mode: null, gameId: null, scorecardId: null });
  });

  it('detects scorecard routes', () => {
    const ctx = deriveRouteContext('/scorecard/ABC123');
    expect(ctx).toEqual({ mode: 'scorecard', gameId: null, scorecardId: 'ABC123' });
  });

  it('ignores scorecard reserved segments', () => {
    const ctx = deriveRouteContext('/scorecard/new');
    expect(ctx).toEqual({ mode: null, gameId: null, scorecardId: null });
  });

  it('falls back to default for unrelated paths', () => {
    expect(deriveRouteContext('/players/123')).toEqual({ mode: null, gameId: null, scorecardId: null });
    expect(deriveRouteContext('/')).toEqual({ mode: null, gameId: null, scorecardId: null });
  });
});
