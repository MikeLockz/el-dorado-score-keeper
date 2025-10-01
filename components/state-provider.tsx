'use client';
import React from 'react';

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
} from '@/lib/state';

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
};

const StateCtx = React.createContext<Ctx | null>(null);

export function StateProvider({
  children,
  onWarn,
}: {
  children: React.ReactNode;
  onWarn?: (code: string, info?: unknown) => void;
}) {
  const [state, setState] = React.useState<AppState>(INITIAL_STATE);
  const [height, setHeight] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [pendingBatches, setPendingBatches] = React.useState(0);
  const [warnings, setWarnings] = React.useState<Warning[]>([]);
  const [ttHeight, setTtHeight] = React.useState<number | null>(null);
  const [ttState, setTtState] = React.useState<AppState | null>(null);
  const instRef = React.useRef<Awaited<ReturnType<typeof createInstance>> | null>(null);
  const dbNameRef = React.useRef<string>('app-db');

  // Keep a ref to onWarn to avoid re-creating the instance on prop changes
  const onWarnRef = React.useRef<typeof onWarn>(onWarn);
  React.useEffect(() => {
    onWarnRef.current = onWarn;
  }, [onWarn]);

  React.useEffect(() => {
    let unsubs: (() => void) | null = null;
    let closed = false;
    void (async () => {
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
      });
      if (closed) {
        inst.close();
        return;
      }
      instRef.current = inst;
      // Mark initial state set and subsequent stream updates as transitions to
      // keep input responsive during rapid event bursts (e.g., bid spamming).
      React.startTransition(() => {
        setState(inst.getState());
        setHeight(inst.getHeight());
        setReady(true);
      });
      unsubs = inst.subscribe((s, h) => {
        React.startTransition(() => {
          setState(s);
          setHeight(h);
        });
      });
    })();
    return () => {
      closed = true;
      try {
        unsubs?.();
      } catch {}
      try {
        instRef.current?.close();
      } catch {}
      instRef.current = null;
    };
  }, []);

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
    } catch {}
  }, [state, ttState, height, append, appendMany, setTtHeight]);

  return <StateCtx.Provider value={value}>{children}</StateCtx.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(StateCtx);
  if (!ctx) throw new Error('useAppState must be used within StateProvider');
  return ctx;
}
