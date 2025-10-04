# PostHog Analytics Integration

This guide documents how to activate PostHog using the existing browser telemetry infrastructure (`BrowserTelemetryProvider` + adapter registry). The Cloudflare analytics worker remains optional; PostHog events flow straight from the browser bundle, keeping the payloads PII-free and aligned with the current observability helpers (`trackBrowserEvent`, `captureBrowserException`, `client-log`).

---

## Goals

- Reuse the browser telemetry adapter contract so PostHog and New Relic are interchangeable behind `NEXT_PUBLIC_OBSERVABILITY_PROVIDER`.
- Capture high-signal events (page views, new game lifecycle, player administration, round submission) without storing names, emails, or free-form text.
- Guarantee analytics stay dormant in environments without credentials or when the feature flag is disabled.
- Provide an auditable, testable integration that mirrors the existing observability patterns.

---

## 1. Dependencies and environment variables

1. Install the browser SDK:
   ```bash
   pnpm add posthog-js
   ```
2. Configure environment variables (never hard-code secrets). Analytics share the same gating flag used by observability:

   | Key                                  | Purpose                                                  | Example                    |
   | ------------------------------------ | -------------------------------------------------------- | -------------------------- |
   | `NEXT_PUBLIC_OBSERVABILITY_ENABLED`  | Feature flag; must be truthy for any browser telemetry.  | `true`                     |
   | `NEXT_PUBLIC_OBSERVABILITY_PROVIDER` | Choose the adapter: `newrelic`, `posthog`, or `custom`.  | `posthog`                  |
   | `NEXT_PUBLIC_POSTHOG_KEY`            | PostHog project API key (required when provider=posthog) | `phc_1234567890abcdef`     |
   | `NEXT_PUBLIC_POSTHOG_HOST`           | Optional ingestion host override.                        | `https://us.i.posthog.com` |
   | `NEXT_PUBLIC_POSTHOG_DEBUG`          | Optional debug toggle (truthy enables verbose logging).  | `true`                     |
   | `NEXT_PUBLIC_APP_ENV`                | Environment tag that surfaces on every event.            | `production`               |

   Optional (server-only) for ad-hoc HogQL queries:

   ```dotenv
   POSTHOG_PERSONAL_API_KEY=phx_your_personal_key
   ```

3. Restart the dev server so Next.js picks up the new env vars.

---

## 2. Implement the PostHog browser adapter

Create `lib/observability/vendors/posthog/browser-adapter.ts`. The adapter must satisfy `BrowserTelemetryAdapter` and guard against SSR contexts. It initializes PostHog exactly once, maps the generic telemetry contract into PostHog’s capture API, and enforces our PII rules.

