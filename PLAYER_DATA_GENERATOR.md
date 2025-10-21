# Player Data Generator Plan

## 1. Context & Purpose

- Provide a shared utility for DevTools, QA scripts, and test harnesses to fabricate realistic player and roster data for single-player simulations.
- Ensure generated player entities match the production schema (`players`, `rosters`) so downstream reducers and persistence flows work without special handling.
- Support deterministic generation so teams can reproduce exact rosters when seeding tests or demos.

## 2. Goals & Non-Goals

- **Goals**
  - Emit roster entries compatible with single-player mode: ordered seats, `isBot`/`isCurrentUser` flags, style metadata for AI behavior.
  - Maintain a curated registry of synthetic player identities (ids, names, avatar seeds) sampled without collisions.
  - Accept an explicit current-user profile and guarantee inclusion at seat `0`.
  - Expose a deterministic RNG interface (`seed` or `rng`) for repeatable outputs.
- **Non-Goals**
  - Do not generate gameplay events, scores, or persistence side-effects (handled by game generator and save helpers).
  - Do not introduce UI controls; consumption remains programmatic.
  - Do not manage multi-roster/tournament scenarios in this iteration.

## 3. Integration Points

- **Game Data Generator**: Imports roster helpers instead of duplicating name registries when constructing synthetic archives.
- **DevTools Buttons / QA Scripts**: Use the generator to seed IndexedDB-friendly rosters with one call.
- **Unit & Contract Tests**: Leverage seeded generation to create stable fixtures without brittle manual mocks.

## 4. Data Generation Requirements

### 4.1 Player Registry

- Maintain a list of 10 deterministic templates (`id`, `displayName`, `avatarSeed`) aligned with existing single-player expectations.
- Allow future expansion without breaking current consumers by centralizing registry export.

### 4.2 Current User Handling

- Require `{ id, displayName, avatarSeed? }`; sanitize strings and fallback to sensible defaults when missing.
- Always reserve seat `0` for the current user, marked `isBot: false`, `isCurrentUser: true`.
- Auto-derive an avatar seed when the profile omits one (e.g., slugify the display name).

### 4.3 Synthetic Player Sampling

- Accept optional `playerCount`; default to 4, clamp between 2 and registry length.
- Sample remaining seats without replacement from the registry, excluding the current-user id.
- Assign seats sequentially (`1..n`) reflecting table order expected by round/bid logic.
- Mark sampled players as `isBot: true`.

### 4.4 Style Metadata

- Attach a `style` field (`cautious`, `balanced`, `aggressive`) per roster entry to influence bidding heuristics.
- Use deterministic RNG thresholds (~⅓ distribution) for style assignment; consider overrides in future extensions.

## 5. API Shape

- `GeneratedPlayerProfile`: normalized identity object (`id`, `displayName`, `avatarSeed`).
- `GeneratedRosterEntry`: extends profile with `seat`, `isBot`, `isCurrentUser`, `style`.
- `CurrentUserProfile`: input contract for the caller.
- `generateRoster(options: { currentUser; playerCount?; seed? | rng? })`: primary factory returning ordered roster array.
- `getRng(seed?: string)`: helper exposing seeded PRNG compatible with other generators.
- Optionally export `NAME_REGISTRY` for tests needing direct template access.

## 6. Determinism & Variability

- Provide reproducible output when the same seed and current user are supplied.
- Default to high-quality randomness when no seed is given to keep repeated generations feeling organic.
- Document how callers can pass a prebuilt `rng` instance to coordinate randomness across multiple generators.

## 7. Validation Approach

- Unit tests covering:
  - Inclusion and normalization of the current user at seat `0`.
  - Unique ids across roster entries with no registry collisions.
  - Deterministic ordering/styles when seeded.
  - Style helper returning only allowed values.
- Optional snapshot fixture for a default 4-player roster with a fixed seed to spot regressions in template data.

## 8. Implementation Steps

1. Create `lib/devtools/generator/playerDataGenerator.ts` exporting registry, RNG helpers, type definitions, and `generateRoster`.
2. Move roster-specific types/logic out of `gameDataGenerator.ts`, re-export where necessary to avoid breaking imports.
3. Update the game data generator (and any DevTools entry point) to source roster data from the new module.
4. Adjust existing unit tests to target the new module; keep end-to-end game generator tests focused on event and summary assembly.
5. Document usage within DevTools readme or related guides for future contributors.
