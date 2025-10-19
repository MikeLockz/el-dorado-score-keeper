import { expect } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom';
import { beforeEach, vi } from 'vitest';
import { INITIAL_STATE } from '@/lib/state';

expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass =
      typeof received === 'object' &&
      received !== null &&
      'ownerDocument' in (received as Record<string, unknown>) &&
      ((received as { ownerDocument?: Document | null }).ownerDocument ?? null) !== null;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in the document`,
    };
  },
});

// Ensure JSX that relies on the global React object (e.g. Next layouts) keeps working
if (!(globalThis as any).React) {
  (globalThis as any).React = React;
}

// Render Radix portals inline so assertions can look inside the test container
const originalCreatePortal = ReactDOM.createPortal;
ReactDOM.createPortal = ((element: React.ReactNode) => element) as typeof originalCreatePortal;

type MockAppState = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type ListGamesFn = (typeof import('@/lib/state/io'))['listGames'];
type RestoreGameFn = (typeof import('@/lib/state/io'))['restoreGame'];
type DeleteGameFn = (typeof import('@/lib/state/io'))['deleteGame'];

const appStateRef: { current: MockAppState | null } = { current: null };
const useAppStateMockFn = vi.fn<[], MockAppState>(() => {
  if (!appStateRef.current) {
    throw new Error('Test attempted to access useAppState without configuring a mock.');
  }
  return appStateRef.current;
});

function cloneState<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function createDefaultAppState(): MockAppState {
  const context: Partial<MockAppState> = {};
  Object.assign(context, {
    state: cloneState(INITIAL_STATE),
    height: 0,
    ready: true,
    append: vi.fn(async () => 0),
    appendMany: vi.fn(async () => 0),
    isBatchPending: false,
    previewAt: async () => (context as MockAppState).state,
    warnings: [],
    clearWarnings: () => {},
    timeTravelHeight: null,
    setTimeTravelHeight: () => {},
    timeTraveling: false,
    context: { mode: null, gameId: null, scorecardId: null },
  });
  return context as MockAppState;
}

(globalThis as any).__setMockAppState = (value: MockAppState) => {
  appStateRef.current = value;
};

type NewGameConfirmMock = {
  show: (options?: any) => Promise<boolean>;
};

let listGamesMockImpl: ListGamesFn;
let restoreGameMockImpl: RestoreGameFn;
let deleteGameMockImpl: DeleteGameFn;

let newGameConfirmMock: NewGameConfirmMock = {
  show: async () => true,
};

type ParamsRecord = Record<string, string | string[]>;

const paramsRef: { current: ParamsRecord } = { current: {} };

(globalThis as any).__setMockParams = (params: ParamsRecord) => {
  paramsRef.current = params;
};

(globalThis as any).__setNewGameConfirm = (value: NewGameConfirmMock) => {
  newGameConfirmMock = value;
};

(globalThis as any).__setListGamesMock = (value: ListGamesFn) => {
  listGamesMockImpl = value;
};

(globalThis as any).__setRestoreGameMock = (value: RestoreGameFn) => {
  restoreGameMockImpl = value;
};

(globalThis as any).__setDeleteGameMock = (value: DeleteGameFn) => {
  deleteGameMockImpl = value;
};

const createRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  forward: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn().mockResolvedValue(undefined),
});

type RouterStub = ReturnType<typeof createRouter>;

const routerRef: { current: RouterStub } = { current: createRouter() };

(globalThis as any).__setMockRouter = (router: RouterStub) => {
  routerRef.current = router;
};

const originalFetch = (globalThis as any).fetch;
const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({}),
  text: async () => '',
})) as unknown as typeof fetch;

(globalThis as any).fetch = fetchMock;
(globalThis as any).__getMockFetch = () => fetchMock;
(globalThis as any).__restoreOriginalFetch = () => {
  (globalThis as any).fetch = originalFetch;
};

beforeEach(() => {
  appStateRef.current = createDefaultAppState();
  useAppStateMockFn.mockReset();
  useAppStateMockFn.mockImplementation(() => {
    if (!appStateRef.current) {
      throw new Error('Test attempted to access useAppState without configuring a mock.');
    }
    return appStateRef.current;
  });
  routerRef.current = createRouter();
  newGameConfirmMock = {
    show: async () => true,
  };
  listGamesMockImpl = vi.fn(async () => []);
  restoreGameMockImpl = vi.fn(async () => undefined);
  deleteGameMockImpl = vi.fn(async () => undefined);
  fetchMock.mockClear();
  paramsRef.current = {};
});

vi.mock('@/components/state-provider', async () => ({
  useAppState: useAppStateMockFn,
}));

vi.mock('@/components/dialogs/NewGameConfirm', async () => {
  const React = await import('react');
  return {
    useNewGameConfirm: () => newGameConfirmMock,
    NewGameConfirmProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

vi.mock('@/lib/state/io', async () => {
  const actual = await import('@/lib/state/io');
  return {
    ...actual,
    listGames: (...args: Parameters<ListGamesFn>) => listGamesMockImpl(...args),
    restoreGame: (...args: Parameters<RestoreGameFn>) => restoreGameMockImpl(...args),
    deleteGame: (...args: Parameters<DeleteGameFn>) => deleteGameMockImpl(...args),
  };
});

// Basic Next.js router mock so client components using it can render in tests
vi.mock('next/navigation', () => {
  return {
    useRouter: () => routerRef.current,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => paramsRef.current,
    useSelectedLayoutSegments: () => [] as string[],
  };
});

// Make next/link behave like a normal anchor element in the DOM
vi.mock('next/link', () => {
  const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
    ({ href, children, onClick, ...rest }, ref) => {
      const resolvedHref =
        typeof href === 'string'
          ? href
          : href && typeof (href as any).toString === 'function'
            ? (href as any).toString()
            : '#';
      const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
        }
      };
      return React.createElement(
        'a',
        { ...rest, ref, href: resolvedHref, onClick: handleClick },
        children,
      );
    },
  );
  Link.displayName = 'MockNextLink';
  return { default: Link };
});
