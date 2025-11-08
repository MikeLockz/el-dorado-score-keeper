# Data Model - Standalone Game Engine Service

**Date**: 2025-11-02
**Based on**: Feature specification and research findings

## Core Entities

### Game Session

Represents an individual multiplayer game instance with current state, players, and host controls.

**Fields**:

```go
type GameSession struct {
    ID              string    `json:"id" db:"id"`
    Name            string    `json:"name" db:"name"`
    GameCode        string    `json:"game_code" db:"game_code"`
    Status          string    `json:"status" db:"status"` // waiting, active, completed, abandoned
    MaxPlayers      int       `json:"max_players" db:"max_players"`
    CurrentPlayers  int       `json:"current_players" db:"current_players"`
    HostPlayerID    string    `json:"host_player_id" db:"host_player_id"`
    GameConfig      GameConfig `json:"game_config" db:"game_config"`
    CreatedAt       time.Time `json:"created_at" db:"created_at"`
    StartedAt       *time.Time `json:"started_at,omitempty" db:"started_at"`
    CompletedAt     *time.Time `json:"completed_at,omitempty" db:"completed_at"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}
```

**Validation Rules**:

- `max_players`: Must be between 2-10 (FR-008)
- `status`: Must be one of: waiting, active, completed, abandoned
- `game_code`: Must be unique, 6-character alphanumeric

### Player Profile

Server-side multiplayer identity with cryptographic key pair and statistics.

**Fields**:

```go
type PlayerProfile struct {
    ID              string          `json:"id" db:"id"`
    PublicKey       string          `json:"public_key" db:"public_key"`
    PlayerName      string          `json:"player_name" db:"player_name"`
    TotalGames      int             `json:"total_games" db:"total_games"`
    Wins            int             `json:"wins" db:"wins"`
    Losses          int             `json:"losses" db:"losses"`
    TotalPlaytime   int64           `json:"total_playtime_seconds" db:"total_playtime_seconds"`
    Rating          float64         `json:"rating" db:"rating"`
    CreatedAt       time.Time       `json:"created_at" db:"created_at"`
    LastActiveAt    time.Time       `json:"last_active_at" db:"last_active_at"`
}
```

**Validation Rules**:

- `public_key`: Valid cryptographic public key format
- `player_name`: 3-20 characters, alphanumeric and spaces
- `rating`: 1000-3000 range with 1500 default

### Player Action

Individual moves or decisions made by players, cryptographically signed and permanently stored.

**Fields**:

```go
type PlayerAction struct {
    ID          string      `json:"id" db:"id"`
    GameID      string      `json:"game_id" db:"game_id"`
    PlayerID    string      `json:"player_id" db:"player_id"`
    ActionID    string      `json:"action_id" db:"action_id"` // Event ID
    ActionType  string      `json:"action_type" db:"action_type"`
    ActionData  interface{} `json:"action_data" db:"action_data"` // JSONB
    Signature   string      `json:"signature" db:"signature"`
    Timestamp   int64       `json:"timestamp" db:"timestamp"`
    Version     int         `json:"version" db:"version"`
    CreatedAt   time.Time   `json:"created_at" db:"created_at"`
}
```

**Validation Rules**:

- `signature`: Valid cryptographic signature using player's private key
- `action_type`: Must be valid game action (play_card, pass, bid, etc.)
- `version`: Sequential, validated against game state version

### Game State

Complete snapshot of all game data with cryptographic verification.

**Fields**:

```go
type GameState struct {
    GameID        string                 `json:"game_id"`
    Version       int                    `json:"version"`
    Players       map[string]*Player     `json:"players"`
    CurrentRound  int                    `json:"current_round"`
    Scores        map[string]int         `json:"scores"`
    Status        string                 `json:"status"`
    TurnOrder     []string              `json:"turn_order"`
    CurrentTurn   string                 `json:"current_turn"`
    GameData      map[string]interface{} `json:"game_data"` // Game-specific data
    StateHash     string                 `json:"state_hash"`
    CreatedAt     int64                  `json:"created_at"`
    UpdatedAt     int64                  `json:"updated_at"`
}
```

**Validation Rules**:

- `state_hash`: SHA-256 hash of complete state for integrity verification
- `version`: Must be sequential and match event count
- `current_turn`: Must be in turn_order list and valid player

### Multiplayer Roster

Team composition created specifically for multiplayer games.

**Fields**:

```go
type MultiplayerRoster struct {
    ID          string    `json:"id" db:"id"`
    GameID      string    `json:"game_id" db:"game_id"`
    PlayerID    string    `json:"player_id" db:"player_id"`
    RosterData  string    `json:"roster_data" db:"roster_data"` // JSON blob
    CreatedAt   time.Time `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}
```

### Player Statistics

Core gameplay metrics and achievement data.

**Fields**:

```go
type PlayerStatistics struct {
    ID                string    `json:"id" db:"id"`
    PlayerID          string    `json:"player_id" db:"player_id"`
    GamesPlayed       int       `json:"games_played" db:"games_played"`
    TotalPlaytime     int64     `json:"total_playtime" db:"total_playtime"`
    HighestRating      float64   `json:"highest_rating" db:"highest_rating"`
    CurrentRating      float64   `json:"current_rating" db:"current_rating"`
    Achievements       string    `json:"achievements" db:"achievements"` // JSON array
    LastCalculatedAt   time.Time `json:"last_calculated_at" db:"last_calculated_at"`
}
```

## Relationships

### Entity Relationships

```
GameSession (1) -----> (N) PlayerAction
GameSession (1) -----> (N) MultiplayerRoster
GameSession (1) -----> (1) GameState (snapshots)
PlayerProfile (1) -----> (N) PlayerAction
PlayerProfile (1) -----> (N) PlayerStatistics
PlayerProfile (1) -----> (N) MultiplayerRoster
```

### Foreign Keys

- `PlayerAction.game_id` → `GameSession.id`
- `PlayerAction.player_id` → `PlayerProfile.id`
- `MultiplayerRoster.game_id` → `GameSession.id`
- `MultiplayerRoster.player_id` → `PlayerProfile.id`
- `PlayerStatistics.player_id` → `PlayerProfile.id`

## State Transitions

### Game Session States

```
waiting → active → completed
    ↓
abandoned
```

**Transition Rules**:

- `waiting → active`: Host starts game with minimum players
- `active → completed`: Game reaches completion conditions
- `waiting → abandoned`: Game creation cancelled by host
- `active → abandoned`: Game disrupted and cannot continue

### Player Action Processing

```
Received → Validate Signature → Apply Event → Broadcast Update → Persist
```

**Processing Rules**:

- Cryptographic signature validation (FR-043)
- Turn-based order enforcement (FR-010, FR-025)
- Action type validation
- Game rule application
- Real-time broadcasting to all players

## Data Flow Patterns

### Event Sourcing Flow

```
Player Action → Validate → Store Event → Update State → Broadcast → Cache
```

### Reconnection Flow

```
Client Reconnect → State Hash Check → Event Reconciliation → State Sync → Resume
```

### Game Creation Flow

```
Host Creates Game → Generate Game Code → Initialize State → Wait for Players → Start
```

## Database Schema

### Primary Tables

#### games

```sql
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    game_code VARCHAR(6) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'waiting',
    max_players INTEGER NOT NULL DEFAULT 4,
    current_players INTEGER NOT NULL DEFAULT 0,
    host_player_id UUID NOT NULL,
    game_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### player_profiles

```sql
CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_key TEXT NOT NULL UNIQUE,
    player_name VARCHAR(100) NOT NULL,
    total_games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_playtime_seconds BIGINT NOT NULL DEFAULT 0,
    rating DECIMAL(10,2) NOT NULL DEFAULT 1500.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### player_actions

```sql
CREATE TABLE player_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    action_id UUID NOT NULL NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_data JSONB NOT NULL DEFAULT '{}',
    signature TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, action_id),
    INDEX idx_player_actions_game_version (game_id, version),
    INDEX idx_player_actions_player (player_id),
    INDEX idx_player_actions_timestamp (timestamp)
);
```

### Supporting Tables

#### multiplayer_rosters

```sql
CREATE TABLE multiplayer_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    roster_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, player_id)
);
```

#### player_statistics

```sql
CREATE TABLE player_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    total_playtime BIGINT NOT NULL DEFAULT 0,
    highest_rating DECIMAL(10,2) NOT NULL DEFAULT 1500.00,
    current_rating DECIMAL(10,2) NOT NULL DEFAULT 1500.00,
    achievements JSONB NOT NULL DEFAULT '[]',
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id)
);
```

#### game_snapshots

```sql
CREATE TABLE game_snapshots (
    game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    state_data JSONB NOT NULL,
    state_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, version)
);
```

## Indexes and Performance

### Critical Indexes

- `player_actions(game_id, version)`: Event retrieval for reconstruction
- `player_actions(player_id)`: Player action history
- `games(status, created_at)`: Game discovery and listing
- `player_profiles(last_active_at)`: Active player queries
- `player_statistics(current_rating)`: Leaderboard queries

### Performance Considerations

- Event table partitioning by created_at for large datasets
- JSONB indexes for game_config and action_data queries
- Connection pooling for PostgreSQL
- In-memory caching for active game states

## Data Integrity Constraints

### Business Rules

1. **Player Uniqueness**: One player profile per public key
2. **Game Code Uniqueness**: No duplicate game codes
3. **Action Sequence**: Version numbers must be sequential
4. **Turn Enforcement**: Actions must follow turn order
5. **Signature Validity**: All actions must have valid signatures

### Triggers and Constraints

```sql
-- Ensure max_players constraint
ALTER TABLE games ADD CONSTRAINT check_max_players
CHECK (max_players BETWEEN 2 AND 10);

-- Ensure current_players never exceeds max_players
ALTER TABLE games ADD CONSTRAINT check_current_players
CHECK (current_players <= max_players);

-- Update game statistics trigger
CREATE OR REPLACE FUNCTION update_game_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE player_profiles
        SET total_games = total_games + 1,
            last_active_at = NOW()
        WHERE id = NEW.player_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE player_profiles
        SET last_active_at = NOW()
        WHERE id = NEW.player_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_game_stats_trigger
    AFTER INSERT OR UPDATE ON player_actions
    FOR EACH ROW EXECUTE FUNCTION update_game_stats();
```

This data model provides the foundation for the multiplayer game engine with comprehensive support for player identity, game state management, action tracking, and performance optimization.
