import { beforeEach, describe, expect, test, vi } from 'vitest';

const originalEnv = { ...process.env };
const originalArgv = [...process.argv];

const createPostHogClientMock = vi.fn();

const TEST_INSIGHTS = [
  {
    name: 'Test Insight',
    description: 'Example description',
    kind: 'TRENDS' as const,
    tags: ['automation'],
    filters: { insight: 'TRENDS' },
    query: { kind: 'TrendsQuery', interval: 'week', series: [] },
  },
];

vi.mock('@/scripts/posthog/client', () => ({
  createPostHogClient: createPostHogClientMock,
}));

vi.mock('@/scripts/posthog/insights', () => ({
  INSIGHTS: TEST_INSIGHTS,
}));

const { loadConfig, run, buildPayload } = await import('@/scripts/posthog/bootstrap-dashboards');

beforeEach(() => {
  process.env = { ...originalEnv };
  process.argv = [...originalArgv];
  process.exitCode = undefined;
  createPostHogClientMock.mockReset();
  vi.restoreAllMocks();
});

describe('loadConfig', () => {
  test('throws when POSTHOG_PERSONAL_API_KEY is missing', () => {
    process.env.POSTHOG_PROJECT_ID = '42';
    process.argv = ['node', 'script'];

    expect(() => loadConfig()).toThrow(/POSTHOG_PERSONAL_API_KEY/);
  });

  test('throws when POSTHOG_PROJECT_ID is invalid', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = 'not-a-number';

    expect(() => loadConfig()).toThrow(/POSTHOG_PROJECT_ID/);
  });

  test('parses config with defaults and flags', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '9';
    process.argv = ['node', 'script', '--dry-run', '--json'];

    const config = loadConfig();

    expect(config).toEqual({
      apiHost: 'https://app.posthog.com',
      apiKey: 'phx_test',
      projectId: 9,
      dryRun: true,
      json: true,
    });
  });
});

describe('buildPayload', () => {
  test('creates a serialisable payload snapshot', () => {
    const payload = buildPayload(TEST_INSIGHTS[0]);

    expect(payload).toEqual({
      name: 'Test Insight',
      description: 'Example description',
      tags: ['automation'],
      filters: { insight: 'TRENDS' },
      query: { kind: 'TrendsQuery', interval: 'week', series: [] },
    });
  });
});

describe('run', () => {
  beforeEach(() => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '11';
    process.argv = ['node', 'script'];
  });

  test('creates insights when none exist', async () => {
    const client = {
      getInsightByName: vi.fn().mockResolvedValue(null),
      createInsight: vi.fn().mockResolvedValue({ id: 101, name: 'Test Insight' }),
      updateInsight: vi.fn(),
    };
    createPostHogClientMock.mockReturnValue(client);

    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => undefined);

    await run();

    expect(client.getInsightByName).toHaveBeenCalledWith('Test Insight');
    expect(client.createInsight).toHaveBeenCalledTimes(1);
    expect(client.updateInsight).not.toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledWith([
      {
        action: 'created',
        id: 101,
        name: 'Test Insight',
      },
    ]);
  });

  test('updates insights when an existing one is found', async () => {
    const client = {
      getInsightByName: vi.fn().mockResolvedValue({ id: 202, name: 'Test Insight' }),
      createInsight: vi.fn(),
      updateInsight: vi.fn().mockResolvedValue({ id: 202, name: 'Test Insight' }),
    };
    createPostHogClientMock.mockReturnValue(client);

    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => undefined);

    await run();

    expect(client.createInsight).not.toHaveBeenCalled();
    expect(client.updateInsight).toHaveBeenCalledWith(
      202,
      expect.objectContaining({
        name: 'Test Insight',
        description: 'Example description',
        tags: ['automation'],
        filters: { insight: 'TRENDS' },
        query: { kind: 'TrendsQuery', interval: 'week', series: [] },
      }),
    );
    expect(tableSpy).toHaveBeenCalledWith([
      {
        action: 'updated',
        id: 202,
        name: 'Test Insight',
      },
    ]);
  });

  test('logs dry-run payloads without mutating PostHog', async () => {
    process.argv = ['node', 'script', '--dry-run', '--json'];

    const client = {
      getInsightByName: vi.fn().mockResolvedValue(null),
      createInsight: vi.fn(),
      updateInsight: vi.fn(),
    };
    createPostHogClientMock.mockReturnValue(client);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => undefined);
    const dirSpy = vi.spyOn(console, 'dir').mockImplementation(() => undefined);

    await run();

    expect(client.createInsight).not.toHaveBeenCalled();
    expect(client.updateInsight).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
    expect(dirSpy).not.toHaveBeenCalled();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.dryRun).toBe(true);
    expect(payload.results[0]).toMatchObject({
      action: 'would-create',
      name: 'Test Insight',
      id: null,
    });
    expect(payload.results[0].payload).toEqual({
      name: 'Test Insight',
      description: 'Example description',
      tags: ['automation'],
      filters: { insight: 'TRENDS' },
      query: { kind: 'TrendsQuery', interval: 'week', series: [] },
    });
  });

  test('records errors and sets exitCode', async () => {
    const client = {
      getInsightByName: vi.fn().mockRejectedValue(new Error('unauthorised')), // fails before create/update
      createInsight: vi.fn(),
      updateInsight: vi.fn(),
    };
    createPostHogClientMock.mockReturnValue(client);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => undefined);

    await run();

    expect(errorSpy).toHaveBeenCalledWith('[posthog] Failed to process Test Insight: unauthorised');
    expect(process.exitCode).toBe(1);
    expect(tableSpy).toHaveBeenCalledWith([
      {
        action: 'error',
        id: undefined,
        name: 'Test Insight',
      },
    ]);
  });
});
