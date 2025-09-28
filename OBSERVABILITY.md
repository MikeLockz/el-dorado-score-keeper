# HyperDX Observability Integration

This document describes how to wire HyperDX into the El Dorado score keeper so we gain end-to-end visibility (traces, logs, metrics, and frontend events) without shipping personally identifiable information. The integration leans on HyperDX's managed OpenTelemetry collector and the official Next.js helpers.

---

## Goals and Scope

- Surface actionable telemetry for the Next.js 15 app, background jobs, and the Cloudflare analytics relay.
- Unify logs, traces, and metrics so we can pivot between them during incident response.
- Capture high-signal browser events (navigations, unhandled errors, slow interactions) in the same workspace as backend traces.
- Keep the integration opt-in per environment via environment variables; no telemetry is emitted when credentials are absent.

---

## Components at a Glance

| Area | Instrumentation | Expected Signals |
| ---- | --------------- | ---------------- |
| Next.js server (Node runtime) | HyperDX OpenTelemetry SDK (`@hyperdx/node-next`) | HTTP traces, route-level spans, custom spans, structured logs |
| Next.js browser bundle | HyperDX browser SDK (`@hyperdx/browser`) | Page views, UX timings, console errors, client logs |
| Edge runtime / route handlers | Same OTel init as Node; spans exported via OTLP | Edge handler traces, cold start metrics |
| Cloudflare analytics relay | OTel SDK for Workers (`@hyperdx/otel-worker`) | Worker request traces, fetch errors |
| CI & local dev | HyperDX CLI (`@hyperdx/cli`) for smoke validation | Local telemetry forwarding, redaction checks |

> Library names reflect the current HyperDX distribution. Verify versions with `pnpm view <package> versions` before landing changes.

---

## 1. Dependencies

Install the SDKs (runtime + browser) and the CLI helper. Lock exact versions in `package.json` to avoid surprise upgrades.

```bash
pnpm add -E @hyperdx/node-next @hyperdx/browser
pnpm add -D -E @hyperdx/cli
```

For Cloudflare Workers:

```bash
pnpm add -w -E @hyperdx/otel-worker --filter cloudflare-analytics-worker...
```

> Use `-E` to record the full semver and keep dependency updates intentional.

---

## 2. Environment Variables

Add the following variables to each deployment platform. Never commit secrets.

```
# Server / OTLP credentials
HYPERDX_API_KEY=hdx_prod_integration_key
HYPERDX_INGEST_URL=https://in-otel.hyperdx.io/v1/traces   # leave default if unused
HYPERDX_ENV=production
HYPERDX_SERVICE_NAME=el-dorado-score-keeper

# Browser SDK
NEXT_PUBLIC_HDX_API_KEY=hdx_browser_project_key
NEXT_PUBLIC_HDX_HOST=https://in.hyperdx.io   # optional override
NEXT_PUBLIC_APP_ENV=production

# Worker (optional override if using a dedicated key)
CLOUDFLARE_HDX_API_KEY=hdx_worker_key
CLOUDFLARE_HDX_SERVICE_NAME=analytics-relay
```

- Local development: create `.env.local` and `.dev.vars` (for Wrangler) with sandbox keys supplied by HyperDX.
- CI: store secrets in the GitHub Actions environment so preview deployments stream telemetry.

---

## 3. Server Instrumentation (Next.js)

1. Create `instrumentation.ts` at the repo root (Next.js auto-runs this before bootstrapping routes).

   ```ts
   // instrumentation.ts
   import { registerOTel } from '@hyperdx/node-next';
   import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

   export async function register() {
     if (process.env.NODE_ENV !== 'production') {
       diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
     }

     if (!process.env.HYPERDX_API_KEY) {
       return; // HyperDX disabled locally or in test runs
     }

     await registerOTel({
       serviceName: process.env.HYPERDX_SERVICE_NAME ?? 'el-dorado-score-keeper',
       environment: process.env.HYPERDX_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
       apiKey: process.env.HYPERDX_API_KEY,
       ingestUrl: process.env.HYPERDX_INGEST_URL,
       captureHttpHeaders: ['user-agent', 'x-request-id'],
       resourceAttributes: {
         'service.version': process.env.OMMIT_SHA ?? process.env.GIT_COMMIT ?? 'dev',
         'deployment.region': process.env.REGION ?? 'local',
       },
       enableConsoleInstrumentation: true,
       enableFsInstrumentation: false,
     });
   }
   ```

2. Next.js automatically bundles the OTel SDK during build and boot. Keep the file tree flat (no `import` cycles) to ensure the registration runs before any route handler executes.

3. Add a `prestart` hook to guard that instrumentation runs in production builds:

   ```json
   "scripts": {
     "prestart": "node -e \"require('./instrumentation.ts')\"",
     "start": "next start",
     "dev": "next dev",
     "build": "next build"
   }
   ```

4. Standardize structured logging:

   ```ts
   // lib/log.ts (new)
   import { telemetry } from '@hyperdx/node-next/log';

   export const log = telemetry.createLogger({
     service: process.env.HYPERDX_SERVICE_NAME ?? 'el-dorado-score-keeper',
     version: process.env.COMMIT_SHA ?? 'dev',
   });
   ```

   Replace `console.*` calls in API routes / server actions with `log.info`, `log.error`, etc. to ensure logs tie back to spans.

