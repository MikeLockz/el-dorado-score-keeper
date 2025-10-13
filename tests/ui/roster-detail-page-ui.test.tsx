import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';

import type { AppState } from '@/lib/state';
import { INITIAL_STATE } from '@/lib/state';
import RosterDetailPageClient from '@/app/rosters/[rosterId]/RosterDetailPageClient';

const append = vi.fn(async () => 1);
const appendMany = vi.fn(async () => 1);

const suite = typeof document === 'undefined' ? describe.skip : describe;

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setMockRouter = (globalThis as any).__setMockRouter as (
  router: ReturnType<typeof createRouterStub>,
) => void;

let mockAppState: MockAppStateHook;
let router: ReturnType<typeof createRouterStub>;

function createRouterStub() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}

function buildState(): AppState {
  return {
    players: { p1: 'Alice', p2: 'Ben', p3: 'Cara', p4: 'Devon' },
    playerDetails: {
      p1: {
        name: 'Alice',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      p2: {
        name: 'Ben',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      p3: {
        name: 'Cara',
        type: 'bot',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      p4: {
        name: 'Devon',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    },
    scores: {},
    rounds: {},
    rosters: {
      r1: {
        name: 'Roster Alpha',
        playersById: { p1: 'Alice', p2: 'Ben', p3: 'Cara' },
        playerTypesById: { p1: 'human', p2: 'human', p3: 'bot' },
        displayOrder: { p1: 0, p2: 1, p3: 2 },
        type: 'scorecard',
        createdAt: 0,
        archivedAt: null,
      },
    },
    activeScorecardRosterId: 'r1',
    activeSingleRosterId: null,
    humanByMode: {},
    sp: { ...INITIAL_STATE.sp },
    display_order: { p1: 0, p2: 1, p3: 2 },
  } as AppState;
}

suite('RosterDetailPageClient', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const state = buildState();
    mockAppState = {
      state,
      ready: true,
      height: 10,
      append,
      appendMany,
      isBatchPending: false,
      previewAt: async () => state,
      warnings: [],
      clearWarnings: () => {},
      timeTravelHeight: null,
      setTimeTravelHeight: () => {},
      timeTraveling: false,
    } as MockAppStateHook;
    setMockAppState(mockAppState);
    router = createRouterStub();
    setMockRouter(router);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderWithProviders(element: React.ReactElement) {
    const { PromptDialogProvider } = await import('@/components/dialogs/PromptDialog');
    const { ConfirmDialogProvider } = await import('@/components/dialogs/ConfirmDialog');
    const { ToastProvider } = await import('@/components/ui/toast');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(
        ConfirmDialogProvider,
        null,
        React.createElement(
          PromptDialogProvider,
          null,
          React.createElement(ToastProvider, null, element),
        ),
      ),
    );
    return { div, root };
  }

  it('commits inline rename on blur', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const input = (await waitFor(() => {
      const element = div.querySelector(
        'input[aria-label="Roster name"]',
      ) as HTMLInputElement | null;
      expect(element).toBeTruthy();
      return element;
    })) as HTMLInputElement;

    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    descriptor?.set?.call(input, 'Renamed Roster');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await waitFor(() => {
      expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'roster/renamed' }));
    });

    root.unmount();
    div.remove();
  });

  it('adds an existing player from the dropdown', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const select = (await waitFor(() => {
      const element = div.querySelector('select') as HTMLSelectElement | null;
      expect(element).toBeTruthy();
      return element;
    })) as HTMLSelectElement;

    select.value = 'p4';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const addButton = (await waitFor(() => {
      const btn = Array.from(div.querySelectorAll('button')).find((node) =>
        /Add player/i.test(node.textContent || ''),
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      return btn!;
    })) as HTMLButtonElement;
    addButton.click();

    await waitFor(() => {
      expect(append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'roster/player/added',
          payload: expect.objectContaining({ id: 'p4' }),
        }),
      );
    });

    root.unmount();
    div.remove();
  });

  it('removes a player when the chip action is clicked', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const removeButton = (await waitFor(() => {
      const btn = div.querySelector('button[aria-label="Remove Ben"]') as HTMLButtonElement | null;
      expect(btn).toBeTruthy();
      return btn;
    })) as HTMLButtonElement;

    removeButton.click();

    await waitFor(() => {
      expect(append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'roster/player/removed',
          payload: expect.objectContaining({ id: 'p2' }),
        }),
      );
    });

    root.unmount();
    div.remove();
  });

  it('archives a roster after confirmation', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const archiveButton = (await waitFor(() => {
      const btn = Array.from(div.querySelectorAll('button')).find((node) =>
        /Archive roster/i.test(node.textContent || ''),
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      return btn!;
    })) as HTMLButtonElement;
    archiveButton.click();

    const dialog = (await waitFor(() => {
      const element = div.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element;
    })) as HTMLElement;

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((btn) =>
      /Archive roster/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await waitFor(() => {
      expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'roster/archived' }));
    });

    root.unmount();
    div.remove();
  });

  it('creates a new player and adds it to the roster', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const createButton = (await waitFor(() => {
      const btn = Array.from(div.querySelectorAll('button')).find((node) =>
        /Create new player/i.test(node.textContent || ''),
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      return btn!;
    })) as HTMLButtonElement;
    createButton.click();

    const dialog = (await waitFor(() => {
      const element = div.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element;
    })) as HTMLElement;

    const input = dialog.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'Echo';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((btn) =>
      /Create player/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await waitFor(() => {
      expect(appendMany).toHaveBeenCalled();
    });

    const events = appendMany.mock.calls.at(-1)?.[0] as Array<{ type: string }> | undefined;
    expect(events).toBeTruthy();
    expect(events![0].type).toBe('player/added');
    expect(events![1].type).toBe('roster/player/added');

    root.unmount();
    div.remove();
  });

  it('deletes a roster after confirmation and navigates away', async () => {
    const { div, root } = await renderWithProviders(
      React.createElement(RosterDetailPageClient, { rosterId: 'r1' }),
    );

    const deleteButton = (await waitFor(() => {
      const btn = Array.from(div.querySelectorAll('button')).find((node) =>
        /Delete roster/i.test(node.textContent || ''),
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      return btn!;
    })) as HTMLButtonElement;
    deleteButton.click();

    const dialog = (await waitFor(() => {
      const element = div.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element;
    })) as HTMLElement;

    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((btn) =>
      /Delete roster/i.test(btn.textContent || ''),
    ) as HTMLButtonElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();

    await waitFor(() => {
      expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'roster/deleted' }));
      expect(router.push).toHaveBeenCalledWith('/rosters');
    });

    root.unmount();
    div.remove();
  });
});
