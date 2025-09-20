import React from 'react';
import ReactDOM from 'react-dom';
import { beforeEach, vi } from 'vitest';

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
  appStateRef.current = null;
  routerRef.current = createRouter();
  newGameConfirmMock = {
    show: async () => true,
  };
  listGamesMockImpl = vi.fn(async () => []);
  restoreGameMockImpl = vi.fn(async () => undefined);
  deleteGameMockImpl = vi.fn(async () => undefined);
  fetchMock.mockClear();
});

vi.mock('@/components/state-provider', async () => {
  return {
    useAppState: () => {
      if (!appStateRef.current) {
        throw new Error('Test attempted to access useAppState without configuring a mock.');
      }
      return appStateRef.current;
    },
  };
});

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
