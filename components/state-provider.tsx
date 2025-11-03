'use client';
import React from 'react';
import { usePathname } from 'next/navigation';

declare global {
  // Debug globals available in development builds
  var __APP_STATE__: AppState | null | undefined;
  var __APP_HEIGHT__: number | undefined;
  var __append: ((e: AppEvent) => Promise<number>) | undefined;
  var __appendMany: ((evts: AppEvent[]) => Promise<number>) | undefined;
  var __dumpState: (() => void) | undefined;
  var __SET_TT: ((h: number | null) => void) | undefined;
}
import {
  createInstance,
  type AppEvent,
  type AppState,
  INITIAL_STATE,
  previewAt as previewFromDB,
  events,
  type RouteHydrationContext,
} from '@/lib/state';

const DEFAULT_ROUTE_CONTEXT: RouteHydrationContext = Object.freeze({
  mode: null,
  gameId: null,
  scorecardId: null,
});

const SINGLE_PLAYER_RESERVED_SEGMENTS = new Set(['new']);
const SCORECARD_RESERVED_SEGMENTS = new Set(['new']);
// Route IDs only support UUID format
// UUID format: 8-4-4-4-12 hex characters (e.g., "550e8400-e29b-41d4-a716-446655440000")
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeId(candidate: unknown, reserved: Set<string>): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (reserved.has(trimmed)) return null;

  // Only support UUID format - reject sp-### format (will trigger "game not found")
  if (UUID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function deriveRouteContext(pathname: string | null): RouteHydrationContext {
  if (!pathname) return DEFAULT_ROUTE_CONTEXT;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return DEFAULT_ROUTE_CONTEXT;
  const [root, candidate] = segments;
  if (root === 'single-player') {
    const id = normalizeId(candidate, SINGLE_PLAYER_RESERVED_SEGMENTS);
    if (!id) return DEFAULT_ROUTE_CONTEXT;
    return { mode: 'single-player', gameId: id, scorecardId: null };
  }
  if (root === 'scorecard') {
    const id = normalizeId(candidate, SCORECARD_RESERVED_SEGMENTS);
    if (!id) return DEFAULT_ROUTE_CONTEXT;
    return { mode: 'scorecard', gameId: null, scorecardId: id };
  }
  return DEFAULT_ROUTE_CONTEXT;
}

type Warning = { code: string; info?: unknown; at: number };

type Ctx = {
  state: AppState;
  height: number;
  ready: boolean;
  append: (e: AppEvent) => Promise<number>;
  appendMany: (events: AppEvent[]) => Promise<number>;
  isBatchPending: boolean;
  previewAt: (height: number) => Promise<AppState>;
  warnings: Warning[];
  clearWarnings: () => void;
  timeTravelHeight: number | null;
  setTimeTravelHeight: (h: number | null) => void;
  timeTraveling: boolean;
  context: RouteHydrationContext;
  hydrationEpoch: number;
  isHydrating: boolean;
  awaitHydration: (epoch?: number) => Promise<void>;
};

const StateCtx = React.createContext<Ctx | null>(null);

export function StateProvider({
  children,
  onWarn,
}: {
  children: React.ReactNode;
  onWarn?: (code: string, info?: unknown) => void;
}) {
  const pathname = usePathname();
  const routeContext = React.useMemo(() => deriveRouteContext(pathname ?? null), [pathname]);
  const initialRouteContextRef = React.useRef<RouteHydrationContext>(routeContext);
  const prevRouteContextRef = React.useRef<RouteHydrationContext>(routeContext);
  const [state, setState] = React.useState<AppState>(INITIAL_STATE);
  const [height, setHeight] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [pendingBatches, setPendingBatches] = React.useState(0);
  const [warnings, setWarnings] = React.useState<Warning[]>([]);
  const [ttHeight, setTtHeight] = React.useState<number | null>(null);
  const [ttState, setTtState] = React.useState<AppState | null>(null);
  const [hydrationEpoch, setHydrationEpoch] = React.useState(0);
  const [hydrating, setHydrating] = React.useState(false);
  const instRef = React.useRef<Awaited<ReturnType<typeof createInstance>> | null>(null);
  const dbNameRef = React.useRef<string>('app-db');
  const hydrationWaitersRef = React.useRef<Array<{ epoch: number; resolve: () => void }>>([]);

  // Keep a ref to onWarn to avoid re-creating the instance on prop changes
  const onWarnRef = React.useRef<typeof onWarn>(onWarn);
  React.useEffect(() => {
    onWarnRef.current = onWarn;
  }, [onWarn]);

  const resolveHydrationWaiters = React.useCallback((epoch: number) => {
    hydrationWaitersRef.current = hydrationWaitersRef.current.filter((waiter) => {
      if (epoch > waiter.epoch) {
        try {
          waiter.resolve();
        } catch {}
        return false;
      }
      return true;
    });
  }, []);

  React.useEffect(() => {
    initialRouteContextRef.current = routeContext;
  }, [routeContext]);

  React.useEffect(() => {
    let unsubscribeState: (() => void) | null = null;
    let unsubscribeHydration: (() => void) | null = null;
    let closed = false;
    void (async () => {
      const initialContext = initialRouteContextRef.current;
      const initialSpGameId =
        initialContext.mode === 'single-player' ? initialContext.gameId : null;
      const inst = await createInstance({
        dbName: dbNameRef.current,
        channelName: 'app-events',
        onWarn: (code, info) => {
          const w: Warning = { code, info, at: Date.now() };
          setWarnings((prev) => [w, ...prev].slice(0, 20));
          try {
            onWarnRef.current?.(code, info);
          } catch {}
        },
        routeContext: initialContext,
        spGameId: initialSpGameId,
      });
      if (closed) {
        inst.close();
        return;
      }
      instRef.current = inst;
      prevRouteContextRef.current = initialRouteContextRef.current;
      setHydrationEpoch(inst.getHydrationEpoch());
      setHydrating(inst.isHydrating());
      resolveHydrationWaiters(inst.getHydrationEpoch());
      unsubscribeHydration = inst.subscribeHydration((event) => {
        if (event.status === 'start') {
          setHydrating(true);
          return;
        }
        setHydrating(false);
        setHydrationEpoch(event.epoch);
        resolveHydrationWaiters(event.epoch);
      });
      // Mark initial state set and subsequent stream updates as transitions to
      // keep input responsive during rapid event bursts (e.g., bid spamming).
      React.startTransition(() => {
        setState(inst.getState());
        setHeight(inst.getHeight());
        setReady(true);
      });
      unsubscribeState = inst.subscribe((s, h) => {
        React.startTransition(() => {
          setState(s);
          setHeight(h);
        });
      });
    })();
    return () => {
      closed = true;
      try {
        unsubscribeState?.();
      } catch {}
      try {
        unsubscribeHydration?.();
      } catch {}
      try {
        instRef.current?.close();
      } catch {}
      instRef.current = null;
      hydrationWaitersRef.current.forEach((waiter) => {
        try {
          waiter.resolve();
        } catch {}
      });
      hydrationWaitersRef.current = [];
    };
  }, [resolveHydrationWaiters]);

  React.useEffect(() => {
    const prev = prevRouteContextRef.current;
    if (
      prev.mode === routeContext.mode &&
      prev.gameId === routeContext.gameId &&
      prev.scorecardId === routeContext.scorecardId
    ) {
      return;
    }
    prevRouteContextRef.current = routeContext;
    const inst = instRef.current;
    if (!inst) return;
    void inst.rehydrate({ routeContext, allowLocalFallback: true });
  }, [routeContext]);

  const append = React.useCallback(async (e: AppEvent) => {
    if (!instRef.current) throw new Error('State instance not ready');
    return instRef.current.append(e);
  }, []);

  const appendMany = React.useCallback(async (evts: AppEvent[]) => {
    if (!instRef.current) throw new Error('State instance not ready');
    setPendingBatches((n) => n + 1);
    try {
      return await instRef.current.appendMany(evts);
    } finally {
      setPendingBatches((n) => Math.max(0, n - 1));
    }
  }, []);

  async function previewAt(h: number): Promise<AppState> {
    if (h === height) return state;
    return previewFromDB(dbNameRef.current, h);
  }

  const awaitHydration = React.useCallback(
    (targetEpoch?: number) => {
      const target = typeof targetEpoch === 'number' ? targetEpoch : hydrationEpoch;
      if (hydrationEpoch > target) {
        return Promise.resolve();
      }
      if (hydrationEpoch === target && !hydrating) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        hydrationWaitersRef.current = [...hydrationWaitersRef.current, { epoch: target, resolve }];
      });
    },
    [hydrationEpoch, hydrating],
  );

  // Time-travel: compute a read-only preview state at a given height and expose it as the visible state
  React.useEffect(() => {
    if (ttHeight == null) {
      setTtState(null);
      return;
    }
    let closed = false;
    void (async () => {
      try {
        const s = await previewFromDB(dbNameRef.current, ttHeight);
        if (!closed) setTtState(s);
      } catch (e) {
        setWarnings((prev) =>
          [{ code: 'timetravel.preview_failed', info: String(e), at: Date.now() }, ...prev].slice(
            0,
            20,
          ),
        );
      }
    })();
    return () => {
      closed = true;
    };
  }, [ttHeight]);

  // Seed default players on a truly fresh DB (height 0, no players)
  const seedingRef = React.useRef(false);
  React.useEffect(() => {
    if (!ready || seedingRef.current) return;
    if (height !== 0) return;
    if (Object.keys(state.players || {}).length > 0) return;
    seedingRef.current = true;
    void (async () => {
      const inst = instRef.current;
      if (!inst) {
        seedingRef.current = false;
        return;
      }
      const names = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
      const ids = ['p1', 'p2', 'p3', 'p4'];
      try {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]!;
          const name = names[i]!;
          await inst.append(
            events.playerAdded(
              { id, name, type: 'human' },
              { eventId: `seed:${id}`, ts: Date.now() + i },
            ),
          );
        }
      } finally {
        seedingRef.current = false;
      }
    })();
  }, [ready, height, state.players]);

  const value: Ctx = {
    state: ttState ?? state,
    height,
    ready,
    append,
    appendMany,
    isBatchPending: pendingBatches > 0,
    previewAt,
    warnings,
    clearWarnings: () => setWarnings([]),
    timeTravelHeight: ttHeight,
    setTimeTravelHeight: setTtHeight,
    timeTraveling: ttHeight != null,
    context: routeContext,
    hydrationEpoch,
    isHydrating: hydrating,
    awaitHydration,
  };
  // Expose simple debug helpers in dev
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    try {
      globalThis.__APP_STATE__ = ttState ?? state;
      globalThis.__APP_HEIGHT__ = height;
      globalThis.__append = append;
      globalThis.__appendMany = appendMany;
      globalThis.__dumpState = () =>
        console.log('[app state]', JSON.parse(JSON.stringify(ttState ?? state)));
      globalThis.__SET_TT = (h: number | null) => setTtHeight(h);
      (globalThis as { __APP_ROUTE_CONTEXT__?: RouteHydrationContext }).__APP_ROUTE_CONTEXT__ =
        routeContext;
      (globalThis as { __APP_WARNINGS__?: Warning[] }).__APP_WARNINGS__ = warnings;
      (globalThis as { __HYDRATION_EPOCH__?: number }).__HYDRATION_EPOCH__ = hydrationEpoch;
      (globalThis as { __IS_HYDRATING__?: boolean }).__IS_HYDRATING__ = hydrating;
      (
        globalThis as { __AWAIT_HYDRATION__?: (epoch?: number) => Promise<void> }
      ).__AWAIT_HYDRATION__ = awaitHydration;
    } catch {}
  }, [
    state,
    ttState,
    height,
    append,
    appendMany,
    setTtHeight,
    routeContext,
    warnings,
    hydrationEpoch,
    hydrating,
    awaitHydration,
  ]);

  return <StateCtx.Provider value={value}>{children}</StateCtx.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(StateCtx);
  if (!ctx) throw new Error('useAppState must be used within StateProvider');
  return ctx;
}
