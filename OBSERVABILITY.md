# HyperDX Observability Integration (Browser-Only)

The El Dorado score keeper now runs entirely as a client-side application. HyperDX instrumentation is confined to the browser bundle so no Node.js runtime, OTLP collector, or `/api` endpoints are required. This document captures the current shape of the integration and how to work with it.

---

## Goals

- Track high-signal user flows (page views, CTA clicks, unhandled errors) directly from the browser.
- Keep telemetry optional per environment (`NEXT_PUBLIC_OBSERVABILITY_ENABLED`).
- Avoid shipping personally identifiable information and keep payloads lightweight.
- Preserve developer ergonomics in local dev, CI, and tests without requiring server mocks.

---

## Architecture Overview

| Area                   | Implementation                     | Notes                                                                     |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Next.js browser bundle | `@hyperdx/browser` via provider    | Lazy-loaded on the client, no impact when disabled or during static export |
| Client logging         | `lib/client-log.ts` + console fallbacks | Emits structured events (`client.error`, etc.) without hitting `/api`    |
| Domain spans           | `lib/observability/spans.ts`       | Reuses the HyperDX browser SDK when enabled, otherwise devolves to no-ops |

There is no server runtime instrumentation, no `/api/log` route, and no dependency on `@hyperdx/node-next` or other Node-specific packages.

---

## Dependencies

Install only the browser SDK (already present in `package.json`):

```bash
pnpm add -E @hyperdx/browser
```

The CLI (`@hyperdx/cli`) remains available for optional smoke testing but is not required for core functionality.

---

## Environment Variables

```
NEXT_PUBLIC_OBSERVABILITY_ENABLED=true
NEXT_PUBLIC_HDX_API_KEY=hdx_browser_project_key
NEXT_PUBLIC_HDX_HOST=https://in.hyperdx.io   # optional
NEXT_PUBLIC_HDX_SERVICE_NAME=el-dorado-score-keeper-web   # optional override
NEXT_PUBLIC_APP_ENV=production               # optional environment tag
```

- Leave the flag disabled (`false`) in local setups by default; enable it when you want to inspect HyperDX events.
- Remove any legacy `OBSERVABILITY_ENABLED`, `HYPERDX_API_KEY`, or server-only variables—they no longer have an effect.
- HyperDX blocks `localhost` origins. When you want to exercise telemetry locally, run the lightweight proxy (`pnpm observability:proxy`) and point `NEXT_PUBLIC_HDX_HOST` to `http://localhost:5050` (or your chosen port). Optional overrides:

```
HDX_PROXY_PORT=5050
HDX_PROXY_TARGET=https://in.hyperdx.io
```

- The proxy injects permissive CORS headers and forwards requests to the upstream ingestion host.

---

## Browser Provider

- `app/hyperdx-provider.tsx` is a client component that wraps the app.
- On first render (and whenever the path/search changes) it initialises `@hyperdx/browser` via `ensureBrowserTelemetry()`.
- The provider tracks `page.viewed` with the current URL, title, and referrer. Duplicate page views are ignored.
- Errors during initialisation are logged via `captureBrowserException` and retried when the provider renders again.

---

## Logging and Error Reporting

- `lib/client-log.ts` exposes `logEvent(type, attributes)` which:
  - Resolves the active path (or `'unknown'` when `window` is unavailable).
  - Tracks the event through `trackBrowserEvent`.
  - Mirrors the payload to `console.info` in non-production builds for quick debugging.
- `components/error-boundary.tsx` calls `captureBrowserException` and `logEvent('client.error', …)` when React surfaces an error. No network request is performed.
- Other components can import the same helpers to capture warnings (`captureBrowserMessage`) or domain-specific events.

---

## Spans and Diagnostics

- `lib/observability/spans.ts` hosts helper utilities (`withSpan`, `recordSpanError`). These use the browser tracer when available.
- When observability is disabled, the helpers still invoke callbacks but skip span creation and only log to the console in development for debugging.
- Any errors outside of a browser context (e.g. Vitest running in Node) trigger a dev-mode warning instead of attempting to reach a server logger.

---

## Testing Strategy

- Unit tests stub the browser helper module (`@/lib/observability/browser`) to assert the correct telemetry calls without pulling in the real SDK.
- Scripts and Vitest projects no longer reference Node-specific HyperDX packages, so tests run without additional mocks.
- Playwright smoke tests can still enable the browser flag to verify end-to-end telemetry if desired.

---

## Operational Checklist

1. Enable `NEXT_PUBLIC_OBSERVABILITY_ENABLED` and `NEXT_PUBLIC_HDX_API_KEY` for the environment you want to observe.
2. Deploy the static site (GitHub Pages, Netlify, etc.).
3. Trigger common flows and verify events (`page.viewed`, `client.error`, domain spans) appear in HyperDX with the right attributes.
4. Keep the SDK version pinned in `package.json` and update intentionally.

With the server footprint removed, the observability stack remains lightweight, browser-only, and compatible with fully static hosting.
