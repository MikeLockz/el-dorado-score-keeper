package entities

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// GameSession represents an individual game instance with current state, players, turn information, and host controls
type GameSession struct {
	ID           UUID    `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	RoomID       string  `json:"roomId" db:"room_id" gorm:"uniqueIndex;not null;size:64"`
	Name         string  `json:"name" db:"name" gorm:"not null;size:255"`
	HostID       UUID    `json:"hostId" db:"host_id" gorm:"not null;index;type:uuid"`
	Seed         string  `json:"seed" db:"seed" gorm:"not null;size:255"`
	CurrentRound int     `json:"currentRound" db:"current_round" gorm:"default:1"`
	Phase        GamePhase `json:"phase" db:"phase" gorm:"not null;default:'setup'"`

	// Game state and configuration
	PlayerOrder   []UUID    `json:"playerOrder" db:"-" gorm:"-"` // Stored as JSONB
	PlayerOrderDB JSONB     `json:"-" db:"player_order" gorm:"type:jsonb"`
	GameState     JSONB     `json:"gameState" db:"game_state" gorm:"type:jsonb"`
	Config        JSONB     `json:"config" db:"config" gorm:"type:jsonb"`

	// Session management
	MaxPlayers         int              `json:"maxPlayers" db:"max_players" gorm:"default:10"`
	IsPublic           bool             `json:"isPublic" db:"is_public" gorm:"default:true"`
	ModerationType     ModerationType   `json:"moderationType" db:"moderation_type" gorm:"default:'majority_vote'"`
	IsStarted          bool             `json:"isStarted" db:"is_started" gorm:"default:false"`
	IsFinished         bool             `json:"isFinished" db:"is_finished" gorm:"default:false"`
	WinnerID           NullUUID         `json:"winnerId" db:"winner_id" gorm:"type:uuid"`
	CurrentTurnPlayerID NullUUID        `json:"currentTurnPlayerId" db:"current_turn_player_id" gorm:"type:uuid"`
	TurnTimeoutSeconds int              `json:"turnTimeoutSeconds" db:"turn_timeout_seconds" gorm:"default:60"`
	LastActivityAt     time.Time        `json:"lastActivityAt" db:"last_activity_at" gorm:"autoUpdateTime"`
	CreatedAt          time.Time        `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt          time.Time        `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	FinishedAt         *time.Time       `json:"finishedAt" db:"finished_at" gorm:"index"`

	// Associations
	Players          []PlayerProfile       `json:"players,omitempty" gorm:"many2many:game_session_players;"`
	Actions          []PlayerAction        `json:"actions,omitempty" gorm:"foreignKey:GameSessionID"`
	SessionStates    []SessionState        `json:"sessionStates,omitempty" gorm:"foreignKey:GameSessionID"`
	Connections      []RealTimeConnection  `json:"connections,omitempty" gorm:"foreignKey:GameSessionID"`
}

// TableName returns the table name for GameSession
func (GameSession) TableName() string {
	return "game_sessions"
}

// BeforeSave handles the JSON serialization of array fields
func (gs *GameSession) BeforeSave() error {
	if len(gs.PlayerOrder) > 0 {
		data, err := json.Marshal(gs.PlayerOrder)
		if err != nil {
			return fmt.Errorf("failed to marshal player order: %w", err)
		}
		gs.PlayerOrderDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (gs *GameSession) AfterFind() error {
	if len(gs.PlayerOrderDB) > 0 {
		err := json.Unmarshal(gs.PlayerOrderDB, &gs.PlayerOrder)
		if err != nil {
			return fmt.Errorf("failed to unmarshal player order: %w", err)
		}
	}
	return nil
}

// Validate validates the game session
func (gs *GameSession) Validate() error {
	if gs.RoomID == "" {
		return fmt.Errorf("room ID is required")
	}
	if gs.Name == "" {
		return fmt.Errorf("name is required")
	}
	if gs.MaxPlayers < 2 || gs.MaxPlayers > 10 {
		return fmt.Errorf("max players must be between 2 and 10")
	}
	if gs.TurnTimeoutSeconds < 10 || gs.TurnTimeoutSeconds > 300 {
		return fmt.Errorf("turn timeout must be between 10 and 300 seconds")
	}
	return nil
}

// IsActive returns whether the game session is currently active
func (gs *GameSession) IsActive() bool {
	return gs.IsStarted && !gs.IsFinished
}

// CanJoin returns whether a player can join the game session
func (gs *GameSession) CanJoin() bool {
	return !gs.IsStarted && len(gs.Players) < gs.MaxPlayers
}

// GetNextPlayer returns the next player in the turn order
func (gs *GameSession) GetNextPlayer(currentPlayerID UUID) (UUID, error) {
	for i, playerID := range gs.PlayerOrder {
		if playerID == currentPlayerID {
			if i+1 < len(gs.PlayerOrder) {
				return gs.PlayerOrder[i+1], nil
			}
			return gs.PlayerOrder[0], nil // Wrap around to first player
		}
	}
	return UUID(""), fmt.Errorf("current player not found in turn order")
}

// PlayerProfile represents server-side multiplayer identity with cryptographic key pair and statistics
type PlayerProfile struct {
	ID                   UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	DisplayName          string    `json:"displayName" db:"display_name" gorm:"not null;size:255;uniqueIndex"`
	PublicKey            string    `json:"publicKey" db:"public_key" gorm:"not null;type:text"` // PEM format
	AvatarURL            *string   `json:"avatarUrl" db:"avatar_url" gorm:"size:500"`
	IsOnline             bool      `json:"isOnline" db:"is_online" gorm:"default:false"`
	LastSeenAt           time.Time `json:"lastSeenAt" db:"last_seen_at" gorm:"autoUpdateTime"`
	IsActivePlayer       bool      `json:"isActivePlayer" db:"is_active_player" gorm:"default:true"`
	PlayerType           PlayerType `json:"playerType" db:"player_type" gorm:"not null;default:'human'"`

	// Statistics
	GamesPlayed          int       `json:"gamesPlayed" db:"games_played" gorm:"default:0"`
	GamesWon             int       `json:"gamesWon" db:"games_won" gorm:"default:0"`
	TotalPlaytimeSeconds int       `json:"totalPlaytimeSeconds" db:"total_playtime_seconds" gorm:"default:0"`
	CurrentRating        float64   `json:"currentRating" db:"current_rating" gorm:"default:1000.0"`
	PeakRating           float64   `json:"peakRating" db:"peak_rating" gorm:"default:1000.0"`
	WinRate              float64   `json:"winRate" db:"win_rate" gorm:"default:0.0"`

	// Preferences
	PreferredLanguage    string    `json:"preferredLanguage" db:"preferred_language" gorm:"size:10;default:'en'"`
	NotificationsEnabled bool      `json:"notificationsEnabled" db:"notifications_enabled" gorm:"default:true"`
	PrivacyLevel         string    `json:"privacyLevel" db:"privacy_level" gorm:"size:20;default:'public'"`

	// Timestamps
	CreatedAt            time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt            time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	ArchivedAt           *time.Time `json:"archivedAt" db:"archived_at" gorm:"index"`

	// Associations
	GameSessions         []GameSession `json:"gameSessions,omitempty" gorm:"many2many:game_session_players;"`
	Statistics           PlayerStatistics `json:"statistics,omitempty" gorm:"foreignKey:PlayerID"`
	KeyBackup            *KeyBackup    `json:"keyBackup,omitempty" gorm:"foreignKey:PlayerID"`
	AuthTokens           []AuthenticationToken `json:"authTokens,omitempty" gorm:"foreignKey:PlayerID"`
	Actions              []PlayerAction `json:"actions,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for PlayerProfile
func (PlayerProfile) TableName() string {
	return "player_profiles"
}

// Validate validates the player profile
func (pp *PlayerProfile) Validate() error {
	if pp.DisplayName == "" {
		return fmt.Errorf("display name is required")
	}
	if len(pp.DisplayName) < 2 || len(pp.DisplayName) > 255 {
		return fmt.Errorf("display name must be between 2 and 255 characters")
	}
	if pp.PublicKey == "" {
		return fmt.Errorf("public key is required")
	}
	if pp.CurrentRating < 0 || pp.CurrentRating > 3000 {
		return fmt.Errorf("rating must be between 0 and 3000")
	}
	return nil
}

// UpdateWinRate updates the player's win rate based on games played and won
func (pp *PlayerProfile) UpdateWinRate() {
	if pp.GamesPlayed > 0 {
		pp.WinRate = float64(pp.GamesWon) / float64(pp.GamesPlayed) * 100.0
	}
}

// UpdatePeakRating updates the peak rating if current rating is higher
func (pp *PlayerProfile) UpdatePeakRating() {
	if pp.CurrentRating > pp.PeakRating {
		pp.PeakRating = pp.CurrentRating
	}
}

// PlayerAction represents individual moves or decisions made by players that modify game state
type PlayerAction struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID     UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	TurnID       string    `json:"turnId" db:"turn_id" gorm:"not null;size:255;index"`
	ActionType   string    `json:"actionType" db:"action_type" gorm:"not null;size:100"`
	ActionData   JSONB     `json:"actionData" db:"action_data" gorm:"type:jsonb"`

	// Cryptographic verification
	Signature    string    `json:"signature" db:"signature" gorm:"not null;size:1024"` // Base64 encoded signature
	Sequence     int64     `json:"sequence" db:"sequence" gorm:"not null;index"` // Monotonically increasing sequence per session

	// Timing and status
	IsVerified   bool      `json:"isVerified" db:"is_verified" gorm:"default:false"`
	IsProcessed  bool      `json:"isProcessed" db:"is_processed" gorm:"default:false"`
	ProcessedAt  *time.Time `json:"processedAt" db:"processed_at" gorm:"index"`
	TurnTimeoutAt *time.Time `json:"turnTimeoutAt" db:"turn_timeout_at" gorm:"index"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`

	// Associations
	GameSession  GameSession   `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player       PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for PlayerAction
func (PlayerAction) TableName() string {
	return "player_actions"
}

// Validate validates the player action
func (pa *PlayerAction) Validate() error {
	if pa.TurnID == "" {
		return fmt.Errorf("turn ID is required")
	}
	if pa.ActionType == "" {
		return fmt.Errorf("action type is required")
	}
	if pa.Signature == "" {
		return fmt.Errorf("signature is required")
	}
	if pa.Sequence < 0 {
		return fmt.Errorf("sequence must be non-negative")
	}
	return nil
}

// IsExpired returns whether the action has expired based on turn timeout
func (pa *PlayerAction) IsExpired() bool {
	if pa.TurnTimeoutAt == nil {
		return false
	}
	return time.Now().After(*pa.TurnTimeoutAt)
}

// GameState represents a complete snapshot of all game data
type GameState struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	Sequence     int64     `json:"sequence" db:"sequence" gorm:"not null;index"`
	StateData    JSONB     `json:"stateData" db:"state_data" gorm:"type:jsonb;not null"`
	StateHash    string    `json:"stateHash" db:"state_hash" gorm:"not null;size:64;index"` // SHA-256 hash

	// Metadata
	RoundNumber  int       `json:"roundNumber" db:"round_number" gorm:"default:1"`
	Phase        GamePhase `json:"phase" db:"phase" gorm:"not null;default:'setup'"`
	IsComplete   bool      `json:"isComplete" db:"is_complete" gorm:"default:false"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`

	// Associations
	GameSession  GameSession `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
}

