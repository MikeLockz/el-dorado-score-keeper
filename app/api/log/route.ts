import type { NextRequest } from 'next/server';

type LogBody = {
  type?: unknown;
  errorId?: unknown;
  message?: unknown;
  stack?: unknown;
  componentStack?: unknown;
  path?: unknown;
  ua?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const dataUnknown: unknown = await req.json().catch(() => ({} as unknown));
    const data: LogBody = (dataUnknown && typeof dataUnknown === 'object'
      ? (dataUnknown as Record<string, unknown>)
      : {}) as LogBody;

    const type = typeof data.type === 'string' ? data.type : 'log';
    const safe = {
      type,
      errorId: typeof data.errorId === 'string' ? data.errorId : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      stack:
        typeof data.stack === 'string' && process.env.NODE_ENV !== 'production'
          ? data.stack.slice(0, 5_000)
          : undefined,
      componentStack:
        typeof data.componentStack === 'string' && process.env.NODE_ENV !== 'production'
          ? data.componentStack.slice(0, 5_000)
          : undefined,
      path: typeof data.path === 'string' ? data.path : undefined,
      ua: typeof data.ua === 'string' ? data.ua : undefined,
      ts: Date.now(),
    } as const;

    if (type === 'error') console.error('[client-error]', safe);
    else console.log('[client-log]', safe);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[log-endpoint-failed]', err);
    return new Response(null, { status: 204 });
  }
}