```ts
// lib/observability/vendors/posthog/browser-adapter.ts
import posthog, { type PostHog } from 'posthog-js';
import {
  type BrowserTelemetryAdapter,
  type BrowserVendorInitConfig,
} from '@/lib/observability/vendors/types';
import { sanitizeAttributes } from '@/lib/observability/spans';

let client: PostHog | null = null;
let bootstrapped = false;

const isBrowser = () => typeof window !== 'undefined';

const mapEventName = (event: string) => {
  if (event === 'page.viewed') return '$pageview';
  if (event.startsWith('browser.')) return event; // already namespaced
  return event;
};

const ensureClient = () => {
  if (!client || !bootstrapped || !isBrowser()) {
    return null;
  }
  return client;
};

const toCaptureProperties = (attributes?: Record<string, unknown>) => {
  const sanitized = sanitizeAttributes(attributes) ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (value === undefined) continue;
    if (typeof value === 'function') continue;
    result[key] = value;
  }
  return result;
};

const resolveError = (error: unknown) => {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  return { message: 'Unknown error' };
};

const adapter: BrowserTelemetryAdapter = {
  init(config: BrowserVendorInitConfig) {
    if (!isBrowser()) return;
    if (bootstrapped) return;

    posthog.init(config.apiKey, {
      api_host: config.url,
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      persistence: 'localStorage',
      property_blacklist: ['$ip'],
      loaded: (instance) => {
        client = instance;
        client?.register({
          app: config.service,
          env: config.environment,
        });
      },
      debug: Boolean(config.debug),
    });

    bootstrapped = true;
  },

  setGlobalAttributes(attributes: Record<string, string>) {
    const active = ensureClient();
    if (!active) return;
    active.register(attributes);
  },

  addAction(event: string, attributes?: Record<string, unknown>) {
    const active = ensureClient();
    if (!active) return;
    const properties = toCaptureProperties(attributes);
    const name = mapEventName(event);
    active.capture(name, properties);
  },

  recordException(error: unknown, attributes?: Record<string, unknown>) {
    const active = ensureClient();
    if (!active) return;
    const details = resolveError(error);
    active.capture('browser.exception', {
      ...details,
      ...toCaptureProperties(attributes),
    });
  },

  getSessionUrl() {
    const active = ensureClient();
    const sessionUrl = active?.get_session_replay_url?.();
    return typeof sessionUrl === 'string' && sessionUrl.length ? sessionUrl : undefined;
  },
};

export default adapter;
```

Key points:

- `sanitizeAttributes` already strips undefined/null from observability payloads; reuse it.
- The adapter keeps PostHog dormant on the server and when the feature flag is disabled.
- Session replay is off by default (privacy). We still expose the optional session link for debugging when enabled in PostHog.
- `autocapture: false` avoids DOM event noise; every event must come from explicit instrumentation.

---

## 3. Wire the adapter into the registry

1. Export the adapter through the bundler alias so downstream builds can shadow it if needed. Add a barrel file:

   ```ts
   // lib/observability/vendors/posthog/index.ts
   export { default } from './browser-adapter';
   ```

2. Update the registry to lazy-load the new adapter:

   ```ts
   // lib/observability/vendors/registry.ts
   const registry = {
     newrelic: /* existing */,
     posthog: createLoader(async () => {
       const mod = await import('@obs/browser-vendor/posthog');
       const candidate = (mod && 'default' in mod ? mod.default : mod) as BrowserTelemetryAdapter | undefined;
       return candidate ?? createNoopBrowserAdapter();
     }),
     custom: /* existing */,
   } as const;
   ```

3. Vitest stubs that mock `@obs/browser-vendor/newrelic/browser-agent` should be updated to include a PostHog mock so tests stay deterministic.

When the provider resolves to `posthog`, `ensureBrowserTelemetry()` now initialises the adapter and the existing `BrowserTelemetryProvider` continues to emit one `page.viewed` per navigation.

---

### 3.1 Dual-provider option (`custom`)

Teams that need PostHog alongside New Relic can select `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=custom`. The custom adapter fans out browser telemetry calls to both vendors:

- Requires both PostHog (`NEXT_PUBLIC_POSTHOG_KEY` + optional host/debug) and New Relic credentials. Missing PostHog configuration logs a warning and skips initialisation; missing New Relic keys silently falls back to PostHog-only capture.
- Global attributes, event payloads, and exception reporting are forwarded to each adapter with the existing sanitisation and opt-out guards.
- `getSessionUrl()` prefers the PostHog session replay link when available, falling back to the New Relic agent if it ever exposes a session URL.

Analytics opt-out continues to call `posthog.opt_out_capturing()` whenever the provider is `posthog` or `custom`, so the dual mode still honours end-user privacy controls.

---

## 4. Event instrumentation strategy

Events flow through `trackBrowserEvent` (for domain telemetry) and `captureBrowserException` / `captureBrowserMessage` (for errors and structured logs). The PostHog adapter simply forwards those events, which keeps analytics and observability aligned.

