# Navigation Context Overview

Phase 1 of the URL views project introduces a lightweight routing contract that decouples the persisted state engine from the currently active URL. The core concepts:

- `deriveRouteContext(pathname)` lives beside `StateProvider` and returns `{ mode, gameId, scorecardId }` so hydration can target the correct snapshot without scattering path parsing logic across components.
- `StateProvider` forwards the derived context to `createInstance` and exposes it via `useAppState().context`, allowing future layouts/pages to respond to navigation changes without re-threading identifiers.
- `createInstance` understands a generalized `RouteHydrationContext`, rehydrates Single Player sessions by `gameId`, and emits structured warnings (`single-player.snapshot.unavailable`) when snapshots are missing or expired. Consumers can surface these warnings to render route-aware empty states.
- Feature-scoped missing entity components (single player game, scorecard, player, roster, archived game) share a common metadata config under `lib/ui/not-found-metadata.ts`, keeping copy and CTA destinations consistent while letting routes compose them locally.
- Navigation helpers (`singlePlayerPath`, `resolveSinglePlayerRoute`, `resolvePlayerRoute`, etc.) centralize URL construction. See `docs/architecture/navigation-helpers.mdx` for usage patterns and Storybook-ready snippets.
- Routed modal focus management is handled by `components/dialogs/RoutedModalFocusManager.tsx`, ensuring keyboard focus and live region announcements work for `/games/[id]/@modal/(restore|delete)` and `/single-player/new` flows.
- Entity-backed routes export explicit metadata via `generateMetadata`, giving shared links stable titles/OG previews that include the active `gameId`, `scorecardId`, or roster/player identifier.
- Archived game operations broadcast through `emitGamesSignal` so list/detail views invalidate caches immediately when records are added or deleted.

Downstream phases can extend the context object (e.g. adding summary sub-view identifiers) without rewriting persistence boundaries. Update this document whenever route context parsing or not-found semantics change.
