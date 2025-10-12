import { STATIC_EXPORT_PLACEHOLDER } from './static-export';

const STATIC_EXPORT_RUNTIME = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

const INDEX_SUFFIX = '/index.txt';
const DYNAMIC_ROOT_SEGMENTS = new Set([
  'games',
  'players',
  'rosters',
  'scorecard',
  'single-player',
]);

let fetchPatched = false;

type RewriteDetails = {
  placeholderPath: string;
  actualId: string;
};

const joinPath = (segments: string[]): string => {
  if (segments.length === 0) {
    return '/';
  }
  return `/${segments.join('/')}`;
};

const withBasePath = (pathname: string): string => {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!BASE_PATH) {
    return normalized;
  }
  const base = BASE_PATH.startsWith('/') ? BASE_PATH : `/${BASE_PATH}`;
  return `${base}${normalized}`.replace(/\/{2,}/g, '/');
};

const stripBasePath = (pathname: string): { trimmed: string; hadBase: boolean } => {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!BASE_PATH) {
    return { trimmed: normalized, hadBase: false };
  }
  const base = BASE_PATH.startsWith('/') ? BASE_PATH : `/${BASE_PATH}`;
  if (normalized === base) {
    return { trimmed: '/', hadBase: true };
  }
  if (normalized.startsWith(`${base}/`)) {
    return { trimmed: normalized.slice(base.length), hadBase: true };
  }
  return { trimmed: normalized, hadBase: false };
};

const computeRewrite = (pathname: string): RewriteDetails | null => {
  if (!STATIC_EXPORT_RUNTIME) {
    return null;
  }

  const { trimmed } = stripBasePath(pathname);

  if (!trimmed.endsWith(INDEX_SUFFIX)) {
    return null;
  }

  const withoutSuffix = trimmed.slice(0, -INDEX_SUFFIX.length);
  const segments = withoutSuffix.split('/').filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const root = segments[0];
  if (!DYNAMIC_ROOT_SEGMENTS.has(root)) {
    return null;
  }

  const id = segments[1];
  if (!id || id === STATIC_EXPORT_PLACEHOLDER) {
    return null;
  }

  const placeholderSegments = [...segments];
  placeholderSegments[1] = STATIC_EXPORT_PLACEHOLDER;
  const placeholderPath = withBasePath(joinPath(placeholderSegments)) + INDEX_SUFFIX;

  return {
    placeholderPath,
    actualId: decodeURIComponent(id),
  };
};

export const isStaticExportRuntime = (): boolean => STATIC_EXPORT_RUNTIME;

export const ensureStaticExportFetchPatched = (): void => {
  if (!STATIC_EXPORT_RUNTIME) {
    return;
  }
  if (fetchPatched) {
    return;
  }
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const candidateUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);

      const parsed = new URL(candidateUrl, window.location.origin);
      const rewrite = computeRewrite(parsed.pathname);
      if (!rewrite) {
        return originalFetch(input as RequestInfo, init);
      }

      const placeholderUrl = new URL(parsed.toString());
      placeholderUrl.pathname = rewrite.placeholderPath;

      const response =
        input instanceof Request
          ? await originalFetch(new Request(placeholderUrl.toString(), input), init)
          : await originalFetch(placeholderUrl.toString(), init);

      if (!response.ok) {
        return response;
      }

      const text = await response.text();
      const updated = text.split(STATIC_EXPORT_PLACEHOLDER).join(rewrite.actualId);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return new Response(updated, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('[static-export] Failed to rewrite fetch request', error);
      return originalFetch(input as RequestInfo, init);
    }
  };

  fetchPatched = true;
};