| Source event (adapter) | PostHog event       | Properties (PII-safe)                                                   | Notes                                                    |
| ---------------------- | ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `page.viewed`          | `$pageview`         | `path`, `pathname`, `search`, `title`, `referrer`, `app`, `env`         | Fired by `BrowserTelemetryProvider` once per navigation. |
| `game.started`         | `game.started`      | `game_id` (UUID), `player_count`, `mode`, `source`, `env`               | Emit after successful reset/start in `lib/game-flow`.    |
| `players.added`        | `players.added`     | `game_id`, `added_count`, `total_players`, `input_method`, `env`        | Instrument aggregation points in `lib/state/players`.    |
| `round.finalized`      | `round.finalized`   | `game_id`, `round_number`, `scoring_variant`, `duration_seconds`, `env` | Emit post-commit in `lib/state/rounds`.                  |
| `browser.exception`    | `browser.exception` | `name`, `message`, `stack`, `context`, `env`                            | Called from error boundaries and guards.                 |

Implementation tips:

- Prefer emitting events from domain helpers (hooks, state modules) so UI components stay thin and duplicate flows still generate a single capture.
- Reuse `client-log.logEvent` where available; it already appends the current path and respects the same feature gate.
- Hash or derive identifiers when necessary (e.g., `game_id` should be opaque). Never forward player-entered strings.

---

## 5. Privacy guardrails

- Keep `property_blacklist: ['$ip']` (PostHog drops the IP before storage).
- Do not call `posthog.identify`; the adapter should stay anonymous. If a durable identifier becomes required, derive a UUIDv5 from `game_id + env` and register it via `posthog.group` instead of identify.
- Disable session recording by default. If re-enabled later, document retention windows and masking rules before rollout.
- Add unit tests that assert the payload shape for each adapter event and fail if unexpected keys (e.g., `name`, `email`, `raw_input`) appear.
- Respect local opt-out hooks by calling `posthog.opt_out_capturing()` when the existing analytics toggle is introduced (Phase 3).

---

## 6. QA checklist

- [ ] With `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true` and `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=posthog`, navigate the app locally; confirm only one `$pageview` per route in the PostHog live feed.
- [ ] Trigger game creation, player edits, and round submission flows; verify payloads contain counts/UUIDs only.
- [ ] Confirm `BrowserTelemetryProvider` tears down cleanly when navigating away (no console warnings on double init).
- [ ] Toggle the feature flag off and confirm `posthog-js` is absent from the production bundle (inspect `pnpm build` stats or the analyzer).
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test` with the new adapter mocked to confirm deterministic tests.

---

## 7. PostHog analysis patterns

### 7.1 Trends dashboard

1. Create a new Insight → Trends chart.
2. Select `game.started` and break down by `mode` to track adoption of single-player vs standard games.
3. Add `$pageview` as a second series filtered to `path = '/'`, then apply a formula `B / A` to estimate homepage-to-game conversion.

### 7.2 Funnels

1. Go to Insight → Funnels.
2. Define the steps: `$pageview` (`path = '/'`) → `players.added` → `round.finalized`.
3. Filter on `env = production` to remove development noise.
4. Save as "Round completion funnel" and pin to the shared dashboard.

### 7.3 HogQL snippets

```sql
SELECT
  toDate(timestamp)        AS day,
  countIf(event = 'game.started')        AS games_started,
  countIf(event = 'round.finalized')     AS rounds_finalized,
  round(
    countIf(event = 'round.finalized') * 1.0 /
    nullIf(countIf(event = 'game.started'), 0),
    2
  ) AS rounds_per_game
FROM events
WHERE
  timestamp >= dateSub('week', 4, now())
  AND properties["env"] = 'production'
