# Routes & Deep Links

## Overview

This document describes the complete application routing structure and deep link behavior.

## Core Routes

- `/` — Landing page with hero copy, quick links, and mode selectors for Single Player and Score Card
- `/single-player` — Entry point that redirects to the active single-player run or the new-game flow when none exist
- `/scorecard` — Score Card hub that redirects to the latest session or setup
- `/players` — Player management hub with `/players/[playerId]` detail routes and `/players/archived` for restores
- `/rosters` — Roster management hub with `/rosters/[rosterId]` detail views and `/rosters/archived` for archived lineups
- `/games` — Archived games list with `/games/[gameId]` detail pages and intercepted modal routes for restore/delete confirmations
- `/rules` — Quick reference for bidding, scoring, and round flow

## Single Player Routes

### `/single-player/new`

Starts a fresh single-player game; routed modals at:

- `/single-player/new/archive` — Confirm archival of current run
- `/single-player/new/continue` — Confirm resuming the current run

### `/single-player/[gameId]`

Live single-player gameplay experience with tabbed sub-routes:

- `/single-player/[gameId]/scorecard` — Read-only per-round recap for the same run
- `/single-player/[gameId]/summary` — Post-game analytics and achievements

### Single Player Behavior Details

- Root layout resolves the correct destination: active game, archive confirmation, or the new-game flow
- Dynamic layout renders shared tabs that mirror browser history across live, scorecard, and summary views
- Each view rehydrates the selected `gameId` via the app state provider so deep links load without first visiting the landing page
- Routed modals handle "archive & start new" and "continue current game" confirmations with analytics hooks

## Score Card Routes

### `/scorecard/[scorecardId]`

Active Score Card entry view with optional `/summary` export route.

### Score Card Behavior Details

- Round grid spans 10 rounds (tricks 10 → 1) with initials in the header and dense keyboard shortcuts
- Action tiles cycle through bidding → complete → scored states; locked rounds prevent accidental edits
- Bidding controls clamp between 0 and the available tricks for the round
- Finalizing a round applies ±(5 + bid) and advances the next locked round to bidding
- `/summary` renders an export-friendly recap suitable for printing or sharing

## Player Management Routes

### `/players/[playerId]`

Detail routes that deep-link into inline editors for direct share links.

### `/players/archived`

Archived players surface with one-click restore actions.

### Player Management Behavior Details

- Score Card and Single Player rosters live side-by-side with separate add/rename/reorder flows
- Persistence uses IndexedDB and mirrors updates across tabs
- Devtools (development only) expose event height, preview state, and recent warnings

## Roster Management Routes

### `/rosters/[rosterId]`

Detail routes that open the roster inline for editing or loading into a session.

### `/rosters/archived`

Archived rosters are available directly without toggling in-page filters.

### Roster Management Behavior Details

- Manage saved lineups with ordering, cloning, and archive/restore flows

## Games Routes

### `/games/[gameId]`

Detail pages for analytics and history with intercepted modal routes for restore/delete confirmations with focus management.

### Games Behavior Details

- Table lists archived games with title, completion time, player count, and winner summary
- "New Game" launches the shared confirmation flow to archive and start fresh
- List rows link to `/games/[gameId]` for analytics and history

## Rules Route

### `/rules`

Quick reference for bidding, scoring, and round flow.

### Rules Details

- Overview: 10 rounds; tricks decrease 10 → 1; bid, mark made/missed, then finalize to apply points
- Round flow: Bidding → Complete → Finalize; next locked round auto-unlocks to bidding
- Scoring: Made = + (5 + bid); Missed = − (5 + bid)
- Notes: Round states cycle locked → bidding → complete → scored; locked rounds can't advance; data persists locally and syncs across tabs

## Missing Entity Surfaces

### `/single-player/[gameId]`

Renders **SinglePlayerGameMissing** when the requested run is unavailable, linking to `/single-player/new` and `/games`.

### `/scorecard/[scorecardId]`

Renders **ScorecardMissing** with CTAs to open the scorecard hub or browse archived games.

### `/players/[playerId]` and `/rosters/[rosterId]`

Render detail-specific missing cards that link back to active and archived lists.

### `/games/[gameId]`

Falls back to **ArchivedGameMissing**, offering a path back to `/games` or straight into `/single-player/new` for a fresh run.
