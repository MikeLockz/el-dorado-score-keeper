import Link from 'next/link';

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
const STATIC_EXPORT_REDIRECT =
  process.env.NEXT_OUTPUT_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default function NotFound() {
  if (!STATIC_EXPORT_REDIRECT) {
    return (
      <div className="not-found">
        <h1>Page not found</h1>
        <p>The page you requested could not be located.</p>
        <p>
          <Link href="/">Return to the homepage</Link>
        </p>
      </div>
    );
  }

  const script = `
    (function () {
      try {
        var base = ${JSON.stringify(BASE_PATH)};
        var normalizedBase = base.replace(/\\/+$/, '');
        var path = window.location.pathname + window.location.search + window.location.hash;
        if (normalizedBase && path.startsWith(normalizedBase)) {
          path = path.slice(normalizedBase.length);
        }
        if (!path || path === '') {
          path = '/';
        } else if (path[0] !== '/') {
          path = '/' + path;
        }
        var target = (normalizedBase ? normalizedBase : '') + '/?redirect=' + encodeURIComponent(path);
        if (window.location.pathname + window.location.search !== target) {
          window.location.replace(target);
        }
      } catch (error) {
        console.error('Failed to redirect from static 404 fallback', error);
      }
    })();
  `;

  return (
    <div className="not-found-redirect" suppressHydrationWarning>
      <p>Redirecting to the requested view…</p>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <noscript>
        JavaScript is required to load saved sessions.{' '}
        <a href={BASE_PATH || '/'}>Return to the homepage</a>.
      </noscript>
    </div>
  );
}
