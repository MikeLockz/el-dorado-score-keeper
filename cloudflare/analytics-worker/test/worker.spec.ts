import { describe, it, expect, beforeEach, vi } from 'vitest';
import workerMod from '../src/worker';

type Env = Parameters<typeof workerMod.fetch>[1];

function makeEnv(env: Partial<Env> = {}): Env {
  return {
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/XXX',
    ANALYTICS_TOKEN: undefined,
    ALLOWED_ORIGIN: undefined,
    ...env,
  } as Env;
}

function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function jsonHeaders(origin?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) h['Origin'] = origin;
  return h;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Cloudflare Analytics Worker', () => {
  it('blocks CORS preflight when no ALLOWED_ORIGIN set', async () => {
    const env = makeEnv();
    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env as any,
    );
    expect(res.status).toBe(403);
  });

  it('allows CORS preflight for allowed origin', async () => {
    const env = makeEnv({ ALLOWED_ORIGIN: 'https://app.example.com' });
    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env as any,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });

  it('rejects unauthorized POST when token required', async () => {
    const env = makeEnv({ ANALYTICS_TOKEN: 'sek', ALLOWED_ORIGIN: 'https://app.example.com' });
    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'POST',
        headers: jsonHeaders('https://app.example.com'),
        body: JSON.stringify({
          path: '/',
          referrer: '🔗 https://google.com',
          browser: '🧭 Chrome',
        }),
      }),
      env as any,
    );
    expect(res.status).toBe(401);
  });

  it('accepts header bearer auth and posts to Slack', async () => {
    const env = makeEnv({ ANALYTICS_TOKEN: 'sek', ALLOWED_ORIGIN: 'https://app.example.com' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'POST',
        headers: { ...jsonHeaders('https://app.example.com'), Authorization: 'Bearer sek' },
        body: JSON.stringify({
          path: '/scores',
          referrer: '🔗 https://google.com',
          browser: '🧭 Chrome',
          url: 'https://site/scores',
        }),
      }),
      env as any,
    );

    expect(res.status).toBe(204);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(env.SLACK_WEBHOOK_URL);
    const body = JSON.parse(String(init!.body));
    expect(body.text).toContain('📄 /scores');
    expect(body.text).toContain('🧭 Chrome');
    expect(body.text).toContain('https://site/scores');
  });

  it('accepts body authToken (sendBeacon-compatible)', async () => {
    const env = makeEnv({ ANALYTICS_TOKEN: 'sek', ALLOWED_ORIGIN: 'https://app.example.com' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'POST',
        headers: jsonHeaders('https://app.example.com'),
        body: JSON.stringify({
          path: '/',
          referrer: '🔗 direct',
          browser: '🧭 Safari',
          authToken: 'sek',
        }),
      }),
      env as any,
    );
    expect(res.status).toBe(204);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('prefers cf-connecting-ip for IP in Slack text', async () => {
    const env = makeEnv({ ALLOWED_ORIGIN: 'https://app.example.com' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const res = await workerMod.fetch(
      req('https://worker.example/ingest', {
        method: 'POST',
        headers: { ...jsonHeaders('https://app.example.com'), 'cf-connecting-ip': '203.0.113.9' },
        body: JSON.stringify({ path: '/', referrer: '🔗 direct', browser: '🧭 Firefox' }),
      }),
      env as any,
    );
    expect(res.status).toBe(204);
    const body = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(body.text).toContain('203.0.113.9');
  });
});
