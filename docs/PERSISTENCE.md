# Single Player Persistence

## Overview

This document describes the persistence layer for single player games, including IndexedDB storage, localStorage mirroring, and cross-tab synchronization.

## Storage Architecture

### Primary Storage: IndexedDB
- Main persistence layer using the `sp/snapshot` store
- Provides ACID compliance and large storage capacity
- Asynchronous operations for non-blocking UI

### Fallback Storage: localStorage
- Mirror of critical data for fast rehydration
- Used when IndexedDB is unavailable or during recovery
- Synchronous access for immediate loading

## Snapshot Strategy

### Triggers
Every reducer-visible change writes a single-player snapshot to storage:
- Game state updates
- Player actions
- Round completions
- Score changes

### Storage Keys
- **IndexedDB**: `STATE['sp/snapshot']`
- **localStorage**: `el-dorado:sp:snapshot:v1`
- **Deep link index**: `sp/game-index` (trimmed map for navigation)

## Data Flow

### Write Operation
1. Reducer processes action
2. State change detected
3. Snapshot created and written to IndexedDB
4. Mirror written to localStorage
5. Cross-tab synchronization triggered
6. Metrics emitted for performance tracking

### Read Operation
1. Application loads
2. Attempt to read from IndexedDB
3. Fallback to localStorage if IndexedDB fails
4. Rehydrate application state
5. Update deep link index

## Cross-Tab Synchronization

### Storage Events
- IndexedDB changes are mirrored across browser tabs
- localStorage events trigger rehydration in other tabs
- Real-time synchronization of game state

### Conflict Resolution
- Last-write-wins strategy for concurrent updates
- Timestamp-based conflict detection
- Automatic state reconciliation

## Performance Metrics

### Snapshot Metrics
- `single-player.persist.snapshot` events include:
  - Write duration
  - Failure streak count
  - Adapter status (IndexedDB vs localStorage)
  - Data size metrics

### Fallback Metrics
- `single-player.persist.fallback` events when:
  - localStorage mirror rehydrates a session
  - IndexedDB write fails and falls back
  - Recovery operations occur

## Error Handling

### Quota Exceeded
When browser storage quota is exhausted:
1. Capture `sp.snapshot.persist.quota_exceeded` metric
2. Display in-app warning toast to user
3. Continue retrying writes in background
4. Resume normal operation when space becomes available

### Corrupted Data
1. Detect invalid or corrupted snapshots
2. Clear corrupted data
3. Rehydrate from last known good state
4. Log error for debugging

## Recovery Mechanisms

### Automatic Recovery
- Continuous retry of failed writes
- Progressive fallback strategy
- Data integrity validation

### Manual Recovery
- Clear local storage option in settings
- Reinitialize from server (if applicable)
- Reset to default state

## Optimization Techniques

### Debounced Writes
- Batch multiple rapid changes into single write
- Reduce storage I/O for better performance
- Maintain write order integrity

### Compression
- Compress large snapshots before storage
- Reduce storage footprint
- Faster transfer across tabs

## Deep Link Support

### Game Index
- Maintains mapping of `gameId` to latest snapshot
- Enables direct navigation to specific games
- Updates automatically on state changes

### URL State Synchronization
- Game state reflected in URL parameters
- Shareable deep links to specific game states
- Bookmark support for game progress

## Development Tools

### Persistence Debugging
- DevTools panel shows storage status
- Real-time view of write operations
- Performance metrics and failure tracking

### Storage Inspector
- Browse IndexedDB contents
- View localStorage mirror
- Export/import game states for testing