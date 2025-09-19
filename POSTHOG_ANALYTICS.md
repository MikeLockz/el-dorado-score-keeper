# PostHog Analytics Integration

This guide describes how to instrument PostHog analytics in the El Dorado score keeper without using the existing analytics relay worker. The goal is to capture page views and core user actions (starting a game, adding players, finalizing rounds) while keeping the event payload free of personally identifiable information (PII).

---

## 1. Install and configure PostHog

1. Add the client library:
   ```bash
   pnpm add posthog-js
   ```
2. Expose the PostHog project credentials to the browser (values supplied via the deployment platform):
   ```dotenv
   # .env.local (never commit)
   NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_api_key
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or your self-hosted domain
   NEXT_PUBLIC_APP_ENV=development                     # development | preview | production
   ```
3. (Optional) Persist a personal API key locally for ad-hoc HogQL queries. Keep this server-side only:
   ```dotenv
   POSTHOG_PERSONAL_API_KEY=phx_your_personal_api_key
   ```
4. Restart the dev server so the new environment variables are available.

---

## 2. Bootstrap the PostHog client

Create a dedicated client component so we initialize PostHog once and expose helper hooks to the rest of the UI.

```tsx
// app/posthog-provider.tsx (new, client component)
'use client';

import { PropsWithChildren, useEffect } from 'react';
import posthog from 'posthog-js';
import { usePathname, useSearchParams } from 'next/navigation';

const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

if (typeof window !== 'undefined' && PH_KEY) {
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    capture_pageview: false, // handled manually to avoid duplicates with app router
    persistence: 'localStorage',
    property_blacklist: ['$ip'],
  });
}

export function PostHogProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!PH_KEY) return;

    posthog.register({
      app: 'el-dorado-score-keeper',
      env: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
    });
  }, []);

  useEffect(() => {
    if (!PH_KEY) return;

    const path = pathname || '/';
    const query = searchParams?.toString();
    posthog.capture('$pageview', {
      path,
      query_string: query ?? '',
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
```

Wire the provider into the shared layout so every route is covered:

```tsx
// app/layout.tsx
import { PostHogProvider } from './posthog-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
```

> If `NEXT_PUBLIC_POSTHOG_KEY` is undefined we leave PostHog dormant, which keeps local development noise-free.

---

## 3. Instrument key user actions

The application already centralizes several flows in reusable hooks; instrument them so events fire regardless of where the UI is rendered.

### 3.1 Start a new game

`lib/game-flow.ts` exposes `useNewGameRequest`. After the game creation succeeds, capture a `game_started` event with metadata that helps downstream analysis but avoids PII:

```ts
import posthog from 'posthog-js';

const onSuccess = (game: GameRecord) => {
  posthog.capture('game_started', {
    game_id: game.id, // hashed/uuid value from state, not player-provided
    player_count: game.players.length,
    mode: game.settings.mode, // e.g. 'standard' | 'single-player'
    source: 'games_page_cta', // distinguish entry points
  });
};
```

### 3.2 Add players

Player management runs through `lib/state/players.ts`. Capture a `players_added` event with aggregated counts, not names:

```ts
posthog.capture('players_added', {
  game_id: currentGame.id,
  added_count: sanitizedPlayers.length,
  total_players: currentGame.players.length,
  input_method: context === 'bulk_import' ? 'bulk' : 'single',
});
```

Ensure `sanitizedPlayers` strips empty slots and excludes raw strings before the capture to avoid leaking names.

### 3.3 Finalize a round

The scorecard flow persists rounds through `lib/state/rounds.ts`. After a round is committed, emit `round_finalized`:

```ts
posthog.capture('round_finalized', {
  game_id: game.id,
  round_number: submittedRound.index,
  scoring_variant: submittedRound.variant, // e.g. 'standard', 'tiebreaker'
  duration_seconds: Math.min(elapsedMs / 1000, 3600),
});
```

> Instrument close to the persistence layer so data is sent exactly once regardless of UI duplication (mobile vs desktop, modals, etc.).

---

## 4. Event catalog

| Event             | Purpose                                 | Key properties (PII-safe)                                               |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `$pageview`       | Track every navigated route.            | `path`, `query_string` (trimmed), `app`, `env`                          |
| `game_started`    | User creates a new game session.        | `game_id`, `player_count`, `mode`, `source`, `env`                      |
| `players_added`   | Bulk or incremental player entry.       | `game_id`, `added_count`, `total_players`, `input_method`, `env`        |
| `round_finalized` | A scoring round is completed and saved. | `game_id`, `round_number`, `scoring_variant`, `duration_seconds`, `env` |

All IDs should be opaque UUIDs already produced by the state layer. Never include player names, email addresses, or free-text fields. When in doubt, hash values server-side (e.g., `sha256` with a project salt) before capture.

---

## 5. Governance and privacy guardrails

- Keep `property_blacklist: ['$ip']` in the PostHog config so IP addresses are dropped.
- Do not call `posthog.identify` with user-provided names. If a persistent identifier is required later, derive a UUIDv5 from `game_id` + environment so it stays pseudonymous.
- Include automated tests (or runtime asserts) that validate we pass counts and enums, not strings keyed by user input.
- Provide an opt-out if required: expose a toggle that calls `posthog.opt_out_capturing()` and persist the preference in local storage.

---

## 6. QA checklist

- [ ] With `NEXT_PUBLIC_POSTHOG_KEY` defined, navigate through the app locally; verify events in the PostHog live events feed.
- [ ] Confirm that events include the `app` and `env` properties by default (`posthog.register`).
- [ ] Exercise key paths twice to ensure we are not double-firing events (especially page views on back/forward).
- [ ] Temporarily log payloads in development to confirm no PII leaks before enabling PostHog in production builds.

---

## 7. Querying in PostHog

### 7.1 Trends dashboard

1. Create a new Insights → Trends chart.
2. Select the `game_started` event and break down by the `mode` property to compare single-player vs standard adoption.
3. Add a formula to compute the conversion rate from `pageview` to `game_started` by selecting both series and using `B / A`.

### 7.2 Funnels

1. Navigate to Insights → Funnels.
2. Define the steps: `$pageview` (`path` = `/`), `players_added`, `round_finalized`.
3. Apply filters `env = production` to remove development noise.
4. Save as "Round completion funnel" and pin it to the team dashboard.

### 7.3 HogQL (SQL-like) queries

When you need custom reporting, open the SQL workspace and run queries such as:

```sql
SELECT
  toDate(timestamp) AS day,
  countIf(event = 'game_started') AS games_started,
  countIf(event = 'round_finalized') AS rounds_finalized,
  round(countIf(event = 'round_finalized') * 1.0 / nullIf(countIf(event = 'game_started'), 0), 2) AS rounds_per_game
FROM events
WHERE
  timestamp >= dateSub('week', 4, now())
  AND properties["env"] = 'production'
GROUP BY day
ORDER BY day ASC;
```

For local experimentation you can run HogQL via the PostHog API using `POSTHOG_PERSONAL_API_KEY`, but do not ship that key with the client bundle.

---

## 8. Rollout checklist

- [ ] Land the provider and hook-level instrumentation behind a feature flag (e.g., `ANALYTICS_ENABLED`) so you can safely toggle in staging.
- [ ] Prepare a short change announcement with links to the dashboards created above.
- [ ] After enabling in production, monitor PostHog for 24 hours to confirm volume and guardrails behave as expected.

By following the steps above we capture actionable analytics while keeping the dataset free of PII and aligned with the app router architecture.