---

## 4. Browser Instrumentation

1. Create a client-provider component. This mirrors the PostHog provider pattern already in the repo.

   ```tsx
   // app/hyperdx-provider.tsx
   'use client';

   import { PropsWithChildren, useEffect } from 'react';
   import { init, captureException, captureMessage } from '@hyperdx/browser';
   import { usePathname } from 'next/navigation';

   const KEY = process.env.NEXT_PUBLIC_HDX_API_KEY;
   const HOST = process.env.NEXT_PUBLIC_HDX_HOST ?? 'https://in.hyperdx.io';

   export function HyperDXProvider({ children }: PropsWithChildren) {
     const pathname = usePathname();

     useEffect(() => {
       if (!KEY) return;
       init({
         apiKey: KEY,
         host: HOST,
         service: 'el-dorado-score-keeper-web',
         environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
         captureConsole: ['error', 'warn'],
         enablePerformance: true,
       });
     }, []);

     useEffect(() => {
       if (!KEY) return;
       window.HDX?.track('page.viewed', { pathname });
     }, [pathname]);

     return children;
   }

   export { captureException, captureMessage };
   ```

2. Wrap the root layout:

   ```tsx
   // app/layout.tsx
   import { HyperDXProvider } from './hyperdx-provider';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           <HyperDXProvider>
             {children}
           </HyperDXProvider>
         </body>
       </html>
     );
   }
   ```

3. Replace ad-hoc `console.error` calls in client components with `captureException` so errors ship with stack traces and breadcrumbs.

4. Optional: bridge to existing analytics events by forwarding PostHog actions to HyperDX (or conversely) when you want a unified funnel view.

---

## 5. Cloudflare Worker Instrumentation

1. Add the worker SDK:

   ```ts
   // cloudflare/analytics-worker/src/worker.ts
   import { wrapFetch, createWorkerTelemetry } from '@hyperdx/otel-worker';

   const telemetry = createWorkerTelemetry({
     apiKey: CLOUDFLARE_HDX_API_KEY,
     service: CLOUDFLARE_HDX_SERVICE_NAME ?? 'analytics-relay',
     environment: HYPERDX_ENV ?? 'production',
   });

   export default {
     async fetch(request: Request, env: Env, ctx: ExecutionContext) {
       return telemetry.trace('worker.fetch', async (span) => {
         span.setAttribute('worker.route', new URL(request.url).pathname);
         return wrapFetch(env, request, ctx);
       });
     },
   } satisfies ExportedHandler<Env>;
   ```

2. Add secrets to Wrangler:

   ```bash
   wrangler secret put CLOUDFLARE_HDX_API_KEY
   wrangler secret put CLOUDFLARE_HDX_SERVICE_NAME
   ```

3. Locally, run `pnpm exec hyperdx tunnel --service analytics-relay` while invoking the worker to stream traces into the dashboard.

---

## 6. Data Hygiene & PII Controls

- Redact player names or free-form text before logging. Prefer identifiers already used in state (UUIDs, hashed keys).
- Use HyperDX sampling rules to drop noisy spans (e.g., health checks). Start with 100% sampling, then tune.
- Configure event mappers on the HyperDX UI to drop query parameters like `?token=`.
- Ensure cookies and local storage values are excluded by leveraging the SDK's `attributeAllowList`.

---

## 7. Dashboards, Alerts, and Runbooks

1. **Dashboards**
   - App health: request throughput, latency percentiles, error ratio, slowest routes.
   - Frontend UX: Core Web Vitals, JS error counts, rage click heatmap.
   - Worker: Slack relay success rate, retry counts, outbound latency to Slack.

2. **Alerts**
   - Page load P95 > 4000 ms for 5 minutes.
   - API error rate > 2% for `/api/game/*`.
   - Worker outbound failures > 5 in 10 minutes.

3. **Runbooks**
   - Link each alert to a Notion/markdown runbook that explains triage steps and HyperDX queries to run.

---

## 8. Verification Workflow

1. `pnpm dev` with `.env.local` secrets -> confirm spans appear in HyperDX Live view.
2. `pnpm test` should still pass; instrumentation must not break Vitest (no global side effects).
3. Run a production build: `pnpm build && pnpm start`. Validate `register()` logs "HyperDX OTel registered" during boot.
4. Exercise the Cloudflare worker via `wrangler dev` and check for traces grouped under `analytics-relay`.

---

## 9. Rollout Plan

1. Land the server-side instrumentation behind feature flags. Default off until secrets exist.
2. Deploy to preview environment with sandbox keys; verify dashboards.
3. Switch production secrets in the deployment platform. Monitor error rates for regressions.
4. After stabilization, enforce structured logging and add lint rule banning `console.*` on the server.

---

## 10. FAQ

- **Do we need a backend collector?** No. HyperDX provides a managed OTLP endpoint when you supply the API key.
- **Will this affect bundle size?** The browser SDK adds ~12 KB gzipped. Lazy-load it if we notice LCP regressions.
- **How do we disable telemetry for E2E tests?** Omit the env vars (default behavior) or set `NEXT_PUBLIC_APP_ENV=test`, then conditionally skip `init`.