GROUP BY day
ORDER BY day;
```

Run HogQL queries in the PostHog UI or via the API using `POSTHOG_PERSONAL_API_KEY` **server-side only**.

---

## 8. Rollout checklist

- [ ] Land the adapter, config tests, and provider wiring behind the existing observability flag.
- [ ] Update `docs/ANALYTICS.md` (or release notes) with the new provider details and opt-out expectations.
- [ ] Stage the change with a disposable PostHog project, validate the protocol, and scrub the feed for PII.
- [ ] Prepare a short announcement summarising available dashboards, filters, and privacy guardrails.
- [ ] After enabling in production, monitor event volume for 24 hours and adjust sampling or properties if necessary.

Following these steps keeps analytics aligned with the broader observability architecture while delivering actionable, privacy-safe insight into gameplay behaviour.

---

## 9. Phase 3 — Privacy controls & opt-out

Phase 3 introduces an end-user control that fully disables analytics capture, plus development-only assertions that stop PII from leaking into telemetry payloads. The changes live entirely in the browser bundle and reuse the existing observability plumbing so they apply to both PostHog and any future adapters.

### 9.1 Preference manager

- Create `lib/observability/privacy.ts` exposing:
  - `ANALYTICS_OPT_OUT_KEY = 'el-dorado:analytics:opt-out'` (localStorage namespace).
  - `getAnalyticsPreference(): 'enabled' | 'disabled'` (defaults to `enabled` when missing).
  - `setAnalyticsPreference(next: 'enabled' | 'disabled')` which persists to localStorage, emits a change event, and calls the active adapter’s opt-in/out hooks.
  - `subscribeToAnalyticsPreference(listener: (next: 'enabled' | 'disabled') => void): () => void` implementing a tiny pub/sub used by React hooks and the telemetry layer.
- PostHog-specific bridging lives behind a narrow helper exported by the vendor module (see §9.2). Call it from `setAnalyticsPreference` so `posthog.opt_out_capturing()` runs synchronously when the toggle flips, even before the adapter initialises.
- Keep a lazily populated in-memory cache so repeated reads avoid touching `localStorage`. Always wrap storage access in try/catch to support Safari private mode.

### 9.2 Browser telemetry integration

- Import the preference helpers into `lib/observability/browser.ts` and honour the opt-out state in three places:
  1. When building the telemetry instance, check `getAnalyticsPreference()`. If it returns `'disabled'`, skip adapter initialization and leave `activeTelemetry` as the noop implementation. Store the provider config so re-enabling can re-run `ensureBrowserTelemetry()` without a full reload.
  2. After a vendor successfully initialises, invoke `syncOptOut(preference)` exported from the PostHog vendor barrel (or a vendor-agnostic bridge once available) to ensure `posthog.opt_out_capturing()` runs before any events are sent.
  3. Wrap `track`, `captureException`, and `captureMessage` so they early-return when the preference is `'disabled'`.
- Register a subscription in the same module:
  ```ts
  subscribeToAnalyticsPreference((next) => {
    if (next === 'disabled') {
      activeTelemetry = noopTelemetry;
    } else {
      ensureBrowserTelemetry().catch(console.warn);
    }
  });
  ```
  This keeps runtime toggles instantaneous without forcing a full-page reload.
- Extend the PostHog adapter (`lib/observability/vendors/posthog/browser-adapter.ts`) with an exported `syncOptOut(preference)` helper that calls `posthog.opt_out_capturing()` / `opt_in_capturing()`. Re-export it via `lib/observability/vendors/posthog/index.ts` so the privacy module can defer to the vendor implementation instead of importing `posthog-js` twice.

### 9.3 Settings UI toggle

- Update `app/settings/page.tsx` with an analytics section below the theme picker. Use semantic markup (heading, description, checkbox) and reuse existing button styles for the label if desired.
- Extract the UI into `components/settings/analytics-opt-out.tsx` (client component) that:
  - Uses `useSyncExternalStore(subscribeToAnalyticsPreference, getAnalyticsPreference)` to stay in sync across tabs.
  - Renders a `Switch`-like control built from native `<input type="checkbox">` to keep accessibility trivial; tie the label to the control via `htmlFor`.
  - Calls `setAnalyticsPreference(next ? 'enabled' : 'disabled')` on change.
  - Shows helper text clarifying that disabling analytics stops all event capture (page views, lifecycle events) and persists per browser.
- Add a toast or inline confirmation in non-production builds to make it obvious that analytics paused. Keep production UX silent.
- Document the toggle in `docs/ANALYTICS.md`: surface where the setting lives and reiterate that it opts out of PostHog/New Relic traffic instantly.

### 9.4 Development payload guard

- Create `lib/observability/payload-guard.ts` exporting `assertTelemetryPropertiesSafe(event: string, props: Record<string, unknown>)`. In `NODE_ENV !== 'production'`, throw when a key matches the denylist (`name`, `first_name`, `last_name`, `full_name`, `email`, `message`, `raw_input`, `notes`, `address`, `phone`) or when a value is a plain string longer than 128 characters.
- In `lib/observability/browser.ts`, call the guard before invoking `activeAdapter.addAction`. Skip the guard entirely in production to avoid bundle weight.
- Extend the PostHog adapter tests to ensure the guard allows numeric/boolean payloads and blocks denied keys.

### 9.5 QA & validation

- [ ] Opt-out in the Settings page, reload the app, and confirm the preference persists plus PostHog live feed stays empty.
- [ ] Re-enable analytics without reloading; a subsequent navigation should emit a single `$pageview`.
- [ ] With `NODE_ENV=development`, intentionally emit `trackBrowserEvent('test', { name: 'Ada' })` and verify the guard throws with an actionable error.
- [ ] Confirm PostHog’s debug mode logs `Analytics disabled via opt-out` when preference is off (helps support triage).

These guardrails keep analytics privacy-first while letting curious players opt out without affecting teammates.

---

## 10. Phase 4 — Dashboards & automation

Phase 4 codifies the PostHog dashboards that product and support teams rely on. Instead of manually recreating charts in every environment, we ship a small Node.js script that upserts insights through the PostHog REST API. The workflow stays repeatable, version-controlled, and safe for production.

### 10.1 API authentication & configuration

- Generate a [personal API key](https://posthog.com/docs/api/api-keys) with **write** access to the target PostHog project. Store it in `.env.local` (and your secrets manager) as `POSTHOG_PERSONAL_API_KEY`.
- Capture the numeric project ID from `Project settings → Project ID`. Expose it to the script via `POSTHOG_PROJECT_ID`.
- Optionally override the host (defaults to `https://app.posthog.com`) with `POSTHOG_API_HOST` for self-hosted clusters.

