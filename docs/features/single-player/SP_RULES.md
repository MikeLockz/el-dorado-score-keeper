SP Rules Entrypoint

- Canonical single-player rules live under `lib/rules/sp`.
- It re-exports the commonly used helpers:
  - `nextToAct`, `isRoundDone`, `canPlayCard` from `lib/state/spRules`
  - `ledSuitOf`, `trickHasTrump` from `lib/single-player/trick`

Consumers should import from `lib/rules/sp` instead of reaching into the underlying modules directly. This avoids logic drift between UI, engine, and selectors, and makes future changes centralized.

Example

```
import { canPlayCard, isRoundDone } from '@/lib/rules/sp';
```
