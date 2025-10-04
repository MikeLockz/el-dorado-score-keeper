import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserTelemetryAdapter } from '@/lib/observability/vendors/types';

type SetupOptions = {
  withAgent?: boolean;
};

type AdapterSetup = {
  adapter: BrowserTelemetryAdapter;
  logAdapter: {
    init: ReturnType<typeof vi.fn>;
    addAction: ReturnType<typeof vi.fn>;
    recordException: ReturnType<typeof vi.fn>;
    setGlobalAttributes: ReturnType<typeof vi.fn>;
  };
  agent?: {
    addPageAction: ReturnType<typeof vi.fn>;
    noticeError: ReturnType<typeof vi.fn>;
    setCustomAttribute: ReturnType<typeof vi.fn>;
    interaction: ReturnType<typeof vi.fn>;
  };
  interaction?: {
    setName: ReturnType<typeof vi.fn>;
  };
};

const DEFAULT_CONFIG = {
  apiKey: 'browser-key',
  service: 'score-keeper-web',
  debug: true,
  newRelic: {
    applicationId: 'app-id',
    licenseKey: 'license-key',
    loaderScriptUrl: 'https://js-agent.newrelic.com/nr-loader-spa.js',
  },
} as const;

const setupAdapter = async ({ withAgent = true }: SetupOptions = {}): Promise<AdapterSetup> => {
  vi.resetModules();

  const logAdapter = {
    init: vi.fn(),
    addAction: vi.fn(),
    recordException: vi.fn(),
    setGlobalAttributes: vi.fn(),
  };

  vi.doMock('@/lib/observability/vendors/newrelic/log-adapter', () => ({
    default: logAdapter,
  }));

  let interaction: AdapterSetup['interaction'];
  let agent: AdapterSetup['agent'];

  if (withAgent) {
    interaction = { setName: vi.fn() };
    agent = {
      addPageAction: vi.fn(),
      noticeError: vi.fn(),
      setCustomAttribute: vi.fn(),
      interaction: vi.fn(() => interaction),
    };
  }

  vi.stubGlobal('window', ({
    ...(withAgent ? { newrelic: agent } : {}),
  } as unknown) as Window & typeof globalThis);

  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({} as HTMLScriptElement)),
    head: {
      appendChild: vi.fn(),
    },
  } as unknown as Document);

  const module = await import('@/lib/observability/vendors/newrelic/browser-agent');

  return {
    adapter: module.default,
    logAdapter,
    agent,
    interaction,
  };
};

describe('new relic browser adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('routes page view metadata through the agent API', async () => {
    const { adapter, agent, interaction, logAdapter } = await setupAdapter();
    if (!agent || !interaction) throw new Error('agent not initialised');

    await adapter.init({ ...DEFAULT_CONFIG });
    adapter.setGlobalAttributes?.({ environment: 'test', service: DEFAULT_CONFIG.service });

    const attributes = {
      path: '/players?tab=archived',
      pathname: '/players',
      search: 'tab=archived',
      title: 'Players',
      referrer: 'https://example.test/dashboard',
    } as const;

    adapter.addAction('page.viewed', { ...attributes });

    expect(agent.addPageAction).toHaveBeenCalledWith('page.viewed', expect.objectContaining(attributes));
    expect(agent.setCustomAttribute).toHaveBeenCalledWith('route.name', '/players?tab=archived');
    expect(agent.setCustomAttribute).toHaveBeenCalledWith('route.pathname', '/players');
    expect(agent.setCustomAttribute).toHaveBeenCalledWith('route.search', 'tab=archived');
    expect(agent.setCustomAttribute).toHaveBeenCalledWith('page.url', '/players?tab=archived');
    expect(agent.setCustomAttribute).toHaveBeenCalledWith('page.title', 'Players');
    expect(agent.setCustomAttribute).toHaveBeenCalledWith(
      'page.referrer',
      'https://example.test/dashboard',
    );
    expect(interaction.setName).toHaveBeenCalledWith('/players');
    expect(logAdapter.addAction).not.toHaveBeenCalled();
  });

  it('records exceptions through noticeError', async () => {
    const { adapter, agent, logAdapter } = await setupAdapter();
    if (!agent) throw new Error('agent not initialised');

    await adapter.init({ ...DEFAULT_CONFIG });

    adapter.recordException('boom', { scope: 'players' });

    expect(agent.noticeError).toHaveBeenCalledWith(expect.any(Error), {
      scope: 'players',
    });
    expect(logAdapter.recordException).not.toHaveBeenCalled();
  });

  it('falls back to the log adapter when the agent is unavailable', async () => {
    const { adapter, logAdapter } = await setupAdapter({ withAgent: false });

    await adapter.init({ apiKey: 'key', service: 'svc', debug: true });

    adapter.setGlobalAttributes?.({ environment: 'qa' });
    adapter.addAction('custom.event', { foo: 'bar' });
    const error = new Error('kaput');
    adapter.recordException(error, { feature: 'players' });

    expect(logAdapter.init).toHaveBeenCalled();
    expect(logAdapter.setGlobalAttributes).toHaveBeenCalledWith({ environment: 'qa' });
    expect(logAdapter.addAction).toHaveBeenCalledWith('custom.event', { foo: 'bar' });
    expect(logAdapter.recordException).toHaveBeenCalledWith(error, {
      feature: 'players',
    });
  });
});
