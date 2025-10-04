import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PosthogMock = {
  init: vi.Mock;
  capture: vi.Mock;
  register: vi.Mock;
  get_session_replay_url: vi.Mock;
};

const posthogStub = vi.hoisted<PosthogMock>(() => {
  const capture = vi.fn();
  const register = vi.fn();
  const getSessionReplayUrl = vi.fn();
  const init = vi.fn((_: string, options?: Record<string, unknown>) => {
    const loaded = options?.loaded;
    if (typeof loaded === 'function') {
      loaded({
        init,
        capture,
        register,
        get_session_replay_url: getSessionReplayUrl,
      } as never);
    }
  });
  return {
    init,
    capture,
    register,
    get_session_replay_url: getSessionReplayUrl,
  } satisfies PosthogMock;
});

vi.mock('posthog-js', () => ({
  __esModule: true,
  default: posthogStub,
}));

const setBrowser = (enabled: boolean) => {
  if (enabled) {
    (globalThis as { window?: Window }).window = {} as Window;
  } else {
    delete (globalThis as { window?: Window }).window;
  }
};

const loadPosthogModule = () => import('@/lib/observability/vendors/posthog/browser-adapter');

const resetMock = (fn: unknown) => {
  if (typeof fn === 'function' && 'mockClear' in fn) {
    (fn as { mockClear: () => void }).mockClear();
  }
};

beforeEach(() => {
  vi.resetModules();
  setBrowser(true);
  Object.values(posthogStub as Record<string, vi.Mock>).forEach(resetMock);
});

afterEach(() => {
  vi.resetModules();
  setBrowser(false);
  Object.values(posthogStub as Record<string, vi.Mock>).forEach(resetMock);
});

describe('posthog browser adapter', () => {
  it('bails during SSR environments', async () => {
    setBrowser(false);
    const { default: adapter } = await loadPosthogModule();
    adapter.init({ apiKey: 'key', service: 'svc' });
    expect(posthogStub.init).not.toHaveBeenCalled();
  });

  it('initialises PostHog and maps page.viewed to $pageview', async () => {
    const { default: adapter } = await loadPosthogModule();
    adapter.init({ apiKey: 'key', service: 'svc', url: 'https://host', debug: true });
    expect(posthogStub.init).toHaveBeenCalledWith(
      'key',
      expect.objectContaining({
        api_host: 'https://host',
        capture_pageview: false,
        autocapture: false,
        disable_session_recording: true,
        property_blacklist: ['$ip'],
        debug: true,
      }),
    );

    adapter.setGlobalAttributes({ environment: 'test', service: 'svc' });
    expect(posthogStub.register).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'test',
        service: 'svc',
        app: 'svc',
      }),
    );

    adapter.addAction('page.viewed', {
      path: '/games',
      noop: () => undefined,
    });
    expect(posthogStub.capture).toHaveBeenCalledWith('$pageview', {
      path: '/games',
    });
  });

  it('captures custom events and exceptions with sanitized payloads', async () => {
    const { default: adapter } = await loadPosthogModule();
    adapter.init({ apiKey: 'key', service: 'svc' });

    adapter.addAction('players.added', {
      game_id: 'game-123',
      total_players: 3,
      mode: 'standard',
    });
    expect(posthogStub.capture).toHaveBeenCalledWith('players.added', {
      game_id: 'game-123',
      mode: 'standard',
      total_players: 3,
    });

    const error = new Error('boom');
    adapter.recordException(error, {
      path: '/scores',
    });
    expect(posthogStub.capture).toHaveBeenCalledWith(
      'browser.exception',
      expect.objectContaining({
        message: 'boom',
        name: 'Error',
        path: '/scores',
      }),
    );
  });

  it('exposes session replay URLs when available', async () => {
    const { default: adapter } = await loadPosthogModule();
    adapter.init({ apiKey: 'key', service: 'svc' });
    (posthogStub.get_session_replay_url as unknown as vi.Mock).mockReturnValue('https://session');
    expect(adapter.getSessionUrl()).toBe('https://session');
  });

  it('syncs opt-out state to the underlying client', async () => {
    const { syncOptOut } = await loadPosthogModule();
    const target = posthogStub as unknown as {
      opt_out_capturing: vi.Mock;
      opt_in_capturing: vi.Mock;
    };
    target.opt_out_capturing = vi.fn();
    target.opt_in_capturing = vi.fn();

    syncOptOut('disabled');
    expect(target.opt_out_capturing).toHaveBeenCalledTimes(1);

    syncOptOut('enabled');
    expect(target.opt_in_capturing).toHaveBeenCalledTimes(1);
  });
});
