import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type RouterStub = ReturnType<(typeof import('next/navigation'))['useRouter']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (router: RouterStub) => void;

const suite = typeof document === 'undefined' ? describe.skip : describe;

function createRouter(): RouterStub {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  } satisfies RouterStub;
}

function mountAppState(state: AppState, overrides: Partial<MockAppStateHook> = {}) {
  setMockAppState({
    state,
    ready: overrides.ready ?? true,
    height: overrides.height ?? 0,
    append: overrides.append ?? (async () => 0),
    appendMany: overrides.appendMany ?? (async () => 0),
    isBatchPending: overrides.isBatchPending ?? false,
    previewAt: overrides.previewAt ?? (async () => state),
    warnings: overrides.warnings ?? [],
    clearWarnings: overrides.clearWarnings ?? (() => {}),
    timeTravelHeight: overrides.timeTravelHeight ?? null,
    setTimeTravelHeight: overrides.setTimeTravelHeight ?? (() => {}),
    timeTraveling: overrides.timeTraveling ?? false,
  } as MockAppStateHook);
}

suite('Single Player root layout redirects', () => {
  let router: RouterStub;

  beforeEach(() => {
    router = createRouter();
    setMockRouter(router);
  });

  it('redirects to the active single player game when an id is present', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'clubs', rank: 5 }] },
      trickPlays: [{ playerId: 'a', card: { suit: 'clubs', rank: 5 } }],
      currentGameId: '123e4567-e89b-12d3-a456-426614174000',
    } as AppState['sp'];
    mountAppState(state, { ready: true });

    const { default: Layout } = await import('@/app/single-player/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div')));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        '/single-player/123e4567-e89b-12d3-a456-426614174000',
      );
    });

    root.unmount();
    container.remove();
  });

  it('redirects to archive flow when progress exists but no current game id', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'spades', rank: 9 }] },
      trickPlays: [{ playerId: 'a', card: { suit: 'spades', rank: 9 } }],
      currentGameId: null,
    } as AppState['sp'];
    mountAppState(state, { ready: true });

    const { default: Layout } = await import('@/app/single-player/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div')));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/single-player/new/archive');
    });

    root.unmount();
    container.remove();
  });

  it('redirects to the new-game flow when no progress exists', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'setup',
      hands: {},
      trickPlays: [],
      currentGameId: null,
    } as AppState['sp'];
    mountAppState(state, { ready: true });

    const { default: Layout } = await import('@/app/single-player/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div')));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/single-player/new');
    });

    root.unmount();
    container.remove();
  });

  it('renders a loading state when app context is not ready', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    mountAppState(state, { ready: false });

    const { default: Layout } = await import('@/app/single-player/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div')));

    await waitFor(() => {
      expect(container.textContent || '').toMatch(/Loading single player/i);
    });
    expect(router.replace).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
