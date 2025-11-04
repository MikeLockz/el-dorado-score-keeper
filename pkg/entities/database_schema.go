package entities

import (
	"fmt"
	"strings"
)

// DatabaseSchema defines the complete database schema for the multiplayer game engine
type DatabaseSchema struct {
	Tables    []TableDefinition    `json:"tables"`
	Indexes   []IndexDefinition    `json:"indexes"`
	Constraints []ConstraintDefinition `json:"constraints"`
	Triggers  []TriggerDefinition  `json:"triggers"`
	Functions []FunctionDefinition `json:"functions"`
}

// TableDefinition represents a database table definition
type TableDefinition struct {
	Name        string         `json:"name"`
	Columns     []ColumnDefinition `json:"columns"`
	PrimaryKey  []string       `json:"primaryKey"`
	ForeignKeys []ForeignKeyDefinition `json:"foreignKeys"`
	Checks      []CheckDefinition `json:"checks"`
	Options     TableOptions    `json:"options"`
}

// ColumnDefinition represents a database column definition
type ColumnDefinition struct {
	Name         string      `json:"name"`
	Type         string      `json:"type"`
	Nullable     bool        `json:"nullable"`
	Default      interface{} `json:"default"`
	Check        string      `json:"check"`
	Comments     string      `json:"comments"`
}

// ForeignKeyDefinition represents a foreign key constraint
type ForeignKeyDefinition struct {
	Column          string `json:"column"`
	ReferencedTable string `json:"referencedTable"`
	ReferencedColumn string `json:"referencedColumn"`
	OnDelete        string `json:"onDelete"`
	OnUpdate        string `json:"onUpdate"`
}

// CheckDefinition represents a check constraint
type CheckDefinition struct {
	Name    string `json:"name"`
	Expression string `json:"expression"`
}

// TableOptions represents table-level options
type TableOptions struct {
	StorageEngine string `json:"storageEngine"`
	Charset       string `json:"charset"`
	Collation     string `json:"collation"`
	RowFormat     string `json:"rowFormat"`
	Comment       string `json:"comment"`
}

// IndexDefinition represents a database index definition
type IndexDefinition struct {
	Name       string   `json:"name"`
	Table      string   `json:"table"`
	Columns    []string `json:"columns"`
	Type       string   `json:"type"` // BTREE, HASH, GIN, GiST
	Unique     bool     `json:"unique"`
	Partial    string   `json:"partial"` // WHERE clause for partial index
	Options    IndexOptions `json:"options"`
}

// IndexOptions represents index-specific options
type IndexOptions struct {
	FillFactor    int    `json:"fillFactor"`    // For BTREE indexes
	Concurrently  bool   `json:"concurrently"` // Create index without locking
	StorageParams map[string]interface{} `json:"storageParams"`
}

// ConstraintDefinition represents a database constraint
type ConstraintDefinition struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // UNIQUE, CHECK, EXCLUDE
	Table       string `json:"table"`
	Definition  string `json:"definition"`
}

// TriggerDefinition represents a database trigger
type TriggerDefinition struct {
	Name       string `json:"name"`
	Table      string `json:"table"`
	Events     []string `json:"events"` // INSERT, UPDATE, DELETE
	When       string `json:"when"`    // BEFORE, AFTER, INSTEAD OF
	Condition  string `json:"condition"` // WHEN clause
	Function   string `json:"function"`
	Enabled    bool   `json:"enabled"`
}

// FunctionDefinition represents a database function
type FunctionDefinition struct {
	Name       string      `json:"name"`
	Parameters []ParameterDefinition `json:"parameters"`
	Returns    string      `json:"returns"`
	Language   string      `json:"language"`
	Body       string      `json:"body"`
	Security   string      `json:"security"` // SECURITY DEFINER, SECURITY INVOKER
}

// ParameterDefinition represents a function parameter
type ParameterDefinition struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Mode string `json:"mode"` // IN, OUT, INOUT
}

// GetDatabaseSchema returns the complete database schema definition
func GetDatabaseSchema() DatabaseSchema {
	schema := DatabaseSchema{
		Tables:     make([]TableDefinition, 0),
		Indexes:    make([]IndexDefinition, 0),
		Constraints: make([]ConstraintDefinition, 0),
		Triggers:   make([]TriggerDefinition, 0),
		Functions:  make([]FunctionDefinition, 0),
	}

	// Add all table definitions
	schema.Tables = append(schema.Tables,
		getGameSessionTable(),
		getPlayerProfileTable(),
		getPlayerActionTable(),
		getGameStateTable(),
		getMultiplayerRosterTable(),
		getPlayerStatisticsTable(),
		getCryptographicKeyPairTable(),
		getAuthenticationTokenTable(),
		getKeyBackupTable(),
		getRecoveryPhraseTable(),
		getRealTimeConnectionTable(),
		getEventStreamTable(),
		getStateHashTable(),
		getSessionStateTable(),
		getEventReceiptTrackingTable(),
		getReconnectionSessionTable(),
		getErrorHandlerTable(),
		getGracefulDegradationTable(),
		getErrorRecoveryTable(),
		getRecoveryAttemptTable(),
	)

	// Add all index definitions
	schema.Indexes = append(schema.Indexes,
		getGameSessionIndexes(),
		getPlayerProfileIndexes(),
		getPlayerActionIndexes(),
		getGameStateIndexes(),
		getMultiplayerRosterIndexes(),
		getPlayerStatisticsIndexes(),
		getCryptographicKeyPairIndexes(),
		getAuthenticationTokenIndexes(),
		getKeyBackupIndexes(),
		getRealTimeConnectionIndexes(),
		getEventStreamIndexes(),
		getStateHashIndexes(),
		getSessionStateIndexes(),
		getEventReceiptTrackingIndexes(),
		getReconnectionSessionIndexes(),
		getErrorHandlerIndexes(),
		getGracefulDegradationIndexes(),
		getErrorRecoveryIndexes(),
		getRecoveryAttemptIndexes(),
	...)

	// Add custom functions
	schema.Functions = append(schema.Functions,
		getGameStateHashFunction(),
		getPlayerRatingFunction(),
		getCleanupExpiredSessionsFunction(),
		getPlayerStatisticsUpdateFunction(),
	)

	return schema
}

