# Implement Front-End Hierarchy (v2 UI)

Purpose: Build a robust v2 front-end from scratch while reusing existing domain/state and UI primitives where possible so all current functionality is preserved or improved. This plan combines IA, technology choices, migration strategy, and component hierarchy into actionable, gated phases. Each phase must be formatted, linted, type-checked, and tested, with docs updated and committed before starting the next.

Scope: Parallel UI delivered under `/v2/*` while legacy UI remains functional. Reuse `lib/state` (event-sourced) and existing UI primitives, add adapters/selectors as needed. Multiplayer is phased; Scorecard and Single Player reach parity first.

Principles

- Modular by domain: Feature folders and shared primitives reduce duplication.
- Reuse effectively: Keep `lib/state` events/selectors as source of truth; enhance via selectors.
- Predictable state: Normalized entities; per-mode slices; ephemeral UI state via providers.
- Server/Client boundaries: Pages/layouts (RSC) above interactive client islands.
- Accessibility and mobile-first: Keyboard, ARIA, high contrast, thumb-friendly, predictable nav.
- Snapshot fidelity: Immutable per-game settings captured at creation for stable UI/exports.
- Parallel rollout: v2 behind flags; safe rollback; analytics-tagged adoption.

Architecture Overview

- Next.js App Router + React 18/19; TypeScript; Tailwind v4 or CSS Modules; shadcn/Radix UI primitives.
- Parallel routing: legacy under existing routes; v2 under `/v2/*` with `[data-ui=v2]` root for style isolation.
- State: Keep `lib/state/*` event-sourced store; add selectors for v2 needs; emit `game/created` snapshot event.
- Providers: `EntitiesProvider` (domain adapter), `UiStateProvider` (ephemeral UI), `AnalyticsProvider`.
- Feature directories (summary):
  - `components/app-shell` (Header, NavBar, ModeTabs, SnapshotBanner, RouteGuard, Toasts)
  - `components/play` (PlayTabs; shared GameHeader, PhaseController, BiddingPanel, HandDock, TrickTable, RoundSummary, GameSummary, PauseMenu)
  - `components/play/start-new` (StartNewWizard + steps + WizardSessionContext)
  - `components/play/sp`, `components/play/mp`, `components/play/scorecard`
  - `components/players-rosters`, `components/games`, `components/stats`, `components/settings`, `components/help`, `components/ui`
  - `context/` (EntitiesProvider, UiStateProvider, AnalyticsProvider)
  - `lib/models`, `lib/state`, `lib/api`, `lib/utils`

Technology Choices

- Keep: Next.js App Router, TypeScript, Tailwind v4, shadcn + Radix, existing event-sourced `lib/state`, Cloudflare analytics relay.
- Add/Change:
  - Forms/validation: React Hook Form + Zod, colocated schemas, inferred types.
  - Error monitoring: Sentry (env-gated) with source maps in CI.
  - Telemetry: `reportWebVitals` → analytics worker; tag all events with `ui_version`.
  - Charts (Stats): VisX in v2 (code-split), accessible fallbacks.
  - Animations: Motion One for transitions; dynamic Framer Motion only for complex cases.
  - i18n later: `next-intl` gated; begin with v2-only string extraction post-GA.

Information Architecture (IA v2)

Top-level nav:

1. Landing — Primary CTAs (Start SP, Open Scorecard, Join/Host MP), Continue Last Game, Recents, How to Play.
2. Play — Tabs: Single Player, Multiplayer, Scorecard. Shared recents/resume banner and Start New.
3. Players & Rosters — Unified CRUD and import/export, seat order defaults.
4. Games (History) — Unified archive with filters, details, resume, export/duplicate.
5. Stats — Cross-game aggregates with filters and exports.
6. Settings — App Settings vs Game Defaults.
7. Help & About — Rules, tutorials, changelog, license, contact.

Game Snapshots

- Emit `game/created` first with immutable `GameSnapshot` containing: `id`, `mode`, `startedAt`, `rulesVersion`, `scoring: 'el_dorado'`, `roundsTotal`, roster snapshot, and mode-specific settings (SP seed/bots; Scorecard dealer sequence; MP privacy/limits).
- Store read-only `state.game.settings` for UI; include `summary.settings` in archives. For legacy games without snapshots, infer minimal settings in selectors.

Migration Strategy (Parallel UI)

