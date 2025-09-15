export interface Env {
  SLACK_WEBHOOK_URL: string;
  ANALYTICS_TOKEN?: string;
  ALLOWED_ORIGIN?: string; // single origin or comma-separated list
}

function parseAllowedOrigins(env: Env): string[] | null {
  const raw = (env.ALLOWED_ORIGIN || '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string | null, env: Env): string | null {
  if (!origin) return null; // Non-CORS request; respond without CORS headers
  const list = parseAllowedOrigins(env);
  if (!list) return null; // Secure-by-default: do not reflect unless configured
  return list.includes(origin) ? origin : null;
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } as Record<string, string>;
}

function firstIp(xff: string | null): string | null {
  if (!xff) return null;
  const ip = xff.split(',')[0]?.trim();
  return ip || null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const allowed = isOriginAllowed(origin, env);

    // Preflight
    if (req.method === 'OPTIONS') {
      if (allowed) {
        return new Response(null, { status: 204, headers: corsHeaders(allowed) });
      }
      // No allowed origin configured or not matched
      return new Response('CORS not allowed', { status: 403 });
    }

    if (req.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // If this is a browser CORS request and origin is not allowed, block.
    if (origin && !allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      return new Response('Bad JSON', { status: 400 });
    }

    // Optional bearer token: accept header OR body.authToken (for sendBeacon which cannot set headers)
    const token = env.ANALYTICS_TOKEN;
    if (token) {
      const authHeader = req.headers.get('authorization');
      const bodyToken = typeof body?.authToken === 'string' ? body.authToken : null;
      const ok = authHeader === `Bearer ${token}` || bodyToken === token;
      if (!ok) return new Response('Unauthorized', { status: 401 });
    }

    // Derive IP server-side (ignore any client-supplied IP unless none available)
    const ip =
      req.headers.get('cf-connecting-ip') ||
      firstIp(req.headers.get('x-forwarded-for')) ||
      req.headers.get('x-real-ip') ||
      body.ip ||
      null;

    const ref = body.referrer ? String(body.referrer) : 'direct';
    const browser = body.browser ? String(body.browser) : 'Unknown';
    const path = body.path ? String(body.path) : '/';
    const fullUrl = body.url ? String(body.url) : '';

    const text = [`📄 ${path}  ·  🔗 ${ref}`, `🧭 ${browser}  ·  🌐 ${ip || 'unknown'}`, fullUrl]
      .filter(Boolean)
      .join('\n');

    try {
      const resp = await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        return new Response('Upstream error', { status: 502 });
      }
    } catch (_) {
      return new Response('Slack error', { status: 502 });
    }

    const okHeaders = allowed ? corsHeaders(allowed) : undefined;
    const init: ResponseInit = okHeaders ? { status: 204, headers: okHeaders } : { status: 204 };
    return new Response(null, init);
  },
};
