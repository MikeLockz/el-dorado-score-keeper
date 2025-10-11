# Single Player Persistence Troubleshooting

This guide summarizes the most common recovery steps when testing or debugging the single player
snapshot pipeline.

## Verifying Snapshot Restore

1. Navigate to `/single-player/{gameId}` in a fresh tab. The app will pause on a loading screen
   until the IndexedDB snapshot (or the localStorage mirror) is applied.
2. If the session restores correctly, the scoreboard, hands, and round metadata should match the
   previous state and interactions should resume immediately.
3. When the loader stays visible for more than a second, check the console for
   `single-player.persist.failed` warnings. The payload includes `code` and `reason` fields pointing
   to the failing adapter (`indexed-db` or `local-storage`).

## Clearing Cached Snapshots

QA frequently needs to simulate “first run” conditions or switch between accounts. Use the helper
below to wipe both IndexedDB and localStorage mirrors without deleting the entire event store:

```ts
import { clearSinglePlayerSnapshotCache } from '@/lib/state/persistence/sp-rehydrate';

await clearSinglePlayerSnapshotCache();
```

- `clearSinglePlayerSnapshotCache()` defaults to the primary app database (`app-db`) and the active
  browser `localStorage`. Pass a different `dbName` or storage instance when testing alternate
  sandboxes.
- After clearing, reload the page; the provider will fall back to the event log and reseed the
  snapshot mirrors on the next state change.

## Warning Indicators

- If snapshot writes keep failing, the UI shows a “Single-player saves are failing” toast. Inspect
  the `single-player.persist.snapshot` metrics for the current failure streak and adapter status.
- Storage quota exhaustion surfaces a “Storage almost full” toast and logs
  `sp.snapshot.persist.quota_exceeded` with `usageBytes`/`quotaBytes`. Free space or clear caches to
  restore persistence before continuing play.
- Fallback restores log `single-player.persist.fallback` (`adapter=local-storage`) so Support can
  confirm when IndexedDB was bypassed during recovery.

## Debug Tips

- Confirm that the `/single-player/{gameId}` URL matches the latest entry in the game index by
  inspecting the `sp/game-index` record inside IndexedDB.
- Use the `state.warning` telemetry stream to observe snapshot rehydrate outcomes. Successful restores
  log `rehydrate.sp_snapshot_applied` messages in development mode.
- When IndexedDB is unavailable (private mode, quota exhaustion), the provider automatically uses the
  `el-dorado:sp:snapshot:v1` localStorage mirror. Clearing cookies or localStorage invalidates this
  fallback, so expect the loader to return until new events arrive.