- Routing split: v2 lives under `/v2/*`; legacy remains unchanged.
- Flags: `NEXT_PUBLIC_UI_V2_ENABLED`; runtime cookie/localStorage `ui:version`, and `?ui=v2` override.
- Adapters: EntitiesProvider and selectors bridge legacy domain to v2 UI.
- Styling isolation: `[data-ui=v2]` root attribute; avoid global overrides.
- Testing: Duplicate E2E for legacy and v2; parity checklists per feature.
- Telemetry: Add `ui_version` to all analytics events; monitor adoption and regressions.

Testing, Linting, and Formatting Gates

- Unit: Vitest + React Testing Library for components and selectors.
- Integration: Wizard flows, SP round lifecycle, Scorecard round entry/finalize, Games resume.
- Visual (optional): Percy/Chromatic for AppShell, PlayTabs, Scorecard Grid.
- CI scripts: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `pnpm check`).
- Commit gate: All four must pass locally and in CI before moving phases.

Command checklist per phase:

```
pnpm format:write
pnpm lint
pnpm typecheck
pnpm test
# or
pnpm check
```

Phased Implementation Plan (Commit-Gated)

M0 — Parallel UI Infrastructure

- Add `/app/v2/layout.tsx` with v2 AppShell, `[data-ui=v2]` root, and providers (EntitiesProvider, UiStateProvider, AnalyticsProvider).
- Add helpers to read/write `ui:version` cookie/localStorage and parse `?ui=v2`.
- Create `/debug/ui` (dev-only) to render legacy and v2 side-by-side by game ID.
- Land `game/created` snapshot event; add read-only `selectors` to expose snapshots; legacy selectors tolerate missing snapshots.
- Docs: Add ADR for snapshots, flags, and routing split.
- Gate: Run format, lint, typecheck, tests; update docs; commit: "M0: v2 infra, flags, snapshots".

M1 — v2 Landing + Navigation

- Implement `/v2` landing with primary CTAs and Recents/Continue using shared selectors.
- Hide v2 links in legacy unless `NEXT_PUBLIC_UI_V2_ENABLED=true`; add settings toggle to opt-in when enabled.
- Docs: Update README and Landing doc with deep links and flags.
- Gate: format/lint/typecheck/tests; commit: "M1: v2 landing + nav".

M2 — Start New (Single Player) Wizard

- Build `components/play/start-new` with steps: Players, Bots, Rules, Deck, Advanced (seed), Confirm; `WizardSessionContext` for ephemeral state.
- Emit `game/created` on confirm; navigate to `/v2/play?tab=single&game=<id>`.
- Reuse: PlayerPicker/RosterPicker from Players & Rosters primitives; forms via RHF + Zod.
- Parity test: Snapshot equality vs legacy SP start for same inputs.
- Gate: format/lint/typecheck/tests; update docs; commit: "M2: SP StartNewWizard".

M3 — Single Player In-Game (Minimum Parity)

- Implement `GameHeader`, `PhaseController` with `BiddingPanel`, `HandDock`, `TrickTable`, `RoundSummary`, `GameSummary`; add `PauseMenu`.
- Wire autosave/resume via existing events; selectors for scores/turn/bids/trick state.
- Accessibility: keyboard focus management in Bidding/Hand/Trick; ARIA roles/labels.
- Gate: format/lint/typecheck/tests; update docs; commit: "M3: SP in-game parity".

M4 — Scorecard (Minimum Parity)

- Implement Start New (players/rounds) and Grid entry; finalize round; Game summary; export/share.
- Reuse: shared PlayerPicker; storage via existing scorecard slice/events.
- Gate: format/lint/typecheck/tests; update docs; commit: "M4: Scorecard parity".

M5 — Players & Rosters

- Implement unified `players-rosters` CRUD, seat ordering, defaults by mode, and import/export with conflict resolution.
- Reuse selectors/entities; add only selectors for roster defaults; no event shape changes.
- Gate: format/lint/typecheck/tests; update docs; commit: "M5: Players & Rosters unified".

M6 — Games (History)

- Implement list with filters and cards; details page with `SettingsSnapshot`, `Timeline`, Resume/Duplicate/Export.
- Reuse domain archive/events; selectors provide `summary.settings` with legacy fallback.
- Gate: format/lint/typecheck/tests; update docs; commit: "M6: Games history".

M7 — Settings & Help

- Implement App Settings (theme, a11y basics) and Game Defaults forms (per mode) read/write same storage as legacy.
- Implement Help & About with anchors; link contextually from v2 surfaces.
- Gate: format/lint/typecheck/tests; update docs; commit: "M7: Settings & Help".

