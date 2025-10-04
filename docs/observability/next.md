# Next.js Observability Bootstrap (Browser Only)

The score keeper ships purely as a static/browser application. Observability instrumentation only runs in the browser runtime; all server-side hooks, log endpoints, and Node SDK dependencies have been removed.

## Browser Provider

- `app/browser-telemetry-provider.tsx` wraps the app in a client component that lazily initialises the browser telemetry facade when `NEXT_PUBLIC_OBSERVABILITY_ENABLED` is truthy.
- Provider selection flows through `config/observability-provider.ts` and the vendor registry. The default adapter resolves `@obs/browser-vendor/newrelic/browser-agent`. Selecting `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=custom` loads a dual adapter that forwards telemetry to both New Relic and PostHog (credentials for both must be present), and downstream builds can still shadow the module if they prefer a different split.
- Page views are tracked via `lib/observability/browser.ts` helpers once the provider resolves. The helpers sanitise attributes, attach environment/service metadata, and fall back to console logging in development builds.
- When a `page.viewed` event fires, the New Relic adapter mirrors the payload into `route.*` custom attributes and calls `newrelic.interaction().setName(...)` so SPA navigations show up with stable route names.
- If credentials are missing or the flag is disabled, the helpers become harmless no-ops so Storybook, tests, and static exports stay stable.

## Client Logging

- `lib/client-log.ts` forwards events straight to the browser telemetry facade and mirrors them to the dev console. No fetches or sendBeacon calls are performed.
- Components such as `components/error-boundary.tsx` call `logEvent`, `captureBrowserException`, or `captureBrowserMessage` to keep user-facing errors consistent.

## Configuration

- Only the browser flag (`NEXT_PUBLIC_OBSERVABILITY_ENABLED`) is respected. `OBSERVABILITY_ENABLED` and other server-specific environment variables are ignored.
- When browser observability is enabled, the app expects `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY` plus optional overrides (`NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST`, `NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME`, `NEXT_PUBLIC_APP_ENV`). New Relic agent boot additionally honours `NEXT_PUBLIC_NEW_RELIC_APP_ID` and `NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL` (defaulting to `https://js-agent.newrelic.com/nr-loader-spa-current.min.js`); missing agent variables trigger a graceful downgrade to the log shim with a development warning. Local development defaults to the log shim to avoid CORS issues—set `NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT=true`, run `NR_PROXY_TARGET=https://bam.nr-data.net pnpm observability:proxy`, and point the browser host/beacon env vars at the proxy when you need the full agent locally. Scheme prefixes on the beacon values are optional; they are stripped before configuring the agent, and we automatically set `ssl=false` so the proxy can stay on HTTP.
- `NEXT_PUBLIC_OBSERVABILITY_PROVIDER` accepts `newrelic`, `posthog`, or `custom`. The `custom` option enables the built-in dual adapter that emits to both stacks.

## Local Validation

1. Set `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true` and `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY=<value>` in `.env.local`.
2. Run `pnpm dev` or `pnpm build && pnpm start` (static export).
3. Confirm the browser console logs `[observability] client log: …` when you trigger UI flows.
4. Inspect New Relic (or your custom vendor) to verify actions like `page.viewed` and `client.error` arrive with the expected attributes.

## Usage Examples

```ts
import {
  trackBrowserEvent,
  captureBrowserException,
  captureBrowserMessage,
} from '@/lib/observability/browser';

trackBrowserEvent('game.started', { tableId: 'table-42' });
captureBrowserMessage('player.joined', {
  level: 'info',
  attributes: { playerId: 'p-17' },
});
try {
  // gameplay logic…
} catch (error) {
  captureBrowserException(error, { context: 'deal.generate' });
}
```

With all server code removed, browser telemetry remains optional, pluggable, and free of Node-only dependencies during build or runtime.
