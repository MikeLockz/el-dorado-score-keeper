import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => ({}));
    const type = typeof data?.type === 'string' ? data.type : 'log';
    const safe = {
      type,
      errorId: typeof data?.errorId === 'string' ? data.errorId : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
      stack:
        typeof data?.stack === 'string' && process.env.NODE_ENV !== 'production'
          ? data.stack.slice(0, 5_000)
          : undefined,
      componentStack:
        typeof data?.componentStack === 'string' && process.env.NODE_ENV !== 'production'
          ? data.componentStack.slice(0, 5_000)
          : undefined,
      path: typeof data?.path === 'string' ? data.path : undefined,
      ua: typeof data?.ua === 'string' ? data.ua : undefined,
      ts: Date.now(),
    } as const;

    // eslint-disable-next-line no-console
    if (type === 'error') console.error('[client-error]', safe);
    else console.log('[client-log]', safe);

    return new Response(null, { status: 204 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[log-endpoint-failed]', err);
    return new Response(null, { status: 204 });
  }
}
