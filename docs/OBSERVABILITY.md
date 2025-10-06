# Browser Observability Integration (New Relic Browser Agent)

The El Dorado score keeper runs entirely in the browser. Observability is delivered through a pluggable vendor registry that now ships the official New Relic Browser agent with an automatic log-ingest fallback. No Node.js runtime, OTLP collector, or `/api` endpoints are required.

---

## Goals

- Track high-signal user flows (page views, CTA clicks, unhandled errors) directly from the browser.
- Keep telemetry optional per environment through `NEXT_PUBLIC_OBSERVABILITY_ENABLED`.
- Avoid shipping personally identifiable information and keep payloads lightweight.
- Preserve developer ergonomics in local dev, CI, and tests without requiring server mocks.

---

## Architecture Overview

| Area                   | Implementation                                   | Notes                                                                   |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Next.js browser bundle | `lib/observability/browser.ts` + vendor registry | Lazy-loaded on the client, falls back to no-ops during static export    |
| Vendor adapters        | `lib/observability/vendors/<provider>`           | `newrelic/browser-agent` is the default; log shim retained for fallback |
| Client logging         | `lib/client-log.ts` + console fallbacks          | Emits structured events (`client.error`, etc.) without hitting `/api`   |
| Domain spans           | `lib/observability/spans.ts`                     | Reuses the active browser adapter when enabled, otherwise no-ops        |

There is no server runtime instrumentation, no `/api/log` route, and no dependency on Node-specific packages.

---

## Vendor Registry

- Provider selection lives in `config/observability-provider.ts` and defaults to `'newrelic'`.
- The browser loader (`lib/observability/browser.ts`) resolves the provider and imports the matching adapter via the bundler alias `@obs/browser-vendor/*`.
- `lib/observability/vendors/newrelic/browser-agent.ts` loads the official Browser agent, queues calls until the SDK is ready, and falls back to the in-repo log shim when configuration or loading fails.
- `lib/observability/vendors/newrelic/log-adapter.ts` remains as the lightweight fallback used when the agent cannot boot or when configuration is incomplete.
- `lib/observability/vendors/custom.ts` fans out telemetry to both PostHog and New Relic. Use `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=custom` (with both credentials configured) when you need dual analytics. Downstream consumers can still shadow this module if they prefer a different split.
- When a provider fails to load or throws during `init`, the loader degrades to a shared no-op adapter so the public telemetry helpers stay safe to call.

---

## Environment Variables

```
NEXT_PUBLIC_OBSERVABILITY_ENABLED=true
NEXT_PUBLIC_OBSERVABILITY_PROVIDER=newrelic      # or "custom" for downstream overrides
NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY=nr_browser_ingest_key
NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST=https://log-api.newrelic.com
NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME=el-dorado-score-keeper-web
NEXT_PUBLIC_APP_ENV=production

# Browser agent specific
NEXT_PUBLIC_NEW_RELIC_APP_ID=123456789
NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL=https://js-agent.newrelic.com/nr-loader-spa-current.min.js
NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY=nr_license_key      # optional override when agent key differs
NEXT_PUBLIC_NEW_RELIC_BROWSER_ACCOUNT_ID=1234567              # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_TRUST_KEY=1234567               # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_AGENT_ID=987654321              # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_XPID=1234567#12345              # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON=bam.nr-data.net          # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON=bam.nr-data.net    # optional
NEXT_PUBLIC_NEW_RELIC_BROWSER_INIT={"distributed_tracing":{"enabled":true}}
NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT=false

# PostHog (required when provider is "posthog" or "custom")
NEXT_PUBLIC_POSTHOG_KEY=phc_project_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # optional override
NEXT_PUBLIC_POSTHOG_DEBUG=false                     # optional verbose logging
```

