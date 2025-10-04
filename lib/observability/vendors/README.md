# Browser Telemetry Vendors

This directory houses the pluggable browser telemetry adapters used by the `BrowserTelemetry` facade. Each adapter must implement the `BrowserTelemetryAdapter` contract from `types.ts` so the rest of the app can remain vendor agnostic.

## Adding a new provider

1. Create a folder under `lib/observability/vendors/<provider-name>/` and export a default adapter that satisfies `BrowserTelemetryAdapter`.
2. Update `config/observability-provider.ts` with the new provider enum value so it can be selected via `NEXT_PUBLIC_OBSERVABILITY_PROVIDER`.
3. Register the adapter loader in `lib/observability/vendors/registry.ts`. Prefer dynamic `import()` calls so the bundle stays lean when the provider is disabled.
4. Extend `tests/unit/browser-telemetry.guard.test.ts` (or a new spec) to cover the provider’s init, action, and error flows. The guard suite already exercises mocked adapters and is a good starting point.

Adapters may optionally implement `setGlobalAttributes` and `getSessionUrl` if the vendor supports them. The defaults provided by `noop-adapter.ts` are safe fallbacks when optional hooks are unavailable.

## Template

```ts
import type { BrowserTelemetryAdapter } from '@/lib/observability/vendors/types';

const myVendorAdapter: BrowserTelemetryAdapter = {
  init: (config) => {
    // bootstrap the SDK here using values from config
  },
  addAction: (event, attributes) => {
    // forward structured events to the vendor SDK
  },
  recordException: (error, attributes) => {
    // report errors to the vendor SDK
  },
};

export default myVendorAdapter;
```

Keep adapter modules free of side effects so they can be tree-shaken when unused. If the vendor requires global script injection, wrap it in the adapter’s `init` method and guard it behind feature flags or configuration validation.
