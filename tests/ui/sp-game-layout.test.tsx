import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setMockParams = (globalThis as any).__setMockParams as (params: Record<string, string>) => void;

const suite = typeof document === 'undefined' ? describe.skip : describe;

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

suite('Single Player game layout entity guard', () => {
  beforeEach(() => {
    setMockParams({ gameId: 'sp-test' });
  });

  it('renders navigation for the requested game when available', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'diamonds', rank: 4 }] },
      trickPlays: [],
      currentGameId: 'sp-test',
    } as AppState['sp'];
    mountAppState(state, { ready: true });

    const { default: Layout } = await import('@/app/single-player/[gameId]/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div', { id: 'child' })));

    await waitFor(() => {
      const links = Array.from(container.querySelectorAll('a[href^="/single-player/sp-test"]'));
      expect(links).toHaveLength(3);
    });

    root.unmount();
    container.remove();
  });

  it('renders the missing entity surface when the game id does not match state', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'hearts', rank: 8 }] },
      trickPlays: [],
      currentGameId: 'sp-other',
    } as AppState['sp'];
    mountAppState(state, { ready: true });

    const { default: Layout } = await import('@/app/single-player/[gameId]/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div', { id: 'child' })));

    await waitFor(() => {
      expect(container.textContent || '').toMatch(/Single Player game not found/i);
    });

    root.unmount();
    container.remove();
  });

  it('shows loading indicator while app state is initializing', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    mountAppState(state, { ready: false });

    const { default: Layout } = await import('@/app/single-player/[gameId]/layout');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Layout, null, React.createElement('div', { id: 'child' })));

    await waitFor(() => {
      expect(container.textContent || '').toMatch(/Loading single player/i);
    });

    root.unmount();
    container.remove();
  });
});
