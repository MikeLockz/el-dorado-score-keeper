package entities

import (
	"fmt"
	"strings"
	"time"
)

// EntityRelationship defines relationships between entities
type EntityRelationship struct {
	SourceEntity      string   `json:"sourceEntity"`
	TargetEntity      string   `json:"targetEntity"`
	RelationshipType  string   `json:"relationshipType"` // ONE_TO_ONE, ONE_TO_MANY, MANY_TO_MANY
	SourceField       string   `json:"sourceField"`
	TargetField       string   `json:"targetField"`
	OnDeleteAction    string   `json:"onDeleteAction"`
	OnUpdateAction    string   `json:"onUpdateAction"`
	Description       string   `json:"description"`
}

// GetAllEntityRelationships returns all entity relationships for the system
func GetAllEntityRelationships() []EntityRelationship {
	return []EntityRelationship{
		// Game Session relationships
		{
			SourceEntity:     "GameSession",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "host_id",
			TargetField:      "id",
			OnDeleteAction:   "RESTRICT",
			OnUpdateAction:   "CASCADE",
			Description:      "Each game session has one host player",
		},
		{
			SourceEntity:     "GameSession",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_MANY",
			SourceField:      "id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Game sessions have multiple players (via join table)",
		},
		{
			SourceEntity:     "GameSession",
			TargetEntity:     "GameState",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "game_session_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Game session has multiple state snapshots",
		},
		{
			SourceEntity:     "GameSession",
			TargetEntity:     "PlayerAction",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "game_session_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Game session contains player actions",
		},
		{
			SourceEntity:     "GameSession",
			TargetEntity:     "MultiplayerRoster",
			RelationshipType: "ONE_TO_ONE",
			SourceField:      "id",
			TargetField:      "game_session_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Each game session has one roster",
		},

		// Player Profile relationships
		{
			SourceEntity:     "PlayerProfile",
			TargetEntity:     "PlayerStatistics",
			RelationshipType: "ONE_TO_ONE",
			SourceField:      "id",
			TargetField:      "player_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Each player has statistics",
		},
		{
			SourceEntity:     "PlayerProfile",
			TargetEntity:     "CryptographicKeyPair",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "player_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Player can have multiple key pairs",
		},
		{
			SourceEntity:     "PlayerProfile",
			TargetEntity:     "AuthenticationToken",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "player_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Player can have multiple auth tokens",
		},
		{
			SourceEntity:     "PlayerProfile",
			TargetEntity:     "KeyBackup",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "player_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Player can have multiple key backups",
		},
		{
			SourceEntity:     "PlayerProfile",
			TargetEntity:     "RecoveryPhrase",
			RelationshipType: "ONE_TO_ONE",
			SourceField:      "id",
			TargetField:      "player_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Each player has one recovery phrase",
		},

		// Real-time Connection relationships
		{
			SourceEntity:     "RealTimeConnection",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Connections belong to game sessions",
		},
		{
			SourceEntity:     "RealTimeConnection",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "player_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Connections belong to players",
		},
		{
			SourceEntity:     "RealTimeConnection",
			TargetEntity:     "EventStream",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "connection_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Connections have multiple event streams",
		},

		// Session State relationships
		{
			SourceEntity:     "SessionState",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Session states belong to game sessions",
		},
		{
			SourceEntity:     "SessionState",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "player_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Session states belong to players",
		},
		{
			SourceEntity:     "SessionState",
			TargetEntity:     "ReconnectionSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "reconnection_session_id",
			TargetField:      "id",
			OnDeleteAction:   "SET NULL",
			OnUpdateAction:   "CASCADE",
			Description:      "Session states can reference reconnection sessions",
		},

		// Event Receipt Tracking relationships
		{
			SourceEntity:     "EventReceiptTracking",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Event receipts belong to game sessions",
		},
		{
			SourceEntity:     "EventReceiptTracking",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "player_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Event receipts belong to players",
		},

		// Reconnection Session relationships
		{
			SourceEntity:     "ReconnectionSession",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Reconnection sessions belong to game sessions",
		},
		{
			SourceEntity:     "ReconnectionSession",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "player_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Reconnection sessions belong to players",
		},

		// Error Recovery relationships
		{
			SourceEntity:     "ErrorRecovery",
			TargetEntity:     "RecoveryAttempt",
			RelationshipType: "ONE_TO_MANY",
			SourceField:      "id",
			TargetField:      "recovery_id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Error recovery configurations have multiple attempts",
		},
		{
			SourceEntity:     "RecoveryAttempt",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Recovery attempts belong to game sessions",
		},
		{
			SourceEntity:     "RecoveryAttempt",
			TargetEntity:     "PlayerProfile",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "player_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Recovery attempts belong to players",
		},

		// Graceful Degradation relationships
		{
			SourceEntity:     "GracefulDegradation",
			TargetEntity:     "GameSession",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "game_session_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Graceful degradation configs belong to game sessions",
		},

		// Key Backup to Key Pair relationship
		{
			SourceEntity:     "KeyBackup",
			TargetEntity:     "CryptographicKeyPair",
			RelationshipType: "MANY_TO_ONE",
			SourceField:      "key_pair_id",
			TargetField:      "id",
			OnDeleteAction:   "CASCADE",
			OnUpdateAction:   "CASCADE",
			Description:      "Key backups belong to key pairs",
		},
	}
}

// RelationshipGraph represents a graph of entity relationships
type RelationshipGraph struct {
	Nodes map[string]*EntityNode
	Edges []EntityRelationship
}