// getGameSessionTable returns the game sessions table definition
func getGameSessionTable() TableDefinition {
	return TableDefinition{
		Name: "game_sessions",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "room_id", Type: "VARCHAR(64)", Nullable: false, Comments: "Unique room identifier for lobby"},
			{Name: "name", Type: "VARCHAR(255)", Nullable: false, Comments: "Game session display name"},
			{Name: "host_id", Type: "UUID", Nullable: false, Comments: "Reference to host player profile"},
			{Name: "seed", Type: "VARCHAR(255)", Nullable: false, Comments: "Random seed for deterministic gameplay"},
			{Name: "current_round", Type: "INTEGER", Nullable: false, Default: 1, Comments: "Current round number"},
			{Name: "phase", Type: "VARCHAR(20)", Nullable: false, Default: "setup", Comments: "Current game phase"},
			{Name: "player_order", Type: "JSONB", Nullable: true, Comments: "Ordered list of player UUIDs"},
			{Name: "game_state", Type: "JSONB", Nullable: true, Comments: "Complete game state snapshot"},
			{Name: "config", Type: "JSONB", Nullable: true, Comments: "Game configuration options"},
			{Name: "max_players", Type: "INTEGER", Nullable: false, Default: 10, Comments: "Maximum players allowed"},
			{Name: "is_public", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Whether game is publicly discoverable"},
			{Name: "moderation_type", Type: "VARCHAR(50)", Nullable: false, Default: "majority_vote", Comments: "Timeout handling approach"},
			{Name: "is_started", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Whether game has started"},
			{Name: "is_finished", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Whether game has finished"},
			{Name: "winner_id", Type: "UUID", Nullable: true, Comments: "Reference to winning player profile"},
			{Name: "current_turn_player_id", Type: "UUID", Nullable: true, Comments: "Player whose turn it is"},
			{Name: "turn_timeout_seconds", Type: "INTEGER", Nullable: false, Default: 60, Comments: "Turn timeout in seconds"},
			{Name: "last_activity_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last activity timestamp"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "finished_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Game completion timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "host_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "RESTRICT", OnUpdate: "CASCADE"},
			{Column: "winner_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "SET NULL", OnUpdate: "CASCADE"},
			{Column: "current_turn_player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "SET NULL", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_session_player_count", Expression: "max_players >= 2 AND max_players <= 10"},
			{Name: "chk_session_turn_timeout", Expression: "turn_timeout_seconds >= 10 AND turn_timeout_seconds <= 300"},
			{Name: "chk_session_round", Expression: "current_round >= 1"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Game sessions for multiplayer matches",
		},
	}
}

// getPlayerProfileTable returns the player profiles table definition
func getPlayerProfileTable() TableDefinition {
	return TableDefinition{
		Name: "player_profiles",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "display_name", Type: "VARCHAR(255)", Nullable: false, Comments: "Player display name"},
			{Name: "public_key", Type: "TEXT", Nullable: false, Comments: "Cryptographic public key (PEM format)"},
			{Name: "avatar_url", Type: "VARCHAR(500)", Nullable: true, Comments: "Optional avatar image URL"},
			{Name: "is_online", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Online status"},
			{Name: "last_seen_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last online timestamp"},
			{Name: "is_active_player", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Whether player can participate in games"},
			{Name: "player_type", Type: "VARCHAR(10)", Nullable: false, Default: "human", Comments: "Player type (human/bot)"},
			{Name: "games_played", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total games played"},
			{Name: "games_won", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total games won"},
			{Name: "total_playtime_seconds", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total playtime in seconds"},
			{Name: "current_rating", Type: "DOUBLE PRECISION", Nullable: false, Default: 1000.0, Comments: "Current skill rating"},
			{Name: "peak_rating", Type: "DOUBLE PRECISION", Nullable: false, Default: 1000.0, Comments: "Highest rating achieved"},
			{Name: "win_rate", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Win rate percentage"},
			{Name: "preferred_language", Type: "VARCHAR(10)", Nullable: false, Default: "en", Comments: "Preferred language code"},
			{Name: "notifications_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Notification preferences"},
			{Name: "privacy_level", Type: "VARCHAR(20)", Nullable: false, Default: "public", Comments: "Privacy settings"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Account creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "archived_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Account archival timestamp"},
		},
		PrimaryKey: []string{"id"},
		Checks: []CheckDefinition{
			{Name: "chk_profile_display_name_length", Expression: "LENGTH(display_name) >= 2"},
			{Name: "chk_profile_rating_range", Expression: "current_rating >= 0 AND current_rating <= 3000"},
			{Name: "chk_profile_peak_rating_range", Expression: "peak_rating >= 0 AND peak_rating <= 3000"},
			{Name: "chk_profile_win_rate_range", Expression: "win_rate >= 0 AND win_rate <= 100"},
			{Name: "chk_profile_games_non_negative", Expression: "games_played >= 0 AND games_won >= 0"},
			{Name: "chk_profile_games_consistency", Expression: "games_won <= games_played"},
			{Name: "chk_profile_playtime_non_negative", Expression: "total_playtime_seconds >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Player profiles and identity management",
		},
	}
}

// getPlayerActionTable returns the player actions table definition
func getPlayerActionTable() TableDefinition {
	return TableDefinition{
		Name: "player_actions",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "turn_id", Type: "VARCHAR(255)", Nullable: false, Comments: "Turn identifier"},
			{Name: "action_type", Type: "VARCHAR(100)", Nullable: false, Comments: "Type of action (bid, play, pass, etc.)"},
			{Name: "action_data", Type: "JSONB", Nullable: true, Comments: "Action-specific data"},
			{Name: "signature", Type: "VARCHAR(1024)", Nullable: false, Comments: "Cryptographic signature"},
			{Name: "sequence", Type: "BIGINT", Nullable: false, Comments: "Sequence number within game session"},
			{Name: "is_verified", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Signature verification status"},
			{Name: "is_processed", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Processing status"},
			{Name: "processed_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Processing timestamp"},
			{Name: "turn_timeout_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Turn timeout timestamp"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "RESTRICT", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_action_sequence_non_negative", Expression: "sequence >= 0"},
			{Name: "chk_action_signature_length", Expression: "LENGTH(signature) > 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Player actions in multiplayer games",
		},
	}
}

// getGameStateTable returns the game states table definition
func getGameStateTable() TableDefinition {
	return TableDefinition{
		Name: "game_states",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "sequence", Type: "BIGINT", Nullable: false, Comments: "State sequence number"},
			{Name: "state_data", Type: "JSONB", Nullable: false, Comments: "Complete game state data"},
			{Name: "state_hash", Type: "VARCHAR(64)", Nullable: false, Comments: "SHA-256 hash of state data"},
			{Name: "round_number", Type: "INTEGER", Nullable: false, Default: 1, Comments: "Current round number"},
			{Name: "phase", Type: "VARCHAR(20)", Nullable: false, Comments: "Current game phase"},
			{Name: "is_complete", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Whether state represents complete game"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_state_sequence_non_negative", Expression: "sequence >= 0"},
			{Name: "chk_state_hash_length", Expression: "LENGTH(state_hash) = 64"},
			{Name: "chk_state_round_positive", Expression: "round_number >= 1"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Game state snapshots for synchronization and recovery",
		},
	}
}

// getMultiplayerRosterTable returns the multiplayer rosters table definition
func getMultiplayerRosterTable() TableDefinition {
	return TableDefinition{
		Name: "multiplayer_rosters",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "name", Type: "VARCHAR(255)", Nullable: false, Comments: "Roster display name"},
			{Name: "roster_type", Type: "VARCHAR(50)", Nullable: false, Default: "multiplayer", Comments: "Type of roster"},
			{Name: "player_order", Type: "JSONB", Nullable: true, Comments: "Ordered player UUIDs"},
			{Name: "player_names", Type: "JSONB", Nullable: true, Comments: "Player name mappings"},
			{Name: "player_types", Type: "JSONB", Nullable: true, Comments: "Player type mappings"},
			{Name: "is_configured", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Configuration status"},
			{Name: "config", Type: "JSONB", Nullable: true, Comments: "Roster configuration"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "archived_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Archival timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Multiplayer game rosters and team composition",
		},
	}
}

// getPlayerStatisticsTable returns the player statistics table definition
func getPlayerStatisticsTable() TableDefinition {
	return TableDefinition{
		Name: "player_statistics",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "games_played", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total games played"},
			{Name: "games_won", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total games won"},
			{Name: "games_finished", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total games finished"},
			{Name: "total_playtime_seconds", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total playtime in seconds"},
			{Name: "average_game_minutes", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Average game duration in minutes"},
			{Name: "win_rate", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Win rate percentage"},
			{Name: "finish_rate", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Game completion rate"},
			{Name: "current_rating", Type: "DOUBLE PRECISION", Nullable: false, Default: 1000.0, Comments: "Current skill rating"},
			{Name: "peak_rating", Type: "DOUBLE PRECISION", Nullable: false, Default: 1000.0, Comments: "Highest rating achieved"},
			{Name: "rating_change", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Recent rating change"},
			{Name: "total_rounds_played", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total rounds played"},
			{Name: "total_tricks_won", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total tricks won"},
			{Name: "total_bids_made", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total bids made"},
			{Name: "bid_accuracy", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Bid accuracy percentage"},
			{Name: "players_met", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Unique players played with"},
			{Name: "frequent_players", Type: "JSONB", Nullable: true, Comments: "Frequent opponent list"},
			{Name: "achievements", Type: "JSONB", Nullable: true, Comments: "Player achievements"},
			{Name: "latest_achievement", Type: "VARCHAR(255)", Nullable: true, Comments: "Most recent achievement"},
			{Name: "achievement_points", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Total achievement points"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_played_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last game played timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_stats_games_non_negative", Expression: "games_played >= 0 AND games_won >= 0 AND games_finished >= 0"},
			{Name: "chk_stats_consistency", Expression: "games_won <= games_played AND games_finished <= games_played"},
			{Name: "chk_stats_playtime_non_negative", Expression: "total_playtime_seconds >= 0"},
			{Name: "chk_stats_rounds_non_negative", Expression: "total_rounds_played >= 0 AND total_tricks_won >= 0 AND total_bids_made >= 0"},
			{Name: "chk_stats_percentage_ranges", Expression: "win_rate >= 0 AND win_rate <= 100 AND finish_rate >= 0 AND finish_rate <= 100 AND bid_accuracy >= 0 AND bid_accuracy <= 100"},
			{Name: "chk_stats_rating_ranges", Expression: "current_rating >= 0 AND current_rating <= 3000 AND peak_rating >= 0 AND peak_rating <= 3000"},
			{Name: "chk_stats_achievement_points", Expression: "achievement_points >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Player performance statistics and achievements",
		},
	}
}

// getCryptographicKeyPairTable returns the cryptographic key pairs table definition
func getCryptographicKeyPairTable() TableDefinition {
	return TableDefinition{
		Name: "cryptographic_key_pairs",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "key_type", Type: "VARCHAR(50)", Nullable: false, Default: "RSA", Comments: "Key algorithm type"},
			{Name: "key_size", Type: "INTEGER", Nullable: false, Default: 2048, Comments: "Key size in bits"},
			{Name: "public_key", Type: "TEXT", Nullable: false, Comments: "Public key (PEM format)"},
			{Name: "private_key", Type: "TEXT", Nullable: false, Comments: "Encrypted private key (PEM format)"},
			{Name: "key_algorithm", Type: "VARCHAR(100)", Nullable: false, Default: "RSA-OAEP-SHA256", Comments: "Key algorithm specification"},
			{Name: "key_version", Type: "INTEGER", Nullable: false, Default: 1, Comments: "Key version number"},
			{Name: "is_active", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Key activation status"},
			{Name: "is_revoked", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Key revocation status"},
			{Name: "expires_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Key expiration timestamp"},
			{Name: "revoked_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Key revocation timestamp"},
			{Name: "revoked_reason", Type: "VARCHAR(255)", Nullable: true, Comments: "Reason for revocation"},
			{Name: "last_used_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last usage timestamp"},
			{Name: "usage_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Usage counter"},
			{Name: "max_usage_count", Type: "BIGINT", Nullable: true, Comments: "Maximum usage limit"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_key_size_minimum", Expression: "key_size >= 2048"},
			{Name: "chk_key_version_positive", Expression: "key_version >= 1"},
			{Name: "chk_key_usage_non_negative", Expression: "usage_count >= 0"},
			{Name: "chk_key_max_usage_positive", Expression: "max_usage_count IS NULL OR max_usage_count >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Cryptographic key pairs for player identity and signing",
		},
	}
}

// getAuthenticationTokenTable returns the authentication tokens table definition
func getAuthenticationTokenTable() TableDefinition {
	return TableDefinition{
		Name: "authentication_tokens",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "token_hash", Type: "VARCHAR(128)", Nullable: false, Comments: "SHA-256 hash of token"},
			{Name: "token_type", Type: "VARCHAR(50)", Nullable: false, Comments: "Token type (access, refresh, session)"},
			{Name: "claims", Type: "JSONB", Nullable: true, Comments: "Token claims data"},
			{Name: "is_revoked", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Revocation status"},
			{Name: "revoked_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Revocation timestamp"},
			{Name: "revoked_reason", Type: "VARCHAR(255)", Nullable: true, Comments: "Reason for revocation"},
			{Name: "expires_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Token expiration timestamp"},
			{Name: "last_used_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last usage timestamp"},
			{Name: "usage_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Usage counter"},
			{Name: "device_id", Type: "VARCHAR(255)", Nullable: true, Comments: "Device identifier"},
			{Name: "user_agent", Type: "VARCHAR(500)", Nullable: true, Comments: "Client user agent string"},
			{Name: "ip_address", Type: "VARCHAR(45)", Nullable: true, Comments: "Client IP address (IPv6 compatible)"},
			{Name: "session_id", Type: "VARCHAR(255)", Nullable: true, Comments: "Session identifier"},
			{Name: "requires_mfa", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "MFA requirement flag"},
			{Name: "mfa_verified", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "MFA verification status"},
			{Name: "max_usage_count", Type: "BIGINT", Nullable: true, Comments: "Maximum usage limit"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_token_hash_length", Expression: "LENGTH(token_hash) = 64"},
			{Name: "chk_token_usage_non_negative", Expression: "usage_count >= 0"},
			{Name: "chk_token_max_usage_positive", Expression: "max_usage_count IS NULL OR max_usage_count >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Authentication tokens for player sessions",
		},
	}
}

// getKeyBackupTable returns the key backups table definition
func getKeyBackupTable() TableDefinition {
	return TableDefinition{
		Name: "key_backups",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "key_pair_id", Type: "UUID", Nullable: false, Comments: "Reference to key pair"},
			{Name: "backup_type", Type: "VARCHAR(50)", Nullable: false, Comments: "Backup type (encrypted, recovery_phrase, qr_code)"},
			{Name: "backup_data", Type: "TEXT", Nullable: false, Comments: "Encrypted backup data"},
			{Name: "encryption_method", Type: "VARCHAR(100)", Nullable: false, Comments: "Encryption algorithm"},
			{Name: "encryption_key_id", Type: "VARCHAR(255)", Nullable: true, Comments: "KMS key identifier"},
			{Name: "verification_hash", Type: "VARCHAR(128)", Nullable: false, Comments: "Backup verification hash"},
			{Name: "checksum", Type: "VARCHAR(128)", Nullable: false, Comments: "Integrity checksum"},
			{Name: "is_active", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Backup activation status"},
			{Name: "is_used", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Usage status"},
			{Name: "used_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Usage timestamp"},
			{Name: "expires_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Backup expiration timestamp"},
			{Name: "last_verified_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last verification timestamp"},
			{Name: "requires_password", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Password requirement flag"},
			{Name: "password_hint", Type: "VARCHAR(255)", Nullable: true, Comments: "Password recovery hint"},
			{Name: "max_restore_attempts", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Maximum restore attempts"},
			{Name: "restore_attempts", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Current restore attempts"},
			{Name: "device_id", Type: "VARCHAR(255)", Nullable: true, Comments: "Device identifier"},
			{Name: "device_name", Type: "VARCHAR(255)", Nullable: true, Comments: "Device name"},
			{Name: "location_hint", Type: "VARCHAR(500)", Nullable: true, Comments: "Location hint for recovery"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "archived_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Archival timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "key_pair_id", ReferencedTable: "cryptographic_key_pairs", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_backup_hash_lengths", Expression: "LENGTH(verification_hash) = 64 AND LENGTH(checksum) = 64"},
			{Name: "chk_backup_restore_attempts", Expression: "restore_attempts >= 0 AND restore_attempts <= max_restore_attempts"},
			{Name: "chk_backup_max_attempts_positive", Expression: "max_restore_attempts >= 1"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Cryptographic key backups for recovery",
		},
	}
}

// getRecoveryPhraseTable returns the recovery phrases table definition
func getRecoveryPhraseTable() TableDefinition {
	return TableDefinition{
		Name: "recovery_phrases",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "phrase_hash", Type: "VARCHAR(128)", Nullable: false, Comments: "SHA-256 hash of recovery phrase"},
			{Name: "word_count", Type: "INTEGER", Nullable: false, Default: 12, Comments: "Number of words in phrase"},
			{Name: "version", Type: "VARCHAR(20)", Nullable: false, Default: "1.0", Comments: "Phrase format version"},
			{Name: "salt", Type: "VARCHAR(64)", Nullable: false, Comments: "PBKDF2 salt"},
			{Name: "iteration_count", Type: "INTEGER", Nullable: false, Default: 100000, Comments: "PBKDF2 iteration count"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "last_used_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last usage timestamp"},
			{Name: "usage_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Usage counter"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_phrase_hash_length", Expression: "LENGTH(phrase_hash) = 64"},
			{Name: "chk_phrase_word_count", Expression: "word_count IN (12, 18, 24)"},
			{Name: "chk_phrase_salt_length", Expression: "LENGTH(salt) >= 32"},
			{Name: "chk_phrase_iterations", Expression: "iteration_count >= 10000"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Mnemonic recovery phrases for key restoration",
		},
	}
}

// getRealTimeConnectionTable returns the real-time connections table definition
func getRealTimeConnectionTable() TableDefinition {
	return TableDefinition{
		Name: "real_time_connections",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "connection_id", Type: "VARCHAR(255)", Nullable: false, Comments: "Unique connection identifier"},
			{Name: "communication_method", Type: "VARCHAR(50)", Nullable: false, Default: "websocket", Comments: "Communication method"},
			{Name: "endpoint", Type: "VARCHAR(500)", Nullable: false, Comments: "Connection endpoint URL"},
			{Name: "protocol", Type: "VARCHAR(50)", Nullable: true, Comments: "Protocol (ws, wss, sse, http)"},
			{Name: "status", Type: "VARCHAR(20)", Nullable: false, Default: "disconnected", Comments: "Connection status"},
			{Name: "is_healthy", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Connection health status"},
			{Name: "latency_ms", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Latency in milliseconds"},
			{Name: "last_ping_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last ping timestamp"},
			{Name: "last_pong_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last pong timestamp"},
			{Name: "next_ping_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Next ping schedule"},
			{Name: "messages_sent", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Messages sent count"},
			{Name: "messages_received", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Messages received count"},
			{Name: "bytes_transmitted", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Bytes transmitted"},
			{Name: "bytes_received", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Bytes received"},
			{Name: "connection_drops", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Connection drop count"},
			{Name: "reconnect_attempts", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Reconnection attempts"},
			{Name: "quality_score", Type: "DOUBLE PRECISION", Nullable: false, Default: 1.0, Comments: "Connection quality score"},
			{Name: "priority", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Connection priority"},
			{Name: "current_method_index", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Current fallback method index"},
			{Name: "available_methods", Type: "JSONB", Nullable: true, Comments: "Available fallback methods"},
			{Name: "auto_fallback_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Auto fallback enabled"},
			{Name: "user_agent", Type: "VARCHAR(500)", Nullable: false, Comments: "Client user agent"},
			{Name: "ip_address", Type: "VARCHAR(45)", Nullable: true, Comments: "Client IP address"},
			{Name: "device_type", Type: "VARCHAR(50)", Nullable: true, Comments: "Device type"},
			{Name: "platform", Type: "VARCHAR(100)", Nullable: true, Comments: "Client platform"},
			{Name: "established_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Connection establishment timestamp"},
			{Name: "last_activity_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last activity timestamp"},
			{Name: "disconnected_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Disconnection timestamp"},
			{Name: "timeout_duration", Type: "INTEGER", Nullable: false, Default: 30, Comments: "Timeout in seconds"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_connection_quality_range", Expression: "quality_score >= 0.0 AND quality_score <= 1.0"},
			{Name: "chk_connection_latency_non_negative", Expression: "latency_ms >= 0"},
			{Name: "chk_connection_timeout_range", Expression: "timeout_duration >= 5 AND timeout_duration <= 300"},
			{Name: "chk_connection_counters_non_negative", Expression: "messages_sent >= 0 AND messages_received >= 0 AND connection_drops >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Real-time connection management",
		},
	}
}

// getEventStreamTable returns the event streams table definition
func getEventStreamTable() TableDefinition {
	return TableDefinition{
		Name: "event_streams",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "connection_id", Type: "UUID", Nullable: false, Comments: "Reference to connection"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "stream_type", Type: "VARCHAR(50)", Nullable: false, Comments: "Stream type (game, chat, system, presence)"},
			{Name: "stream_name", Type: "VARCHAR(255)", Nullable: false, Comments: "Stream display name"},
			{Name: "is_active", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Stream activation status"},
			{Name: "is_buffered", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Buffering enabled"},
			{Name: "buffer_size", Type: "INTEGER", Nullable: false, Default: 1000, Comments: "Maximum buffer size"},
			{Name: "compression_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Compression enabled"},
			{Name: "last_sequence", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Last sequence number"},
			{Name: "events_sent", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Events sent count"},
			{Name: "events_dropped", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Events dropped count"},
			{Name: "last_event_sent_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last event sent timestamp"},
			{Name: "event_types", Type: "JSONB", Nullable: true, Comments: "Event type filters"},
			{Name: "player_filter", Type: "JSONB", Nullable: true, Comments: "Player filters"},
			{Name: "since_sequence", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Start from sequence"},
			{Name: "throughput_events_per_second", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Events per second throughput"},
			{Name: "throughput_bytes_per_second", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Bytes per second throughput"},
			{Name: "average_event_size", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Average event size"},
			{Name: "priority", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Stream priority"},
			{Name: "max_latency_ms", Type: "INTEGER", Nullable: false, Default: 1000, Comments: "Maximum acceptable latency"},
			{Name: "retry_attempts", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Retry attempts"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_activity_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last activity timestamp"},
			{Name: "archived_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Archival timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "connection_id", ReferencedTable: "real_time_connections", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_stream_buffer_size", Expression: "buffer_size >= 0 AND buffer_size <= 10000"},
			{Name: "chk_stream_latency_range", Expression: "max_latency_ms >= 0 AND max_latency_ms <= 30000"},
			{Name: "chk_stream_retry_attempts", Expression: "retry_attempts >= 0"},
			{Name: "chk_stream_counters_non_negative", Expression: "events_sent >= 0 AND events_dropped >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Event streaming configuration",
		},
	}
}

// getStateHashTable returns the state hashes table definition
func getStateHashTable() TableDefinition {
	return TableDefinition{
		Name: "state_hashes",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "hash_type", Type: "VARCHAR(50)", Nullable: false, Default: "sha256", Comments: "Hash algorithm"},
			{Name: "hash_value", Type: "VARCHAR(128)", Nullable: false, Comments: "Hash value"},
			{Name: "turn_id", Type: "VARCHAR(255)", Nullable: false, Comments: "Turn identifier"},
			{Name: "sequence", Type: "BIGINT", Nullable: false, Comments: "Sequence number"},
			{Name: "round_number", Type: "INTEGER", Nullable: false, Default: 1, Comments: "Round number"},
			{Name: "game_phase", Type: "VARCHAR(20)", Nullable: false, Comments: "Game phase"},
			{Name: "state_components", Type: "JSONB", Nullable: true, Comments: "State components included"},
			{Name: "state_size", Type: "BIGINT", Nullable: false, Default: 0, Comments: "State size in bytes"},
			{Name: "is_verified", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Verification status"},
			{Name: "verification_passed", Type: "BOOLEAN", Nullable: true, Comments: "Verification result"},
			{Name: "verified_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Verification timestamp"},
			{Name: "verification_errors", Type: "JSONB", Nullable: true, Comments: "Verification errors"},
			{Name: "client_version", Type: "VARCHAR(50)", Nullable: true, Comments: "Client version"},
			{Name: "platform", Type: "VARCHAR(100)", Nullable: true, Comments: "Client platform"},
			{Name: "user_agent", Type: "VARCHAR(500)", Nullable: true, Comments: "Client user agent"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_hash_length", Expression: "LENGTH(hash_value) = 64"},
			{Name: "chk_hash_sequence_non_negative", Expression: "sequence >= 0"},
			{Name: "chk_hash_round_positive", Expression: "round_number >= 1"},
			{Name: "chk_hash_state_size_non_negative", Expression: "state_size >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Game state hash verification",
		},
	}
}

// getSessionStateTable returns the session states table definition
func getSessionStateTable() TableDefinition {
	return TableDefinition{
		Name: "session_states",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "connection_status", Type: "VARCHAR(20)", Nullable: false, Default: "disconnected", Comments: "Connection status"},
			{Name: "is_synchronized", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Synchronization status"},
			{Name: "sync_progress", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Synchronization progress"},
			{Name: "last_received_seq", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Last received sequence"},
			{Name: "last_processed_seq", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Last processed sequence"},
			{Name: "acknowledged_seq", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Acknowledged sequence"},
			{Name: "requested_seq", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Requested sequence"},
			{Name: "current_turn_id", Type: "VARCHAR(255)", Nullable: true, Comments: "Current turn ID"},
			{Name: "is_active_player", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Active player status"},
			{Name: "is_spectator", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Spectator status"},
			{Name: "reconnection_session_id", Type: "UUID", Nullable: true, Comments: "Reconnection session reference"},
			{Name: "disconnect_reason", Type: "VARCHAR(255)", Nullable: true, Comments: "Disconnection reason"},
			{Name: "disconnected_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Disconnection timestamp"},
			{Name: "grace_period_until", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Grace period end"},
			{Name: "max_reconnect_attempts", Type: "INTEGER", Nullable: false, Default: 5, Comments: "Max reconnect attempts"},
			{Name: "reconnect_attempts", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Reconnect attempts count"},
			{Name: "turn_timer_started", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Turn timer start"},
			{Name: "turn_timer_ends", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Turn timer end"},
			{Name: "turn_timeout_count", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Turn timeout count"},
			{Name: "is_turn_active", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Turn active status"},
			{Name: "connection_quality", Type: "DOUBLE PRECISION", Nullable: false, Default: 1.0, Comments: "Connection quality score"},
			{Name: "latency_average", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Average latency"},
			{Name: "packet_loss_rate", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Packet loss rate"},
			{Name: "supported_features", Type: "JSONB", Nullable: true, Comments: "Supported client features"},
			{Name: "client_version", Type: "VARCHAR(50)", Nullable: true, Comments: "Client version"},
			{Name: "platform", Type: "VARCHAR(100)", Nullable: true, Comments: "Client platform"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_sync_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last sync timestamp"},
			{Name: "last_activity_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last activity timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "reconnection_session_id", ReferencedTable: "reconnection_sessions", ReferencedColumn: "id", OnDelete: "SET NULL", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_session_sequence_non_negative", Expression: "last_received_seq >= 0 AND last_processed_seq >= 0 AND acknowledged_seq >= 0"},
			{Name: "chk_session_progress_range", Expression: "sync_progress >= 0.0 AND sync_progress <= 1.0"},
			{Name: "chk_session_quality_range", Expression: "connection_quality >= 0.0 AND connection_quality <= 1.0"},
			{Name: "chk_session_packet_loss_range", Expression: "packet_loss_rate >= 0.0 AND packet_loss_rate <= 100.0"},
			{Name: "chk_session_reconnect_attempts", Expression: "reconnect_attempts >= 0 AND reconnect_attempts <= max_reconnect_attempts"},
			{Name: "chk_session_max_reconnect", Expression: "max_reconnect_attempts >= 1"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Player session state management",
		},
	}
}

// getEventReceiptTrackingTable returns the event receipt tracking table definition
func getEventReceiptTrackingTable() TableDefinition {
	return TableDefinition{
		Name: "event_receipt_tracking",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "event_sequence", Type: "BIGINT", Nullable: false, Comments: "Event sequence number"},
			{Name: "event_id", Type: "UUID", Nullable: false, Comments: "Event ID"},
			{Name: "event_type", Type: "VARCHAR(100)", Nullable: false, Comments: "Event type"},
			{Name: "turn_id", Type: "VARCHAR(255)", Nullable: false, Comments: "Turn identifier"},
			{Name: "status", Type: "VARCHAR(50)", Nullable: false, Default: "pending", Comments: "Receipt status"},
			{Name: "sent_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Send timestamp"},
			{Name: "received_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Receive timestamp"},
			{Name: "processed_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Processing timestamp"},
			{Name: "failed_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Failure timestamp"},
			{Name: "delivery_latency", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Delivery latency in ms"},
			{Name: "processing_latency", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Processing latency in ms"},
			{Name: "retry_count", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Retry count"},
			{Name: "max_retries", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Maximum retries"},
			{Name: "error_code", Type: "VARCHAR(50)", Nullable: true, Comments: "Error code"},
			{Name: "error_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Error message"},
			{Name: "event_size", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Event size in bytes"},
			{Name: "priority", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Event priority"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "expires_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Expiration timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_receipt_sequence_non_negative", Expression: "event_sequence >= 0"},
			{Name: "chk_receipt_retry_counts", Expression: "retry_count >= 0 AND max_retries >= 0"},
			{Name: "chk_receipt_event_size_non_negative", Expression: "event_size >= 0"},
			{Name: "chk_receipt_latencies_non_negative", Expression: "delivery_latency >= 0 AND processing_latency >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Event delivery receipt tracking",
		},
	}
}

// getReconnectionSessionTable returns the reconnection sessions table definition
func getReconnectionSessionTable() TableDefinition {
	return TableDefinition{
		Name: "reconnection_sessions",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "session_token", Type: "VARCHAR(255)", Nullable: false, Comments: "Session token"},
			{Name: "is_active", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Session active status"},
			{Name: "expires_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Expiration timestamp"},
			{Name: "last_activity_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last activity timestamp"},
			{Name: "player_state", Type: "JSONB", Nullable: false, Comments: "Player state snapshot"},
			{Name: "game_state_hash", Type: "VARCHAR(128)", Nullable: false, Comments: "Game state hash"},
			{Name: "last_sequence", Type: "BIGINT", Nullable: false, Comments: "Last sequence number"},
			{Name: "current_turn_id", Type: "VARCHAR(255)", Nullable: true, Comments: "Current turn ID"},
			{Name: "position_in_turn", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Position in turn order"},
			{Name: "missed_events", Type: "JSONB", Nullable: true, Comments: "Missed event sequences"},
			{Name: "snapshot_required", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Snapshot required flag"},
			{Name: "snapshot_data", Type: "JSONB", Nullable: true, Comments: "Snapshot data"},
			{Name: "max_attempts", Type: "INTEGER", Nullable: false, Default: 5, Comments: "Maximum attempts"},
			{Name: "attempt_count", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Attempt count"},
			{Name: "last_attempt_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last attempt timestamp"},
			{Name: "successful_reconnection_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Successful reconnection timestamp"},
			{Name: "priority", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Session priority"},
			{Name: "bandwidth_limit", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Bandwidth limit in bytes/sec"},
			{Name: "compression_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Compression enabled"},
			{Name: "client_fingerprint", Type: "VARCHAR(255)", Nullable: true, Comments: "Client fingerprint"},
			{Name: "ip_address", Type: "VARCHAR(45)", Nullable: true, Comments: "Client IP address"},
			{Name: "user_agent", Type: "VARCHAR(500)", Nullable: true, Comments: "Client user agent"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "archived_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Archival timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_reconn_sequence_non_negative", Expression: "last_sequence >= 0"},
			{Name: "chk_reconn_position_non_negative", Expression: "position_in_turn >= 0"},
			{Name: "chk_reconn_attempts", Expression: "attempt_count >= 0 AND attempt_count <= max_attempts"},
			{Name: "chk_reconn_max_attempts", Expression: "max_attempts >= 1"},
			{Name: "chk_reconn_bandwidth_non_negative", Expression: "bandwidth_limit >= 0"},
			{Name: "chk_reconn_hash_length", Expression: "LENGTH(game_state_hash) = 64"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Player reconnection session management",
		},
	}
}

// getErrorHandlerTable returns the error handlers table definition
func getErrorHandlerTable() TableDefinition {
	return TableDefinition{
		Name: "error_handlers",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "handler_name", Type: "VARCHAR(255)", Nullable: false, Comments: "Handler name"},
			{Name: "error_category", Type: "VARCHAR(100)", Nullable: false, Comments: "Error category"},
			{Name: "severity", Type: "VARCHAR(20)", Nullable: false, Default: "medium", Comments: "Error severity"},
			{Name: "is_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Handler enabled status"},
			{Name: "error_pattern", Type: "VARCHAR(500)", Nullable: true, Comments: "Error pattern regex"},
			{Name: "error_code", Type: "VARCHAR(100)", Nullable: true, Comments: "Specific error codes"},
			{Name: "priority", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Handler priority"},
			{Name: "response_action", Type: "VARCHAR(100)", Nullable: false, Comments: "Response action"},
			{Name: "max_retries", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Maximum retries"},
			{Name: "retry_delay", Type: "INTEGER", Nullable: false, Default: 1000, Comments: "Retry delay in ms"},
			{Name: "exponential_backoff", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Exponential backoff enabled"},
			{Name: "fallback_action", Type: "VARCHAR(100)", Nullable: true, Comments: "Fallback action"},
			{Name: "fallback_handler", Type: "VARCHAR(255)", Nullable: true, Comments: "Fallback handler"},
			{Name: "circuit_breaker_threshold", Type: "INTEGER", Nullable: false, Default: 5, Comments: "Circuit breaker threshold"},
			{Name: "circuit_breaker_timeout", Type: "INTEGER", Nullable: false, Default: 60000, Comments: "Circuit breaker timeout in ms"},
			{Name: "notify_users", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Notify users flag"},
			{Name: "notify_admins", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Notify admins flag"},
			{Name: "user_message", Type: "VARCHAR(500)", Nullable: true, Comments: "User notification message"},
			{Name: "admin_message", Type: "VARCHAR(1000)", Nullable: true, Comments: "Admin notification message"},
			{Name: "log_level", Type: "VARCHAR(20)", Nullable: false, Default: "ERROR", Comments: "Log level"},
			{Name: "metric_tags", Type: "JSONB", Nullable: true, Comments: "Metric tags"},
			{Name: "is_in_circuit_breaker", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Circuit breaker status"},
			{Name: "circuit_breaker_opened_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Circuit breaker open timestamp"},
			{Name: "failure_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Failure count"},
			{Name: "success_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Success count"},
			{Name: "last_failure_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last failure timestamp"},
			{Name: "last_success_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last success timestamp"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_triggered_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last triggered timestamp"},
		},
		PrimaryKey: []string{"id"},
		Checks: []CheckDefinition{
			{Name: "chk_handler_retries_non_negative", Expression: "max_retries >= 0 AND retry_delay >= 0"},
			{Name: "chk_handler_circuit_breaker", Expression: "circuit_breaker_threshold >= 1 AND circuit_breaker_timeout >= 1000"},
			{Name: "chk_handler_counts_non_negative", Expression: "failure_count >= 0 AND success_count >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Error handler configurations",
		},
	}
}

// getGracefulDegradationTable returns the graceful degradation table definition
func getGracefulDegradationTable() TableDefinition {
	return TableDefinition{
		Name: "graceful_degradation",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "component_name", Type: "VARCHAR(255)", Nullable: false, Comments: "Component name"},
			{Name: "current_level", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Current degradation level"},
			{Name: "max_levels", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Maximum degradation levels"},
			{Name: "auto_degrade", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Auto degrade enabled"},
			{Name: "auto_recover", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Auto recover enabled"},
			{Name: "recovery_delay", Type: "INTEGER", Nullable: false, Default: 30000, Comments: "Recovery delay in ms"},
			{Name: "error_threshold", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.1, Comments: "Error rate threshold"},
			{Name: "performance_threshold", Type: "DOUBLE PRECISION", Nullable: false, Default: 200.0, Comments: "Performance threshold in ms"},
			{Name: "latency_threshold", Type: "DOUBLE PRECISION", Nullable: false, Default: 1000.0, Comments: "Latency threshold in ms"},
			{Name: "level_configs", Type: "JSONB", Nullable: true, Comments: "Level configurations"},
			{Name: "is_active", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Component active status"},
			{Name: "is_degraded", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "Degraded status"},
			{Name: "last_degrade_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last degradation timestamp"},
			{Name: "last_recover_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last recovery timestamp"},
			{Name: "recovery_scheduled_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Recovery scheduled timestamp"},
			{Name: "error_rate", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Current error rate"},
			{Name: "response_time", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Response time in ms"},
			{Name: "latency", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Latency in ms"},
			{Name: "quality_score", Type: "DOUBLE PRECISION", Nullable: false, Default: 1.0, Comments: "Quality score"},
			{Name: "disabled_features", Type: "JSONB", Nullable: true, Comments: "Disabled features list"},
			{Name: "limited_features", Type: "JSONB", Nullable: true, Comments: "Feature limitations"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_assessment_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last assessment timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_degradation_levels", Expression: "current_level >= 0 AND current_level <= max_levels"},
			{Name: "chk_degradation_max_levels", Expression: "max_levels >= 1"},
			{Name: "chk_degradation_recovery_delay", Expression: "recovery_delay >= 1000"},
			{Name: "chk_degradation_thresholds", Expression: "error_threshold >= 0.0 AND error_threshold <= 1.0 AND performance_threshold >= 0.0 AND latency_threshold >= 0.0"},
			{Name: "chk_degradation_quality_range", Expression: "quality_score >= 0.0 AND quality_score <= 1.0"},
			{Name: "chk_degradation_metrics_non_negative", Expression: "error_rate >= 0.0 AND response_time >= 0.0 AND latency >= 0.0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Graceful degradation configuration",
		},
	}
}

// getErrorRecoveryTable returns the error recovery table definition
func getErrorRecoveryTable() TableDefinition {
	return TableDefinition{
		Name: "error_recovery",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "recovery_name", Type: "VARCHAR(255)", Nullable: false, Comments: "Recovery name"},
			{Name: "error_type", Type: "VARCHAR(100)", Nullable: false, Comments: "Error type"},
			{Name: "severity", Type: "VARCHAR(20)", Nullable: false, Default: "medium", Comments: "Error severity"},
			{Name: "is_enabled", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Recovery enabled status"},
			{Name: "recovery_action", Type: "VARCHAR(100)", Nullable: false, Comments: "Recovery action"},
			{Name: "automatic", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Automatic recovery"},
			{Name: "user_confirmation", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "User confirmation required"},
			{Name: "user_message", Type: "VARCHAR(500)", Nullable: false, Comments: "User message"},
			{Name: "user_action_text", Type: "VARCHAR(100)", Nullable: true, Comments: "User action button text"},
			{Name: "user_cancel_text", Type: "VARCHAR(100)", Nullable: true, Comments: "User cancel button text"},
			{Name: "show_progress", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Show progress indicator"},
			{Name: "progress_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Progress message"},
			{Name: "max_attempts", Type: "INTEGER", Nullable: false, Default: 3, Comments: "Maximum attempts"},
			{Name: "attempt_delay", Type: "INTEGER", Nullable: false, Default: 1000, Comments: "Attempt delay in ms"},
			{Name: "exponential_backoff", Type: "BOOLEAN", Nullable: false, Default: true, Comments: "Exponential backoff"},
			{Name: "timeout", Type: "INTEGER", Nullable: false, Default: 30000, Comments: "Timeout in ms"},
			{Name: "fallback_recovery", Type: "VARCHAR(255)", Nullable: true, Comments: "Fallback recovery name"},
			{Name: "fallback_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Fallback message"},
			{Name: "success_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Success message"},
			{Name: "failure_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Failure message"},
			{Name: "on_success_action", Type: "VARCHAR(100)", Nullable: true, Comments: "On success action"},
			{Name: "on_failure_action", Type: "VARCHAR(100)", Nullable: true, Comments: "On failure action"},
			{Name: "context", Type: "JSONB", Nullable: true, Comments: "Recovery context"},
			{Name: "required_state", Type: "JSONB", Nullable: true, Comments: "Required state conditions"},
			{Name: "usage_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Usage count"},
			{Name: "success_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Success count"},
			{Name: "failure_count", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Failure count"},
			{Name: "average_recovery_time", Type: "DOUBLE PRECISION", Nullable: false, Default: 0.0, Comments: "Average recovery time in ms"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
			{Name: "last_used_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Last used timestamp"},
		},
		PrimaryKey: []string{"id"},
		Checks: []CheckDefinition{
			{Name: "chk_recovery_attempts_non_negative", Expression: "max_attempts >= 1 AND attempt_delay >= 0"},
			{Name: "chk_recovery_timeout", Expression: "timeout >= 1000"},
			{Name: "chk_recovery_counts_non_negative", Expression: "usage_count >= 0 AND success_count >= 0 AND failure_count >= 0"},
			{Name: "chk_recovery_time_non_negative", Expression: "average_recovery_time >= 0.0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Error recovery configurations",
		},
	}
}

// getRecoveryAttemptTable returns the recovery attempts table definition
func getRecoveryAttemptTable() TableDefinition {
	return TableDefinition{
		Name: "recovery_attempts",
		Columns: []ColumnDefinition{
			{Name: "id", Type: "UUID", Nullable: false, Comments: "Primary key - UUID v4"},
			{Name: "recovery_id", Type: "UUID", Nullable: false, Comments: "Reference to recovery configuration"},
			{Name: "game_session_id", Type: "UUID", Nullable: false, Comments: "Reference to game session"},
			{Name: "player_id", Type: "UUID", Nullable: false, Comments: "Reference to player profile"},
			{Name: "attempt_number", Type: "INTEGER", Nullable: false, Comments: "Attempt number"},
			{Name: "trigger_error", Type: "VARCHAR(500)", Nullable: false, Comments: "Trigger error message"},
			{Name: "error_context", Type: "JSONB", Nullable: true, Comments: "Error context data"},
			{Name: "started_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Attempt start timestamp"},
			{Name: "completed_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "Completion timestamp"},
			{Name: "duration", Type: "BIGINT", Nullable: false, Default: 0, Comments: "Duration in milliseconds"},
			{Name: "status", Type: "VARCHAR(50)", Nullable: false, Default: "pending", Comments: "Attempt status"},
			{Name: "result_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Result message"},
			{Name: "error_code", Type: "VARCHAR(100)", Nullable: true, Comments: "Error code"},
			{Name: "required_user_action", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "User action required"},
			{Name: "user_action_taken", Type: "BOOLEAN", Nullable: false, Default: false, Comments: "User action taken"},
			{Name: "user_action_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: true, Comments: "User action timestamp"},
			{Name: "progress", Type: "INTEGER", Nullable: false, Default: 0, Comments: "Progress percentage"},
			{Name: "progress_message", Type: "VARCHAR(500)", Nullable: true, Comments: "Progress message"},
			{Name: "created_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Creation timestamp"},
			{Name: "updated_at", Type: "TIMESTAMP WITH TIME ZONE", Nullable: false, Comments: "Last update timestamp"},
		},
		PrimaryKey: []string{"id"},
		ForeignKeys: []ForeignKeyDefinition{
			{Column: "recovery_id", ReferencedTable: "error_recovery", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "game_session_id", ReferencedTable: "game_sessions", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
			{Column: "player_id", ReferencedTable: "player_profiles", ReferencedColumn: "id", OnDelete: "CASCADE", OnUpdate: "CASCADE"},
		},
		Checks: []CheckDefinition{
			{Name: "chk_attempt_number_positive", Expression: "attempt_number >= 1"},
			{Name: "chk_attempt_progress_range", Expression: "progress >= 0 AND progress <= 100"},
			{Name: "chk_attempt_duration_non_negative", Expression: "duration >= 0"},
		},
		Options: TableOptions{
			StorageEngine: "InnoDB",
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			Comment:      "Recovery attempt tracking",
		},
	}
}

// Index definitions for performance optimization

// getGameSessionIndexes returns indexes for game sessions table
func getGameSessionIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_sessions_room_id",
			Table:   "game_sessions",
			Columns: []string{"room_id"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_sessions_host_id",
			Table:   "game_sessions",
			Columns: []string{"host_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_sessions_status",
			Table:   "game_sessions",
			Columns: []string{"is_started", "is_finished"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_sessions_activity",
			Table:   "game_sessions",
			Columns: []string{"last_activity_at"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_sessions_public",
			Table:   "game_sessions",
			Columns: []string{"is_public", "is_started"},
			Type:    "BTREE",
			Partial: "is_public = true AND is_started = false",
		},
		{
			Name:    "idx_sessions_finished",
			Table:   "game_sessions",
			Columns: []string{"finished_at"},
			Type:    "BTREE",
		},
	}
}

// getPlayerProfileIndexes returns indexes for player profiles table
func getPlayerProfileIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_profiles_display_name",
			Table:   "player_profiles",
			Columns: []string{"display_name"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_profiles_online",
			Table:   "player_profiles",
			Columns: []string{"is_online"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_profiles_active",
			Table:   "player_profiles",
			Columns: []string{"is_active_player"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_profiles_rating",
			Table:   "player_profiles",
			Columns: []string{"current_rating"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_profiles_last_seen",
			Table:   "player_profiles",
			Columns: []string{"last_seen_at"},
			Type:    "BTREE",
		},
	}
}

// getPlayerActionIndexes returns indexes for player actions table
func getPlayerActionIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_actions_session_sequence",
			Table:   "player_actions",
			Columns: []string{"game_session_id", "sequence"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_actions_player_session",
			Table:   "player_actions",
			Columns: []string{"player_id", "game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_actions_turn_id",
			Table:   "player_actions",
			Columns: []string{"turn_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_actions_unprocessed",
			Table:   "player_actions",
			Columns: []string{"is_processed"},
			Type:    "BTREE",
			Partial: "is_processed = false",
		},
		{
			Name:    "idx_actions_created",
			Table:   "player_actions",
			Columns: []string{"created_at"},
			Type:    "BTREE",
		},
	}
}

// getGameStateIndexes returns indexes for game states table
func getGameStateIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_states_session_sequence",
			Table:   "game_states",
			Columns: []string{"game_session_id", "sequence"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_states_hash",
			Table:   "game_states",
			Columns: []string{"state_hash"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_states_round_phase",
			Table:   "game_states",
			Columns: []string{"round_number", "phase"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_states_created",
			Table:   "game_states",
			Columns: []string{"created_at"},
			Type:    "BTREE",
		},
	}
}

// getMultiplayerRosterIndexes returns indexes for multiplayer rosters table
func getMultiplayerRosterIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_rosters_session",
			Table:   "multiplayer_rosters",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_rosters_name",
			Table:   "multiplayer_rosters",
			Columns: []string{"name"},
			Type:    "BTREE",
		},
	}
}

// getPlayerStatisticsIndexes returns indexes for player statistics table
func getPlayerStatisticsIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_stats_player",
			Table:   "player_statistics",
			Columns: []string{"player_id"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_stats_rating",
			Table:   "player_statistics",
			Columns: []string{"current_rating"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_stats_win_rate",
			Table:   "player_statistics",
			Columns: []string{"win_rate"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_stats_last_played",
			Table:   "player_statistics",
			Columns: []string{"last_played_at"},
			Type:    "BTREE",
		},
	}
}

// getCryptographicKeyPairIndexes returns indexes for cryptographic key pairs table
func getCryptographicKeyPairIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_keys_player",
			Table:   "cryptographic_key_pairs",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_keys_active",
			Table:   "cryptographic_key_pairs",
			Columns: []string{"is_active", "is_revoked"},
			Type:    "BTREE",
			Partial: "is_active = true AND is_revoked = false",
		},
		{
			Name:    "idx_keys_expires",
			Table:   "cryptographic_key_pairs",
			Columns: []string{"expires_at"},
			Type:    "BTREE",
			Partial: "expires_at IS NOT NULL",
		},
	}
}

// getAuthenticationTokenIndexes returns indexes for authentication tokens table
func getAuthenticationTokenIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_tokens_player",
			Table:   "authentication_tokens",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_tokens_hash",
			Table:   "authentication_tokens",
			Columns: []string{"token_hash"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_tokens_type",
			Table:   "authentication_tokens",
			Columns: []string{"token_type"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_tokens_expires",
			Table:   "authentication_tokens",
			Columns: []string{"expires_at"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_tokens_active",
			Table:   "authentication_tokens",
			Columns: []string{"is_revoked", "expires_at"},
			Type:    "BTREE",
			Partial: "is_revoked = false AND expires_at > NOW()",
		},
		{
			Name:    "idx_tokens_device",
			Table:   "authentication_tokens",
			Columns: []string{"device_id"},
			Type:    "BTREE",
		},
	}
}

// getKeyBackupIndexes returns indexes for key backups table
func getKeyBackupIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_backups_player",
			Table:   "key_backups",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_backups_key_pair",
			Table:   "key_backups",
			Columns: []string{"key_pair_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_backups_active",
			Table:   "key_backups",
			Columns: []string{"is_active", "is_used"},
			Type:    "BTREE",
			Partial: "is_active = true AND is_used = false",
		},
		{
			Name:    "idx_backups_expires",
			Table:   "key_backups",
			Columns: []string{"expires_at"},
			Type:    "BTREE",
			Partial: "expires_at IS NOT NULL",
		},
		{
			Name:    "idx_backups_device",
			Table:   "key_backups",
			Columns: []string{"device_id"},
			Type:    "BTREE",
		},
	}
}

// getRealTimeConnectionIndexes returns indexes for real-time connections table
func getRealTimeConnectionIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_connections_session",
			Table:   "real_time_connections",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_connections_player",
			Table:   "real_time_connections",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_connections_id",
			Table:   "real_time_connections",
			Columns: []string{"connection_id"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_connections_status",
			Table:   "real_time_connections",
			Columns: []string{"status"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_connections_active",
			Table:   "real_time_connections",
			Columns: []string{"status", "is_healthy"},
			Type:    "BTREE",
			Partial: "status = 'connected' AND is_healthy = true",
		},
		{
			Name:    "idx_connections_ping",
			Table:   "real_time_connections",
			Columns: []string{"next_ping_at"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_connections_timeout",
			Table:   "real_time_connections",
			Columns: []string{"last_pong_at", "timeout_duration"},
			Type:    "BTREE",
		},
	}
}

// getEventStreamIndexes returns indexes for event streams table
func getEventStreamIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_streams_connection",
			Table:   "event_streams",
			Columns: []string{"connection_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_streams_session",
			Table:   "event_streams",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_streams_name_type",
			Table:   "event_streams",
			Columns: []string{"stream_name", "stream_type"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_streams_active",
			Table:   "event_streams",
			Columns: []string{"is_active"},
			Type:    "BTREE",
			Partial: "is_active = true",
		},
		{
			Name:    "idx_streams_activity",
			Table:   "event_streams",
			Columns: []string{"last_activity_at"},
			Type:    "BTREE",
		},
	}
}

// getStateHashIndexes returns indexes for state hashes table
func getStateHashIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_hashes_session_player",
			Table:   "state_hashes",
			Columns: []string{"game_session_id", "player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_hashes_value",
			Table:   "state_hashes",
			Columns: []string{"hash_value"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_hashes_turn",
			Table:   "state_hashes",
			Columns: []string{"turn_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_hashes_sequence",
			Table:   "state_hashes",
			Columns: []string{"sequence"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_hashes_verified",
			Table:   "state_hashes",
			Columns: []string{"is_verified"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_hashes_created",
			Table:   "state_hashes",
			Columns: []string{"created_at"},
			Type:    "BTREE",
		},
	}
}

// getSessionStateIndexes returns indexes for session states table
func getSessionStateIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_session_states_session",
			Table:   "session_states",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_session_states_player",
			Table:   "session_states",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_session_states_status",
			Table:   "session_states",
			Columns: []string{"connection_status"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_session_states_sequence",
			Table:   "session_states",
			Columns: []string{"last_received_seq", "acknowledged_seq"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_session_states_disconnected",
			Table:   "session_states",
			Columns: []string{"connection_status", "grace_period_until"},
			Type:    "BTREE",
			Partial: "connection_status = 'disconnected' AND grace_period_until IS NOT NULL",
		},
		{
			Name:    "idx_session_states_activity",
			Table:   "session_states",
			Columns: []string{"last_activity_at"},
			Type:    "BTREE",
		},
	}
}

// getEventReceiptTrackingIndexes returns indexes for event receipt tracking table
func getEventReceiptTrackingIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_receipt_tracking_session",
			Table:   "event_receipt_tracking",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_receipt_tracking_player",
			Table:   "event_receipt_tracking",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_receipt_tracking_sequence",
			Table:   "event_receipt_tracking",
			Columns: []string{"event_sequence"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_receipt_tracking_event",
			Table:   "event_receipt_tracking",
			Columns: []string{"event_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_receipt_tracking_status",
			Table:   "event_receipt_tracking",
			Columns: []string{"status"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_receipt_tracking_pending",
			Table:   "event_receipt_tracking",
			Columns: []string{"status", "created_at"},
			Type:    "BTREE",
			Partial: "status IN ('pending', 'sent')",
		},
		{
			Name:    "idx_receipt_tracking_expires",
			Table:   "event_receipt_tracking",
			Columns: []string{"expires_at"},
			Type:    "BTREE",
			Partial: "expires_at IS NOT NULL",
		},
	}
}

// getReconnectionSessionIndexes returns indexes for reconnection sessions table
func getReconnectionSessionIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_reconn_sessions_session",
			Table:   "reconnection_sessions",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_reconn_sessions_player",
			Table:   "reconnection_sessions",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_reconn_sessions_token",
			Table:   "reconnection_sessions",
			Columns: []string{"session_token"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_reconn_sessions_active",
			Table:   "reconnection_sessions",
			Columns: []string{"is_active", "expires_at"},
			Type:    "BTREE",
			Partial: "is_active = true",
		},
		{
			Name:    "idx_reconn_sessions_fingerprint",
			Table:   "reconnection_sessions",
			Columns: []string{"client_fingerprint"},
			Type:    "BTREE",
			Partial: "client_fingerprint IS NOT NULL",
		},
		{
			Name:    "idx_reconn_sessions_expires",
			Table:   "reconnection_sessions",
			Columns: []string{"expires_at"},
			Type:    "BTREE",
		},
	}
}

// getErrorHandlerIndexes returns indexes for error handlers table
func getErrorHandlerIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_error_handlers_name",
			Table:   "error_handlers",
			Columns: []string{"handler_name"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_error_handlers_category",
			Table:   "error_handlers",
			Columns: []string{"error_category"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_error_handlers_enabled",
			Table:   "error_handlers",
			Columns: []string{"is_enabled", "is_in_circuit_breaker"},
			Type:    "BTREE",
			Partial: "is_enabled = true AND is_in_circuit_breaker = false",
		},
		{
			Name:    "idx_error_handlers_priority",
			Table:   "error_handlers",
			Columns: []string{"priority"},
			Type:    "BTREE",
		},
	}
}

// getGracefulDegradationIndexes returns indexes for graceful degradation table
func getGracefulDegradationIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_degradation_session",
			Table:   "graceful_degradation",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_degradation_component",
			Table:   "graceful_degradation",
			Columns: []string{"component_name"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_degradation_level",
			Table:   "graceful_degradation",
			Columns: []string{"current_level"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_degradation_degraded",
			Table:   "graceful_degradation",
			Columns: []string{"is_degraded"},
			Type:    "BTREE",
			Partial: "is_degraded = true",
		},
		{
			Name:    "idx_degradation_recovery",
			Table:   "graceful_degradation",
			Columns: []string{"recovery_scheduled_at"},
			Type:    "BTREE",
			Partial: "recovery_scheduled_at IS NOT NULL",
		},
	}
}

// getErrorRecoveryIndexes returns indexes for error recovery table
func getErrorRecoveryIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_error_recovery_name",
			Table:   "error_recovery",
			Columns: []string{"recovery_name"},
			Type:    "BTREE",
			Unique:  true,
		},
		{
			Name:    "idx_error_recovery_type",
			Table:   "error_recovery",
			Columns: []string{"error_type"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_error_recovery_enabled",
			Table:   "error_recovery",
			Columns: []string{"is_enabled"},
			Type:    "BTREE",
			Partial: "is_enabled = true",
		},
		{
			Name:    "idx_error_recovery_usage",
			Table:   "error_recovery",
			Columns: []string{"usage_count", "success_count"},
			Type:    "BTREE",
		},
	}
}

// getRecoveryAttemptIndexes returns indexes for recovery attempts table
func getRecoveryAttemptIndexes() []IndexDefinition {
	return []IndexDefinition{
		{
			Name:    "idx_recovery_attempts_recovery",
			Table:   "recovery_attempts",
			Columns: []string{"recovery_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_recovery_attempts_session",
			Table:   "recovery_attempts",
			Columns: []string{"game_session_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_recovery_attempts_player",
			Table:   "recovery_attempts",
			Columns: []string{"player_id"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_recovery_attempts_status",
			Table:   "recovery_attempts",
			Columns: []string{"status"},
			Type:    "BTREE",
		},
		{
			Name:    "idx_recovery_attempts_running",
			Table:   "recovery_attempts",
			Columns: []string{"status", "started_at"},
			Type:    "BTREE",
			Partial: "status IN ('pending', 'running')",
		},
	}
}

// Database function definitions

// getGameStateHashFunction returns the game state hash function
func getGameStateHashFunction() FunctionDefinition {
	return FunctionDefinition{
		Name: "calculate_game_state_hash",
		Parameters: []ParameterDefinition{
			{Name: "state_data", Type: "JSONB", Mode: "IN"},
		},
		Returns:  "VARCHAR(64)",
		Language: "plpgsql",
		Security: "SECURITY INVOKER",
		Body: `
BEGIN
    RETURN encode(sha256(state_data::text::bytea), 'hex');
END;
		`,
	}
}

// getPlayerRatingFunction returns the player rating calculation function
func getPlayerRatingFunction() FunctionDefinition {
	return FunctionDefinition{
		Name: "calculate_player_rating",
		Parameters: []ParameterDefinition{
			{Name: "player_id", Type: "UUID", Mode: "IN"},
		},
		Returns:  "DOUBLE PRECISION",
		Language: "plpgsql",
		Security: "SECURITY INVOKER",
		Body: `
DECLARE
    win_rate DOUBLE PRECISION;
    finish_rate DOUBLE PRECISION;
    avg_opponent_rating DOUBLE PRECISION;
    base_rating DOUBLE PRECISION;
BEGIN
    -- Get player statistics
    SELECT ps.win_rate, ps.finish_rate INTO win_rate, finish_rate
    FROM player_statistics ps
    WHERE ps.player_id = calculate_player_rating.player_id;

    -- Calculate base rating from win rate and finish rate
    base_rating = 1000.0 + (win_rate * 10.0) + (finish_rate * 5.0);

    -- Apply rating bounds
    base_rating = GREATEST(0.0, LEAST(3000.0, base_rating));

    RETURN base_rating;
END;
		`,
	}
}

// getCleanupExpiredSessionsFunction returns the cleanup function for expired sessions
func getCleanupExpiredSessionsFunction() FunctionDefinition {
	return FunctionDefinition{
		Name: "cleanup_expired_sessions",
		Parameters: []ParameterDefinition{
			{Name: "older_than_hours", Type: "INTEGER", Mode: "IN", Default: "24"},
		},
		Returns:  "INTEGER",
		Language: "plpgsql",
		Security: "SECURITY DEFINER",
		Body: `
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Archive expired reconnection sessions
    UPDATE reconnection_sessions
    SET is_active = false, archived_at = NOW()
    WHERE is_active = true
    AND expires_at < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Delete old event receipt tracking records
    DELETE FROM event_receipt_tracking
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

    -- Archive old connection records
    UPDATE real_time_connections
    SET status = 'disconnected'
    WHERE status = 'connected'
    AND last_activity_at < NOW() - INTERVAL '5 minutes';

    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;

    RETURN deleted_count;
END;
		`,
	}
}

// getPlayerStatisticsUpdateFunction returns the statistics update function
func getPlayerStatisticsUpdateFunction() FunctionDefinition {
	return FunctionDefinition{
		Name: "update_player_statistics",
		Parameters: []ParameterDefinition{
			{Name: "player_id", Type: "UUID", Mode: "IN"},
			{Name: "games_played_delta", Type: "INTEGER", Mode: "IN", Default: "0"},
			{Name: "games_won_delta", Type: "INTEGER", Mode: "IN", Default: "0"},
			{Name: "games_finished_delta", Type: "INTEGER", Mode: "IN", Default: "0"},
			{Name: "playtime_seconds_delta", Type: "INTEGER", Mode: "IN", Default: "0"},
		},
		Returns:  "VOID",
		Language: "plpgsql",
		Security: "SECURITY INVOKER",
		Body: `
BEGIN
    INSERT INTO player_statistics (
        player_id, games_played, games_won, games_finished,
        total_playtime_seconds, created_at, updated_at, last_played_at
    ) VALUES (
        update_player_statistics.player_id,
        GREATEST(0, update_player_statistics.games_played_delta),
        GREATEST(0, update_player_statistics.games_won_delta),
        GREATEST(0, update_player_statistics.games_finished_delta),
        GREATEST(0, update_player_statistics.playtime_seconds_delta),
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        games_played = player_statistics.games_played + GREATEST(0, update_player_statistics.games_played_delta),
        games_won = player_statistics.games_won + GREATEST(0, update_player_statistics.games_won_delta),
        games_finished = player_statistics.games_finished + GREATEST(0, update_player_statistics.games_finished_delta),
        total_playtime_seconds = player_statistics.total_playtime_seconds + GREATEST(0, update_player_statistics.playtime_seconds_delta),
        last_played_at = CASE
            WHEN update_player_statistics.games_played_delta > 0 THEN NOW()
            ELSE player_statistics.last_played_at
        END,
        updated_at = NOW();

    -- Update calculated fields
    UPDATE player_statistics
    SET
        win_rate = CASE
            WHEN games_played > 0 THEN (games_won::DOUBLE PRECISION / games_played::DOUBLE PRECISION) * 100.0
            ELSE 0.0
        END,
        finish_rate = CASE
            WHEN games_played > 0 THEN (games_finished::DOUBLE PRECISION / games_played::DOUBLE PRECISION) * 100.0
            ELSE 0.0
        END,
        average_game_minutes = CASE
            WHEN games_finished > 0 THEN (total_playtime_seconds::DOUBLE PRECISION / games_finished::DOUBLE PRECISION) / 60.0
            ELSE 0.0
        END,
        current_rating = calculate_player_rating(player_id),
        peak_rating = GREATEST(peak_rating, calculate_player_rating(player_id))
    WHERE player_id = update_player_statistics.player_id;
END;
		`,
	}
}

// GenerateSQL generates SQL statements for creating the database schema
func (schema *DatabaseSchema) GenerateSQL() string {
	var statements []string

	// Generate table creation statements
	for _, table := range schema.Tables {
		statements = append(statements, schema.generateTableSQL(table))
	}

	// Generate index creation statements
	for _, index := range schema.Indexes {
		statements = append(statements, schema.generateIndexSQL(index))
	}

	// Generate constraint statements
	for _, constraint := range schema.Constraints {
		statements = append(statements, schema.generateConstraintSQL(constraint))
	}

	// Generate function statements
	for _, function := range schema.Functions {
		statements = append(statements, schema.generateFunctionSQL(function))
	}

	return strings.Join(statements, "\n\n")
}

// generateTableSQL generates SQL for table creation
func (schema *DatabaseSchema) generateTableSQL(table TableDefinition) string {
	var columns []string
	for _, column := range table.Columns {
		colDef := fmt.Sprintf("    %s %s", column.Name, column.Type)
		if !column.Nullable {
			colDef += " NOT NULL"
		}
		if column.Default != nil {
			if str, ok := column.Default.(string); ok {
				colDef += fmt.Sprintf(" DEFAULT %s", str)
			} else {
				colDef += fmt.Sprintf(" DEFAULT %v", column.Default)
			}
		}
		if column.Check != "" {
			colDef += fmt.Sprintf(" CHECK (%s)", column.Check)
		}
		if column.Comments != "" {
			colDef += fmt.Sprintf(" COMMENT '%s'", column.Comments)
		}
		columns = append(columns, colDef)
	}

	// Add primary key constraint
	if len(table.PrimaryKey) > 0 {
		columns = append(columns, fmt.Sprintf("    PRIMARY KEY (%s)", strings.Join(table.PrimaryKey, ", ")))
	}

	// Add foreign key constraints
	for _, fk := range table.ForeignKeys {
		fkDef := fmt.Sprintf("    FOREIGN KEY (%s) REFERENCES %s(%s)",
			fk.Column, fk.ReferencedTable, fk.ReferencedColumn)
		if fk.OnDelete != "" {
			fkDef += fmt.Sprintf(" ON DELETE %s", fk.OnDelete)
		}
		if fk.OnUpdate != "" {
			fkDef += fmt.Sprintf(" ON UPDATE %s", fk.OnUpdate)
		}
		columns = append(columns, fkDef)
	}

	// Add check constraints
	for _, check := range table.Checks {
		columns = append(columns, fmt.Sprintf("    CONSTRAINT %s CHECK (%s)", check.Name, check.Expression))
	}

	sql := fmt.Sprintf("CREATE TABLE %s (\n%s\n)", table.Name, strings.Join(columns, ",\n"))

	// Add table options
	if table.Options.Comment != "" {
		sql += fmt.Sprintf(" COMMENT='%s'", table.Options.Comment)
	}

	return sql + ";"
}

// generateIndexSQL generates SQL for index creation
func (schema *DatabaseSchema) generateIndexSQL(index IndexDefinition) string {
	sql := fmt.Sprintf("CREATE %s INDEX %s ON %s (%s)",
		map[bool]string{true: "UNIQUE", false: ""}[index.Unique],
		index.Name, index.Table, strings.Join(index.Columns, ", "))

	if index.Type != "" && index.Type != "BTREE" {
		sql += fmt.Sprintf(" USING %s", index.Type)
	}

	if index.Partial != "" {
		sql += fmt.Sprintf(" WHERE %s", index.Partial)
	}

	if index.Options.FillFactor > 0 {
		sql += fmt.Sprintf(" WITH (fillfactor = %d)", index.Options.FillFactor)
	}

	if index.Options.Concurrently {
		sql = "CONCURRENTLY " + sql
	}

	return sql + ";"
}

// generateConstraintSQL generates SQL for constraint creation
func (schema *DatabaseSchema) generateConstraintSQL(constraint ConstraintDefinition) string {
	return fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %s %s %s;",
		constraint.Table, constraint.Name, constraint.Type, constraint.Definition)
}

// generateFunctionSQL generates SQL for function creation
func (schema *DatabaseSchema) generateFunctionSQL(function FunctionDefinition) string {
	var params []string
	for _, param := range function.Parameters {
		paramDef := fmt.Sprintf("%s %s", param.Name, param.Type)
		if param.Mode != "" && param.Mode != "IN" {
			paramDef = param.Mode + " " + paramDef
		}
		params = append(params, paramDef)
	}

	sql := fmt.Sprintf("CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s AS $$\n%s\n$$ LANGUAGE %s",
		function.Name, strings.Join(params, ", "), function.Returns, function.Body, function.Language)

	if function.Security != "" {
		sql += fmt.Sprintf(" %s", function.Security)
	}

	return sql + ";"
}