- Leave the flag disabled (`false`) in local setups by default; enable it when you want to inspect telemetry.
- `NEXT_PUBLIC_OBSERVABILITY_PROVIDER` drives the vendor registry. Unknown values fall back to `newrelic` with a development warning.
- The default agent setup consumes the official loader script and configuration above. If any of the agent variables are missing, the vendor automatically downgrades to `log-adapter` while surfacing a development warning.
- When `NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL` is omitted we fall back to New Relic's `nr-loader-spa-current.min.js`, keeping the agent operational without extra configuration.
- Local dev defaults to the log fallback to avoid CORS failures from `bam.nr-data.net`. To run the full agent locally (for example via the proxy), set `NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT=true`, run `NR_PROXY_TARGET=https://bam.nr-data.net pnpm observability:proxy`, and point `NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST`, `NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON`, and `NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON` to the proxy origin (for example `http://localhost:5050`). Scheme prefixes on the beacon variables are optional; when present they are stripped automatically before configuring the agent and we force `ssl=false` so the agent will use plain HTTP against the proxy.
- New Relic log ingestion hosts reject requests from `localhost`. When exercising telemetry locally, run the lightweight proxy (`pnpm observability:proxy`) and point `NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST` to `http://localhost:5050` (or your chosen port). Optional overrides:

```
NR_PROXY_PORT=5050
NR_PROXY_TARGET=https://log-api.newrelic.com
NR_PROXY_VERBOSE=true
```

- The proxy injects permissive CORS headers and forwards requests to the upstream ingestion host.

---

## Browser Provider Lifecycle

- `app/browser-telemetry-provider.tsx` wraps the app in a client component.
- On first render (and whenever the path/search changes) it calls `ensureBrowserTelemetry()` which lazily initialises the active vendor and tracks `page.viewed` events.
- Errors during initialisation are logged via `captureBrowserException` and retried on the next render.
- Helper exports (`captureBrowserException`, `captureBrowserMessage`, `trackBrowserEvent`) remain stable regardless of the vendor in use.
- View-level helpers (`trackSinglePlayerView`, `trackScorecardView`, `trackPlayerDetailView`, etc.) emit entity-aware payloads so dashboards continue to resolve the active `gameId`, `scorecardId`, or roster/player identifier after the URL-driven navigation refactor.

---

## Logging and Error Reporting

- `lib/client-log.ts` exposes `logEvent(type, attributes)` which:
  - Resolves the active path (or `'unknown'` when `window` is unavailable).
  - Tracks the event through `trackBrowserEvent`.
  - Mirrors the payload to `console.info` in non-production builds for quick debugging.
- `components/error-boundary.tsx` calls `captureBrowserException` and `logEvent('client.error', …)` when React surfaces an error.
- Other components can import the same helpers to capture warnings (`captureBrowserMessage`) or domain-specific events.

---

## Spans and Diagnostics

- `lib/observability/spans.ts` hosts helper utilities (`withSpan`, `recordSpanError`). These use the active browser adapter when enabled.
- When observability is disabled, the helpers still invoke callbacks but skip span creation and only log to the console in development for debugging.
- Any errors outside of a browser context (e.g., Vitest running in Node) trigger a dev-mode warning instead of attempting to reach a server logger.

---

## Testing Strategy

- Unit tests stub the browser helper module (`@/lib/observability/browser`) or vendor aliases to assert the correct telemetry calls without pulling in real SDKs.
- Scripts and Vitest projects no longer reference Node-specific observability packages, so tests run without additional mocks.
- Playwright smoke tests can temporarily enable the browser flag to verify end-to-end telemetry if desired.

---

## Operational Checklist

1. Enable `NEXT_PUBLIC_OBSERVABILITY_ENABLED` and `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY` for the environment you want to observe.
2. Deploy the static site (GitHub Pages, Netlify, etc.).
3. Trigger common flows and verify events appear in New Relic with the right attributes.
4. Keep the vendor modules pinned in the repo and update intentionally when moving to a different provider.

The pluggable registry keeps the codebase ready for future vendor swaps while maintaining the current lightweight New Relic log shim.
