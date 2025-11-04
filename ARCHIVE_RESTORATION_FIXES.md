# Archive Restoration Fixes Verification

This document summarizes the fixes implemented to resolve archive restoration problems:

## 1. Player Name Normalization Bug ✅ FIXED

**Problem**: All player names were being set to "You" during restoration.

**Root Cause**: The prioritization logic in `enrichStateWithSummaryRoster` was prioritizing current state over archive data.

**Fix**: Changed prioritization from `state > events > summary > existing` to `summary > events > state > existing` to trust archive data over current state during restoration.

**File**: `lib/state/io.ts:1324-1325`

## 2. Game Mode Detection Logic ✅ FIXED

**Problem**: Games were being incorrectly identified as "scorecard" instead of "single-player".

**Root Cause**: Bundle metadata was being prioritized over event-based detection.

**Fix**: Prioritized event-based detection first and added more single-player event patterns to improve detection accuracy.

**File**: `lib/state/io.ts:1536-1539, 1519-1525`

## 3. Snapshot Storage UUID Mismatch ✅ FIXED

**Problem**: Snapshot index expected one UUID but stored snapshot had different UUID.

**Root Cause**: Height requirement was too restrictive (`> 0`) and corrected snapshots weren't being persisted.

**Fix**: Relaxed height requirement to `>= 0` and added logic to persist corrected snapshots with updated gameId.

**File**: `lib/state/persistence/sp-snapshot.ts:509, 519-531`

## 4. State Hydration Race Condition ✅ FIXED

**Problem**: Restoration completed but UI state hydration lagged behind, causing wrong game state to load.

**Root Cause**: Route resolution logic was not prioritizing expected archive ID during restoration.

**Fix**: Simplified logic to prioritize expected archive ID during restoration to avoid race conditions.

**File**: `app/games/[gameId]/@modal/restore/RestoreGameModalClient.tsx:158-171`

## Expected Browser Console Logs After Fixes

After these fixes, you should see the following improved console logs during archive restoration:

1. **Player Name Assignment**:

   ```
   [restore] assignName {pid: 'player-id', normalizedName: 'Correct Name', ... chosen: 'Correct Name'}
   ```

2. **Game Mode Detection**:

   ```
   🎯 Checking game mode for restoration: {..., isSinglePlayerGame: true, needsUuidPreservation: true}
   ✅ Executing UUID preservation logic for: archive-id (single-player)
   ```

3. **Snapshot Loading**:

   ```
   🔄 Archive restoration: using fallback snapshot with different gameId
   🔄 Updated snapshot persisted with new gameId
   ```

4. **Route Resolution**:
   ```
   ✅ Using archive UUID (priority during restoration): archive-id
   ```

## Testing Instructions

1. Open browser dev tools and go to Console tab
2. Navigate to an archived single-player game
3. Restore the game and observe the console logs
4. Verify that:
   - Player names are correctly preserved from the archive
   - Game is detected as "single-player" not "scorecard"
   - No UUID mismatch warnings appear
   - Navigation goes to the correct restored game URL

All fixes have been implemented and committed to the `001-game-engine` branch.