| Key                      | Scope        | Purpose                                                  | Example                        |
| ------------------------ | ------------ | -------------------------------------------------------- | ------------------------------ |
| `POSTHOG_PERSONAL_API_KEY` | script only | Authenticates the REST calls (never commit this).        | `phx_live_abcdefghijklmnopqrstuvwxyz` |
| `POSTHOG_PROJECT_ID`     | script only  | Targets the correct project (`/api/projects/:id`).       | `12345`                        |
| `POSTHOG_API_HOST`       | script only  | Optional API base URL override for self-hosted PostHog.  | `https://posthog.internal`     |

The bootstrap script reads the variables at runtime; missing configuration should throw a descriptive error immediately.

### 10.2 Bootstrap script layout

Create `scripts/posthog/bootstrap-dashboards.ts` with the following structure:

1. **Config resolver** – Collects env vars, coerces `POSTHOG_PROJECT_ID` to a number, and defines defaults (`apiHost`, `dryRun`, etc.).
2. **Lightweight PostHog client** – Wrap `fetch` (Node 18+) to send authenticated requests with the `Authorization: Bearer <personal key>` header. Handle non-2xx responses by printing contextual errors and exiting with `process.exitCode = 1`.
3. **Upsert helpers** – Abstract `getInsightByName`, `createInsight`, and `updateInsight` calls so every dashboard definition becomes a pure data object (name, description, filters, `query` payload).
4. **Entry point** – Assemble the desired insights, upsert each sequentially (or via `Promise.allSettled`), log created/updated IDs, and exit cleanly. Support a `--dry-run` flag that prints payload diffs without performing writes.