// EntityNode represents an entity in the relationship graph
type EntityNode struct {
	Name        string
	Table       string
	PrimaryKey  string
	Description string
}

// GetRelationshipGraph creates and returns the complete relationship graph
func GetRelationshipGraph() *RelationshipGraph {
	graph := &RelationshipGraph{
		Nodes: make(map[string]*EntityNode),
		Edges: GetAllEntityRelationships(),
	}

	// Create nodes for all entities
	entities := []string{
		"GameSession", "PlayerProfile", "PlayerAction", "GameState", "MultiplayerRoster", "PlayerStatistics",
		"CryptographicKeyPair", "AuthenticationToken", "KeyBackup", "RecoveryPhrase",
		"RealTimeConnection", "EventStream", "StateHash", "SessionState", "EventReceiptTracking",
		"ReconnectionSession", "ErrorHandler", "GracefulDegradation", "ErrorRecovery", "RecoveryAttempt",
	}

	for _, entity := range entities {
		graph.Nodes[entity] = &EntityNode{
			Name:        entity,
			Table:       strings.ToLower(entity) + "s", // Convert to table name
			PrimaryKey:  "id",
			Description: getEntityDescription(entity),
		}
	}

	return graph
}

// getEntityDescription returns description for an entity
func getEntityDescription(entity string) string {
	descriptions := map[string]string{
		"GameSession":        "Represents an individual game instance with current state, players, and host controls",
		"PlayerProfile":      "Server-side multiplayer identity with cryptographic key pair and statistics",
		"PlayerAction":       "Individual moves made by players that modify game state",
		"GameState":          "Complete snapshot of all game data including scores and positions",
		"MultiplayerRoster":  "Team composition created specifically for multiplayer games",
		"PlayerStatistics":   "Core gameplay metrics including wins/losses and achievements",
		"CryptographicKeyPair": "Locally-generated public/private key pair for identity and action signing",
		"AuthenticationToken": "Secure credential used to verify player identity and authorize actions",
		"KeyBackup":          "Secure backup mechanism for cryptographic key recovery",
		"RecoveryPhrase":     "Mnemonic phrase for key recovery (alternative to encrypted backup)",
		"RealTimeConnection": "Active communication channel using optimal method (WebSocket/SSE/polling)",
		"EventStream":        "Server-side push mechanism for real-time game updates",
		"StateHash":          "Cryptographic hash of client game state for integrity validation",
		"SessionState":       "Connection and synchronization status for each player in a game",
		"EventReceiptTracking": "Server-side record of which events each client has successfully received",
		"ReconnectionSession": "Temporary preservation of player state during disconnection periods",
		"ErrorHandler":       "Hierarchical system for managing different types of errors",
		"GracefulDegradation": "Progressive reduction of functionality while maintaining core gameplay",
		"ErrorRecovery":      "User-friendly mechanisms for recovering from error conditions",
		"RecoveryAttempt":    "Specific attempt to recover from an error",
	}

	if desc, exists := descriptions[entity]; exists {
		return desc
	}
	return "Entity description not available"
}

// GetEntityDependencies returns all entities that depend on the given entity
func (graph *RelationshipGraph) GetEntityDependencies(entity string) []string {
	var dependencies []string
	seen := make(map[string]bool)

	for _, edge := range graph.Edges {
		if edge.TargetEntity == entity && !seen[edge.SourceEntity] {
			dependencies = append(dependencies, edge.SourceEntity)
			seen[edge.SourceEntity] = true
		}
	}

	return dependencies
}

// GetEntityDependencies returns all entities that the given entity depends on
func (graph *RelationshipGraph) GetEntityPrerequisites(entity string) []string {
	var prerequisites []string
	seen := make(map[string]bool)

	for _, edge := range graph.Edges {
		if edge.SourceEntity == entity && !seen[edge.TargetEntity] {
			prerequisites = append(prerequisites, edge.TargetEntity)
			seen[edge.TargetEntity] = true
		}
	}

	return prerequisites
}

// GetReferentialIntegrityIssues checks for potential referential integrity issues
func (graph *RelationshipGraph) GetReferentialIntegrityIssues() []string {
	var issues []string

	for _, edge := range graph.Edges {
		// Check for circular dependencies
		if edge.OnDeleteAction == "CASCADE" {
			deps := graph.GetEntityDependencies(edge.TargetEntity)
			for _, dep := range deps {
				if dep == edge.SourceEntity {
					issues = append(issues, fmt.Sprintf("Circular cascade dependency: %s -> %s -> %s",
						edge.SourceEntity, edge.TargetEntity, edge.SourceEntity))
				}
			}
		}

		// Check for restrictive deletes that might cause issues
		if edge.OnDeleteAction == "RESTRICT" && edge.RelationshipType == "ONE_TO_MANY" {
			issues = append(issues, fmt.Sprintf("Potential orphaned records: %s -> %s with RESTRICT delete",
				edge.SourceEntity, edge.TargetEntity))
		}
	}

	return issues
}

// GetRelationshipMatrix returns a matrix representation of entity relationships
func (graph *RelationshipGraph) GetRelationshipMatrix() map[string]map[string]EntityRelationship {
	matrix := make(map[string]map[string]EntityRelationship)

	// Initialize matrix
	for sourceEntity := range graph.Nodes {
		matrix[sourceEntity] = make(map[string]EntityRelationship)
		for targetEntity := range graph.Nodes {
			matrix[sourceEntity][targetEntity] = EntityRelationship{}
		}
	}

	// Fill matrix with relationships
	for _, edge := range graph.Edges {
		matrix[edge.SourceEntity][edge.TargetEntity] = edge
	}

	return matrix
}