M8 — Accessibility & Performance Polish

- Keyboard coverage, visible focus, ARIA labels, reduced motion; high-contrast/text-size toggles if needed.
- Performance: route-level code-splitting; Motion One helpers; measure web vitals.
- Gate: format/lint/typecheck/tests; update docs; commit: "M8: A11y + perf".

M9 — Beta Rollout

- Default `NEXT_PUBLIC_UI_V2_ENABLED=true` in canary; settings toggle opt-in for beta users.
- Monitor `ui_version` metrics, error rates, and funnel completion; fix parity gaps.
- Gate: format/lint/typecheck/tests; update docs; commit: "M9: Beta rollout".

M10 — GA & Legacy Deprecation Plan

- Flip default to v2 for all; keep legacy accessible via `/legacy/*` or settings link for one or two releases.
- Plan legacy removal; remove links after stability window.
- Gate: format/lint/typecheck/tests; update docs; commit: "M10: GA + deprecation plan".

Per-Feature Migration Template (for PRs)

- Scope: e.g., "V2 Single Player wizard Confirm step".
- Acceptance Criteria:
  - Functional parity with legacy for A, B, C.
  - Identical domain events/selectors for D.
  - No regressions in E2E tests (list tests).
- Flags:
  - Build: `NEXT_PUBLIC_UI_V2_ENABLED`.
  - Runtime: respects query/cookie/localStorage.
- Telemetry:
  - Events tagged with `ui_version`.
- Risks & Mitigations:
  - Known edge cases, fallbacks.
- Rollback:
  - Disable via env or settings toggle; legacy routes remain.

Component Contracts (selected)

- StartNewWizard: `mode`, `defaults`, `onCancel`, `onComplete(snapshot)`; uses `WizardSessionContext`.
- GameHeader: `gameId`, `mode`, `snapshot`, `scores`, `onOpenPause`.
- PhaseController (SP): `gameId` → renders `BiddingPanel` | `HandDock + TrickTable` | `RoundSummary`.
- Scorecard Grid: `rows`, `players`, `onEdit(roundIdx, playerId, { bid, made })`, `onFinalizeRound(roundIdx)`.

Testing Strategy (concrete)

- Units: selectors (snapshot derivation), BiddingPanel logic, RoundSummary math, Scorecard cell editing.
- Integrations: SP StartNewWizard → `game/created` snapshot, SP phase transitions (bid → play → round summary), Scorecard finalize round, Games resume.
- E2E: Legacy vs v2 parity runs in CI matrix.
- Visual: AppShell, PlayTabs, Scorecard grid (optional but recommended pre-GA).

Developer Workflow

1. Implement feature in v2 directory with collocated tests and schemas.
2. Reuse existing selectors/events; only add selectors; avoid changing event shapes pre-GA.
3. Run `pnpm check` (or individual format/lint/typecheck/test commands).
4. Update docs (this file + relevant feature docs under `docs/`).
5. Commit with clear message referencing milestone and scope.
6. Only then start the next phase.

Mapping Old → New (high-level)

- Landing → `/v2` with improved quick actions and recents.
- Single Player → `/v2/play?tab=single` with shared in-game components.
- Multiplayer → `/v2/play?tab=multiplayer` (phased; MVP may reuse Scorecard grid).
- Score Card → `/v2/play?tab=scorecard` dedicated manual scoring.
- Roster Management → `/v2/players-rosters` unified.
- Stats (scattered) → `/v2/stats` centralized.
- Settings (scattered) → `/v2/settings` with App vs Game Defaults.
- Help/About (scattered) → `/v2/help` merged.

Guardrails & Risks

- CSS bleed: enforce `[data-ui=v2]` scoping; avoid editing legacy globals.
- Event drift: selectors-only enhancements until post-GA; contract tests for event shapes.
- Navigation regressions: separate routes; E2E back/forward tests; consistent breadcrumbs.
- Performance: code-split heavy views; measure vitals; memoize heavy selectors.
- i18n churn: stage v2-only strings later; don’t block GA.
- PII in monitoring: scrub Sentry payloads; minimal analytics; honor DNT.

Appendix: Commands and Checks

- Dev: `pnpm dev` → visit `/` (legacy) and `/v2` (new) or add `?ui=v2` to toggle.
- Format: `pnpm format:write`.
- Lint: `pnpm lint`.
- Typecheck: `pnpm typecheck`.
- Test: `pnpm test` or `pnpm coverage`.
- Full check: `pnpm check`.