Keep the script synchronous from the CLI perspective (await all promises). Use `console.table` for a human-readable summary in CI logs.

Example scaffold:

```ts
// scripts/posthog/bootstrap-dashboards.ts
import process from 'node:process';

type InsightKind = 'TRENDS' | 'FUNNELS' | 'SQL';

interface InsightDefinition {
  name: string;
  description?: string;
  tags?: string[];
  query: Record<string, unknown>;
  filters?: Record<string, unknown>;
  kind: InsightKind;
}

interface CliConfig {
  apiHost: string;
  apiKey: string;
  projectId: number;
  dryRun: boolean;
  json: boolean;
}

const loadConfig = (): CliConfig => {
  const {
    POSTHOG_API_HOST,
    POSTHOG_PERSONAL_API_KEY,
    POSTHOG_PROJECT_ID,
  } = process.env;

  if (!POSTHOG_PERSONAL_API_KEY) {
    throw new Error('Missing POSTHOG_PERSONAL_API_KEY — generate a personal key with write scope.');
  }

  const projectId = Number(POSTHOG_PROJECT_ID);
  if (!Number.isInteger(projectId)) {
    throw new Error('POSTHOG_PROJECT_ID must be an integer project identifier.');
  }

  const flags = new Set(process.argv.slice(2));

  return {
    apiHost: POSTHOG_API_HOST ?? 'https://app.posthog.com',
    apiKey: POSTHOG_PERSONAL_API_KEY,
    projectId,
    dryRun: flags.has('--dry-run'),
    json: flags.has('--json'),
  };
};

const fetchJson = async <T>(config: CliConfig, input: string, init?: RequestInit) => {
  const response = await fetch(new URL(input, config.apiHost), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PostHog API ${response.status} ${response.statusText}: ${body}`);
  }

  return (await response.json()) as T;
};