// TableName returns the table name for GameState
func (GameState) TableName() string {
	return "game_states"
}

// Validate validates the game state
func (gs *GameState) Validate() error {
	if len(gs.StateData) == 0 {
		return fmt.Errorf("state data is required")
	}
	if gs.Sequence < 0 {
		return fmt.Errorf("sequence must be non-negative")
	}
	if gs.StateHash == "" {
		return fmt.Errorf("state hash is required")
	}
	return nil
}

// CalculateHash calculates the SHA-256 hash of the state data
func (gs *GameState) CalculateHash() (string, error) {
	hash := sha256.Sum256(gs.StateData)
	return hex.EncodeToString(hash[:]), nil
}

// VerifyHash verifies that the stored hash matches the calculated hash
func (gs *GameState) VerifyHash() (bool, error) {
	expectedHash, err := gs.CalculateHash()
	if err != nil {
		return false, err
	}
	return gs.StateHash == expectedHash, nil
}

// MultiplayerRoster represents team composition created specifically for multiplayer games
type MultiplayerRoster struct {
	ID            UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;uniqueIndex;type:uuid"`
	Name          string    `json:"name" db:"name" gorm:"not null;size:255"`
	RosterType    string    `json:"rosterType" db:"roster_type" gorm:"not null;default:'multiplayer';size:50"`

	// Player composition
	PlayerOrder   []UUID    `json:"playerOrder" db:"-" gorm:"-"` // Stored as JSONB
	PlayerOrderDB JSONB     `json:"-" db:"player_order" gorm:"type:jsonb"`
	PlayerNames   map[string]string `json:"playerNames" db:"-" gorm:"-"` // Stored as JSONB
	PlayerNamesDB JSONB     `json:"-" db:"player_names" gorm:"type:jsonb"`
	PlayerTypes   map[string]PlayerType `json:"playerTypes" db:"-" gorm:"-"` // Stored as JSONB
	PlayerTypesDB JSONB     `json:"-" db:"player_types" gorm:"type:jsonb"`

	// Game-specific configuration
	IsConfigured  bool      `json:"isConfigured" db:"is_configured" gorm:"default:false"`
	Config        JSONB     `json:"config" db:"config" gorm:"type:jsonb"`

	// Timestamps
	CreatedAt     time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt     time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	ArchivedAt    *time.Time `json:"archivedAt" db:"archived_at" gorm:"index"`

	// Associations
	GameSession   GameSession    `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
}

// TableName returns the table name for MultiplayerRoster
func (MultiplayerRoster) TableName() string {
	return "multiplayer_rosters"
}

// BeforeSave handles the JSON serialization of map fields
func (mr *MultiplayerRoster) BeforeSave() error {
	// Serialize player order
	if len(mr.PlayerOrder) > 0 {
		data, err := json.Marshal(mr.PlayerOrder)
		if err != nil {
			return fmt.Errorf("failed to marshal player order: %w", err)
		}
		mr.PlayerOrderDB = JSONB(data)
	}

	// Serialize player names
	if len(mr.PlayerNames) > 0 {
		data, err := json.Marshal(mr.PlayerNames)
		if err != nil {
			return fmt.Errorf("failed to marshal player names: %w", err)
		}
		mr.PlayerNamesDB = JSONB(data)
	}

	// Serialize player types
	if len(mr.PlayerTypes) > 0 {
		data, err := json.Marshal(mr.PlayerTypes)
		if err != nil {
			return fmt.Errorf("failed to marshal player types: %w", err)
		}
		mr.PlayerTypesDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of map fields
func (mr *MultiplayerRoster) AfterFind() error {
	// Deserialize player order
	if len(mr.PlayerOrderDB) > 0 {
		err := json.Unmarshal(mr.PlayerOrderDB, &mr.PlayerOrder)
		if err != nil {
			return fmt.Errorf("failed to unmarshal player order: %w", err)
		}
	}

	// Deserialize player names
	if len(mr.PlayerNamesDB) > 0 {
		err := json.Unmarshal(mr.PlayerNamesDB, &mr.PlayerNames)
		if err != nil {
			return fmt.Errorf("failed to unmarshal player names: %w", err)
		}
	}

	// Deserialize player types
	if len(mr.PlayerTypesDB) > 0 {
		err := json.Unmarshal(mr.PlayerTypesDB, &mr.PlayerTypes)
		if err != nil {
			return fmt.Errorf("failed to unmarshal player types: %w", err)
		}
	}

	return nil
}

// Validate validates the multiplayer roster
func (mr *MultiplayerRoster) Validate() error {
	if mr.Name == "" {
		return fmt.Errorf("name is required")
	}
	if len(mr.PlayerOrder) < 2 {
		return fmt.Errorf("roster must have at least 2 players")
	}
	if len(mr.PlayerOrder) > 10 {
		return fmt.Errorf("roster cannot have more than 10 players")
	}
	return nil
}

// AddPlayer adds a player to the roster
func (mr *MultiplayerRoster) AddPlayer(playerID UUID, name string, playerType PlayerType) {
	if mr.PlayerNames == nil {
		mr.PlayerNames = make(map[string]string)
	}
	if mr.PlayerTypes == nil {
		mr.PlayerTypes = make(map[string]PlayerType)
	}

	mr.PlayerOrder = append(mr.PlayerOrder, playerID)
	mr.PlayerNames[string(playerID)] = name
	mr.PlayerTypes[string(playerID)] = playerType
}

// RemovePlayer removes a player from the roster
func (mr *MultiplayerRoster) RemovePlayer(playerID UUID) bool {
	for i, pID := range mr.PlayerOrder {
		if pID == playerID {
			mr.PlayerOrder = append(mr.PlayerOrder[:i], mr.PlayerOrder[i+1:]...)
			delete(mr.PlayerNames, string(playerID))
			delete(mr.PlayerTypes, string(playerID))
			return true
		}
	}
	return false
}

// PlayerStatistics represents core gameplay metrics for player performance tracking
type PlayerStatistics struct {
	ID                   UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	PlayerID             UUID      `json:"playerId" db:"player_id" gorm:"not null;uniqueIndex;type:uuid"`

	// Core gameplay metrics
	GamesPlayed          int       `json:"gamesPlayed" db:"games_played" gorm:"default:0"`
	GamesWon             int       `json:"gamesWon" db:"games_won" gorm:"default:0"`
	GamesFinished        int       `json:"gamesFinished" db:"games_finished" gorm:"default:0"`
	TotalPlaytimeSeconds int       `json:"totalPlaytimeSeconds" db:"total_playtime_seconds" gorm:"default:0"`
	AverageGameMinutes   float64   `json:"averageGameMinutes" db:"average_game_minutes" gorm:"default:0.0"`

	// Performance metrics
	WinRate              float64   `json:"winRate" db:"win_rate" gorm:"default:0.0"`
	FinishRate           float64   `json:"finishRate" db:"finish_rate" gorm:"default:0.0"` // Games finished / games started

	// Rating and skill
	CurrentRating        float64   `json:"currentRating" db:"current_rating" gorm:"default:1000.0"`
	PeakRating           float64   `json:"peakRating" db:"peak_rating" gorm:"default:1000.0"`
	RatingChange         float64   `json:"ratingChange" db:"rating_change" gorm:"default:0.0"`

	// Game-specific statistics
	TotalRoundsPlayed    int       `json:"totalRoundsPlayed" db:"total_rounds_played" gorm:"default:0"`
	TotalTricksWon       int       `json:"totalTricksWon" db:"total_tricks_won" gorm:"default:0"`
	TotalBidsMade        int       `json:"totalBidsMade" db:"total_bids_made" gorm:"default:0"`
	BidAccuracy          float64   `json:"bidAccuracy" db:"bid_accuracy" gorm:"default:0.0"` // Bids made / bids attempted

	// Social metrics
	PlayersMet           int       `json:"playersMet" db:"players_met" gorm:"default:0"`
	FrequentPlayers      []UUID    `json:"frequentPlayers" db:"-" gorm:"-"` // Stored as JSONB
	FrequentPlayersDB    JSONB     `json:"-" db:"frequent_players" gorm:"type:jsonb"`

	// Achievement data
	Achievements         []string  `json:"achievements" db:"-" gorm:"-"` // Stored as JSONB
	AchievementsDB       JSONB     `json:"-" db:"achievements" gorm:"type:jsonb"`
	LatestAchievement    *string   `json:"latestAchievement" db:"latest_achievement" gorm:"size:255"`
	AchievementPoints    int       `json:"achievementPoints" db:"achievement_points" gorm:"default:0"`

	// Timestamps
	CreatedAt            time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt            time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastPlayedAt         *time.Time `json:"lastPlayedAt" db:"last_played_at" gorm:"index"`

	// Associations
	Player               PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for PlayerStatistics
func (PlayerStatistics) TableName() string {
	return "player_statistics"
}

// BeforeSave handles the JSON serialization of array fields
func (ps *PlayerStatistics) BeforeSave() error {
	if len(ps.FrequentPlayers) > 0 {
		data, err := json.Marshal(ps.FrequentPlayers)
		if err != nil {
			return fmt.Errorf("failed to marshal frequent players: %w", err)
		}
		ps.FrequentPlayersDB = JSONB(data)
	}

	if len(ps.Achievements) > 0 {
		data, err := json.Marshal(ps.Achievements)
		if err != nil {
			return fmt.Errorf("failed to marshal achievements: %w", err)
		}
		ps.AchievementsDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (ps *PlayerStatistics) AfterFind() error {
	if len(ps.FrequentPlayersDB) > 0 {
		err := json.Unmarshal(ps.FrequentPlayersDB, &ps.FrequentPlayers)
		if err != nil {
			return fmt.Errorf("failed to unmarshal frequent players: %w", err)
		}
	}

	if len(ps.AchievementsDB) > 0 {
		err := json.Unmarshal(ps.AchievementsDB, &ps.Achievements)
		if err != nil {
			return fmt.Errorf("failed to unmarshal achievements: %w", err)
		}
	}

	return nil
}

// Validate validates the player statistics
func (ps *PlayerStatistics) Validate() error {
	if ps.CurrentRating < 0 || ps.CurrentRating > 3000 {
		return fmt.Errorf("rating must be between 0 and 3000")
	}
	if ps.WinRate < 0 || ps.WinRate > 100 {
		return fmt.Errorf("win rate must be between 0 and 100")
	}
	if ps.FinishRate < 0 || ps.FinishRate > 100 {
		return fmt.Errorf("finish rate must be between 0 and 100")
	}
	return nil
}

// CalculateDerivedMetrics updates calculated metrics based on raw data
func (ps *PlayerStatistics) CalculateDerivedMetrics() {
	// Calculate win rate
	if ps.GamesPlayed > 0 {
		ps.WinRate = float64(ps.GamesWon) / float64(ps.GamesPlayed) * 100.0
	}

	// Calculate finish rate
	if ps.GamesPlayed > 0 {
		ps.FinishRate = float64(ps.GamesFinished) / float64(ps.GamesPlayed) * 100.0
	}

	// Calculate average game time
	if ps.GamesFinished > 0 {
		ps.AverageGameMinutes = float64(ps.TotalPlaytimeSeconds) / float64(ps.GamesFinished) / 60.0
	}

	// Update peak rating
	if ps.CurrentRating > ps.PeakRating {
		ps.PeakRating = ps.CurrentRating
	}
}

// AddAchievement adds an achievement to the player's list
func (ps *PlayerStatistics) AddAchievement(achievement string) {
	if ps.Achievements == nil {
		ps.Achievements = make([]string, 0)
	}

	// Check if achievement already exists
	for _, existing := range ps.Achievements {
		if existing == achievement {
			return
		}
	}

	ps.Achievements = append(ps.Achievements, achievement)
	ps.LatestAchievement = &achievement
	ps.AchievementPoints += 10 // Base achievement points
}

// HasAchievement checks if the player has a specific achievement
func (ps *PlayerStatistics) HasAchievement(achievement string) bool {
	for _, existing := range ps.Achievements {
		if existing == achievement {
			return true
		}
	}
	return false
}