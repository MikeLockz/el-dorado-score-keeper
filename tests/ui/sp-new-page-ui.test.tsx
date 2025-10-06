import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE, type AppState } from '@/lib/state';

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type RouterStub = ReturnType<(typeof import('next/navigation'))['useRouter']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (router: RouterStub) => void;

const gameFlowModule = await import('@/lib/game-flow');
type UseNewGameRequest = typeof gameFlowModule.useNewGameRequest;
type UseNewGameRequestOptions = Parameters<UseNewGameRequest>[0];

const startNewGameSpy = vi.hoisted(() => vi.fn(async () => true));

vi.spyOn(gameFlowModule, 'useNewGameRequest').mockImplementation(
  (options?: UseNewGameRequestOptions) => ({
    startNewGame: async (...args) => {
      const result = await startNewGameSpy(...args);
      if (!result) {
        options?.onCancelled?.();
      }
      return result;
    },
    pending: false,
  }),
);

const suite = typeof document === 'undefined' ? describe.skip : describe;

function createRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  } satisfies RouterStub;
}

function setState(state: AppState, overrides: Partial<MockAppStateHook> = {}) {
  setMockAppState({
    state,
    height: overrides.height ?? 0,
    ready: overrides.ready ?? true,
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

suite('Single Player new game route', () => {
  let router: RouterStub;

  beforeEach(() => {
    startNewGameSpy.mockReset();
    router = createRouter();
    setMockRouter(router);
  });

  it('auto-starts a new game when no progress exists', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'setup',
      trickPlays: [],
      hands: {},
      currentGameId: null,
    } as AppState['sp'];
    setState(state, { ready: true });

    const { default: NewPage } = await import('@/app/single-player/new/page');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(NewPage));

    await waitFor(() => {
      expect(startNewGameSpy).toHaveBeenCalledTimes(1);
    });

    expect(startNewGameSpy.mock.calls[0]?.[0]).toMatchObject({
      skipConfirm: true,
      analytics: { source: 'single-player.new.auto' },
    });
    expect(container.textContent || '').toMatch(/Creating a fresh single-player session/i);

    root.unmount();
    container.remove();
  });

  it('offers archive and continue flows when progress exists', async () => {
    const state = structuredClone(INITIAL_STATE) as AppState;
    state.sp = {
      ...state.sp,
      phase: 'playing',
      hands: { a: [{ suit: 'spades', rank: 7 }] },
      trickPlays: [{ playerId: 'a', card: { suit: 'spades', rank: 7 } }],
      order: ['a'],
      currentGameId: 'sp-live-1',
    } as AppState['sp'];
    setState(state, { ready: true });

    const { default: NewPage } = await import('@/app/single-player/new/page');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(NewPage));

    await waitFor(() => {
      expect(container.textContent || '').toMatch(/Archive your current progress/i);
    });

    expect(startNewGameSpy).not.toHaveBeenCalled();

    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const archive = buttons.find((btn) => /Archive & start new/i.test(btn.textContent || ''));
    const resume = buttons.find((btn) => /Continue current game/i.test(btn.textContent || ''));

    expect(archive).toBeTruthy();
    expect(resume).toBeTruthy();

    archive?.click();
    expect(router.push).toHaveBeenCalledWith('/single-player/new/archive');

    resume?.click();
    expect(router.push).toHaveBeenCalledWith('/single-player/new/continue');

    root.unmount();
    container.remove();
  });
});
