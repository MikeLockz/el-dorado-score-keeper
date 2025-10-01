# Next.js Observability Bootstrap (Browser Only)

The score keeper now ships purely as a static/browser application. HyperDX instrumentation only runs in the browser runtime; all server-side hooks, log endpoints, and Node SDK dependencies have been removed.

## Browser Provider

- `app/hyperdx-provider.tsx` wraps the app in a client component that lazily initialises `@hyperdx/browser` when `NEXT_PUBLIC_OBSERVABILITY_ENABLED` is truthy.
- Page views are tracked via `lib/observability/browser.ts` helpers once the provider resolves. The helpers sanitise attributes, attach environment/service metadata, and fallback to console logging in development builds.
- If credentials are missing or the flag is disabled, the helpers become harmless no-ops so Storybook, tests, and static exports stay stable.

## Client Logging

- `lib/client-log.ts` forwards events straight to the browser telemetry facade and mirrors them to the dev console. No fetches or sendBeacon calls are performed.
- Components such as `components/error-boundary.tsx` call `logEvent`, `captureBrowserException`, or `captureBrowserMessage` to keep user-facing errors consistent.

## Configuration

- Only the browser flag (`NEXT_PUBLIC_OBSERVABILITY_ENABLED`) is respected. `OBSERVABILITY_ENABLED` and other server-specific environment variables are ignored.
- When browser observability is enabled, the app expects `NEXT_PUBLIC_HDX_API_KEY` plus optional overrides (`NEXT_PUBLIC_HDX_HOST`, `NEXT_PUBLIC_HDX_SERVICE_NAME`, `NEXT_PUBLIC_APP_ENV`).

## Local Validation

1. Set `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true` and `NEXT_PUBLIC_HDX_API_KEY=<value>` in `.env.local`.
2. Run `pnpm dev` or `pnpm build && pnpm start` (static export).
3. Confirm the browser console logs `[observability] client log: …` when you trigger UI flows.
4. Inspect HyperDX to verify actions like `page.viewed` and `client.error` arrive with the expected attributes.

With all server code removed, HyperDX telemetry runs entirely in the browser and introduces no Node-only dependencies during build or runtime.