// …define getInsightByName, createInsight, updateInsight utilities...
```

Splitting the definitions (name, filters, query payload) from the HTTP plumbing keeps the script testable. Mock `fetchJson` in unit tests to simulate API outcomes.

### 10.3 Insight definitions

Model each dashboard component as a typed constant so changes are reviewable:

- **Trends chart** (`insight: 'TRENDS'`): filters on `event = 'game.started'`, breakdown by `properties.mode`, weekly interval, and legend labels that match the in-app terminology.
- **Funnel** (`insight: 'FUNNELS'`): three ordered steps — `$pageview` (`properties.path = '/'`), `players.added`, `round.finalized`. Enforce the `ordered = true`, `funnel_visualization_type = 'FUNNEL'`, and a 30-minute conversion window.
- **HogQL tile** (`insight: 'SQL'`): store the query shown in §7.3 verbatim inside `filters.query`. Attach a brief description and tags like `['automation', 'el-dorado']`.

Represent filters using the PostHog typed schema (e.g., `filters.date_from`, `filters.interval`). When updating an existing insight, merge on the server-side ID but overwrite the filters to avoid drift.

Reference payloads:

```ts
const insights: InsightDefinition[] = [
  {
    name: 'Game Starts by Mode',
    description: 'Weekly trend of games started segmented by mode.',
    tags: ['automation', 'el-dorado'],
    kind: 'TRENDS',
    filters: {
      events: [
        {
          id: 'game.started',
          math: 'total',
          type: 'events',
          name: 'game.started',
        },
      ],
      breakdown_type: 'event',
      breakdown: 'properties.mode',
      interval: 'week',
      insight: 'TRENDS',
      legend: ['Standard', 'Single Player'],
      date_from: '-90d',
    },
    query: {
      kind: 'TrendsQuery',
      series: [
        {
          event: 'game.started',
          math: 'total',
          name: 'game.started',
        },
      ],
      breakdown: {
        type: 'event',
        property: 'mode',
      },
      interval: 'week',
      filterTestAccounts: true,
    },
  },
  {
    name: 'Round Completion Funnel',
    description: 'Homepage visits progressing through player setup to the first completed round.',
    tags: ['automation', 'el-dorado'],
    kind: 'FUNNELS',
    filters: {
      events: [
        {
          id: '$pageview',
          math: 'total',
          name: '$pageview',
          type: 'events',
          properties: [{ key: 'path', value: '/', operator: 'exact', type: 'event' }],
        },
        { id: 'players.added', math: 'total', name: 'players.added', type: 'events' },
        { id: 'round.finalized', math: 'total', name: 'round.finalized', type: 'events' },
      ],
      funnel_order_type: 'strict',
      funnel_window_interval: 30,
      funnel_window_interval_unit: 'minute',
      insight: 'FUNNELS',
      date_from: '-30d',
    },
    query: {
      kind: 'FunnelsQuery',
      steps: [
        {
          event: '$pageview',
          properties: [{ key: 'path', value: '/', operator: 'exact', type: 'event' }],
        },
        { event: 'players.added' },
        { event: 'round.finalized' },
      ],
      funnelWindowInterval: 30,
      funnelWindowIntervalUnit: 'minute',
      order: 'strict',
    },
  },
  {
    name: 'Rounds per Game (HogQL)',
    description: 'Daily aggregate of rounds per game using HogQL.',
    tags: ['automation', 'el-dorado'],
    kind: 'SQL',
    filters: {
      query: `SELECT\n  toDate(timestamp) AS day,\n  countIf(event = 'game.started') AS games_started,\n  countIf(event = 'round.finalized') AS rounds_finalized,\n  round(countIf(event = 'round.finalized') * 1.0 / nullIf(countIf(event = 'game.started'), 0), 2) AS rounds_per_game\nFROM events\nWHERE timestamp >= dateSub('week', 4, now())\n  AND properties["env"] = 'production'\nGROUP BY day\nORDER BY day` ,
      insight: 'SQL',
    },
    query: {
      kind: 'HogQLQuery',
      query: `SELECT\n  toDate(timestamp) AS day,\n  countIf(event = 'game.started') AS games_started,\n  countIf(event = 'round.finalized') AS rounds_finalized,\n  round(countIf(event = 'round.finalized') * 1.0 / nullIf(countIf(event = 'game.started'), 0), 2) AS rounds_per_game\nFROM events\nWHERE timestamp >= dateSub('week', 4, now())\n  AND properties["env"] = 'production'\nGROUP BY day\nORDER BY day`,
    },
  },
];
```

Align the `filters` and `query` payloads with PostHog’s schema version present in the target environment. The automation script can reuse the same data structure for both request bodies to keep drift minimal.

### 10.4 CLI wiring & documentation

- Expose the script via `package.json`:
  ```json
  {
    "scripts": {
      "posthog:bootstrap": "tsx scripts/posthog/bootstrap-dashboards.ts"
    }
  }
  ```
- Mention the command in `docs/ANALYTICS.md` along with the insight names and URLs produced on the first run. Include guidance for re-running after schema changes.
- Add the new step to the release checklist so every environment executes the bootstrap when analytics events evolve.

### 10.5 QA & validation

- Run `pnpm posthog:bootstrap --dry-run` locally to confirm payloads look correct without modifying production data.
- Execute the script against a staging project; verify the dashboards land with the intended filters and no duplicates. Re-run to ensure idempotency logs `updated` instead of `created`.
- Capture the resulting insight IDs and paste them into the documentation for quick navigation by product/support.
- Commit script fixtures and unit tests that mock the PostHog API to guarantee the upsert flow remains stable as the script evolves.

---

## 11. Phase 5 — Rollout & monitoring

Phase 5 makes analytics production-ready. The goal is to ship a playbook that enables PostHog in controlled stages, surfaces adapter failures without breaking gameplay, and gives engineers a lightweight way to confirm events during incidents.

### 11.1 Staged enablement checklist

- Document the rollout procedure in `docs/RELEASE.md` (or the central release runbook). Recommended flow:
  1. Enable `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=posthog` in the staging environment with a disposable project key.
  2. Validate dashboards (Phase 4) and privacy toggles (Phase 3) for 24 hours.
  3. Update production secrets, deploy behind a feature toggle, and monitor traffic for unexpected spikes or PII.
  4. Announce GA once dashboards populate and guardrails (opt-out + payload guard) stay green in logs.
- Record rollback steps next to the rollout instructions: flip the provider back to `newrelic` or set `NEXT_PUBLIC_OBSERVABILITY_ENABLED=false`, redeploy, and rotate the PostHog key if it leaked during testing.
- Link to the PostHog project, dashboard URLs, and alert channels so responders have one destination when ramping up.

### 11.2 Adapter resilience & observability

- Wrap adapter initialisation and capture calls in `try/catch` blocks that forward exceptions to `captureBrowserException` or `captureBrowserMessage` with `level=warning`. The adapter should never throw through to UI components.
- Add structured breadcrumbs (e.g., `analytics.adapter.status = 'initialized' | 'failed'`) when `ensureBrowserTelemetry()` resolves. This keeps the telemetry status visible in error traces.
- When the preference state disables analytics, log a single debug message (`Analytics disabled via opt-out`) if `NEXT_PUBLIC_POSTHOG_DEBUG` is truthy so engineers can distinguish opt-outs from silent failures.
- Surface adapter health in the existing logging pipeline by exposing `getDiagnostics()` from the telemetry module. Include fields like `provider`, `bootstrapped`, and `lastError` so the debug overlay can render status without touching PostHog directly.

### 11.3 Developer debug overlay

- Extend the developer overlay (or add `components/debug/analytics-panel.tsx`) that subscribes to the telemetry event stream exposed by `BrowserTelemetryProvider`.
- Display the last ~10 events with timestamp, event name, and sanitised properties. Avoid rendering raw JSON; format as key/value pairs capped at 80 characters to preserve the no-PII guarantee.
- Show aggregate counters (`page.viewed`, `game.started`, `round.finalized`) since page load so engineers can confirm flows without opening PostHog.
- Gate the overlay behind `NODE_ENV !== 'production'` and a keyboard shortcut (e.g., `Shift+Alt+A`) so it never ships to players.
- Surface an inline warning when analytics are disabled, pointing to the settings toggle from Phase 3. This reduces confusion during support triage.

### 11.4 Runbook & incident response

- Create `docs/runbooks/analytics.md` detailing:
  - How to verify PostHog ingestion (live feed, dashboards, `pnpm posthog:bootstrap --dry-run`).
  - How to rotate keys and invalidate sessions if secrets leak.
  - Contact points (Slack channel, escalation rotation) for analytics outages.
- Add a quarterly reminder to audit dashboards: confirm filters align with the latest event schema, prune stale insights, and revalidate opt-out behaviour.
- Update the CHANGELOG template with an "Analytics" subsection reminding authors to note event/schema changes.

### 11.5 QA & validation

- [ ] Walk through the rollout checklist in staging using the new runbook; update language where friction arises.
- [ ] Toggle the provider between `newrelic` and `posthog` during a single session to ensure adapter swap is graceful and events continue streaming.
- [ ] Force adapter failures (invalid key, blocked network) and confirm the UI stays usable while warnings surface via `captureBrowserMessage` and the debug overlay.
- [ ] Verify the overlay hides in production builds and that opt-out states propagate to the overlay status indicator.
- [ ] After production enablement, monitor dashboards and log pipelines for 24 hours; record observations in the runbook for future reference.

---
