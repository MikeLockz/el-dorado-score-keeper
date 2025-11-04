package entities

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// UUID represents a UUID string
type UUID string

// NullUUID represents a nullable UUID
type NullUUID struct {
	UUID  UUID
	Valid bool
}

// Scan implements the sql.Scanner interface
func (nu *NullUUID) Scan(value interface{}) error {
	if value == nil {
		nu.UUID, nu.Valid = "", false
		return nil
	}
	if s, ok := value.(string); ok {
		nu.UUID = UUID(s)
		nu.Valid = true
		return nil
	}
	return fmt.Errorf("cannot scan %T into NullUUID", value)
}

// Value implements the driver.Valuer interface
func (nu NullUUID) Value() (driver.Value, error) {
	if !nu.Valid {
		return nil, nil
	}
	return string(nu.UUID), nil
}

// JSONB represents PostgreSQL JSONB data
type JSONB json.RawMessage

// Scan implements the sql.Scanner interface
func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	if b, ok := value.([]byte); ok {
		*j = json.RawMessage(b)
		return nil
	}
	return fmt.Errorf("cannot scan %T into JSONB", value)
}

// Value implements the driver.Valuer interface
func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return []byte(j), nil
}

// Common enums and constants
type PlayerType string
type GamePhase string
type ConnectionStatus string
type Suit string
type Rank int

const (
	PlayerTypeHuman PlayerType = "human"
	PlayerTypeBot   PlayerType = "bot"
)

const (
	GamePhaseSetup      GamePhase = "setup"
	GamePhaseBidding    GamePhase = "bidding"
	GamePhasePlaying    GamePhase = "playing"
	GamePhaseSummary    GamePhase = "summary"
	GamePhaseSummaryDone GamePhase = "game-summary"
	GamePhaseDone       GamePhase = "done"
)

const (
	ConnectionStatusConnected    ConnectionStatus = "connected"
	ConnectionStatusDisconnected ConnectionStatus = "disconnected"
	ConnectionStatusReconnecting ConnectionStatus = "reconnecting"
	ConnectionStatusTimeout     ConnectionStatus = "timeout"
)

const (
	SuitClubs    Suit = "clubs"
	SuitDiamonds Suit = "diamonds"
	SuitHearts   Suit = "hearts"
	SuitSpades   Suit = "spades"
)

const (
	RankTwo   Rank = 2
	RankThree Rank = 3
	RankFour  Rank = 4
	RankFive  Rank = 5
	RankSix   Rank = 6
	RankSeven Rank = 7
	RankEight Rank = 8
	RankNine  Rank = 9
	RankTen   Rank = 10
	RankJack  Rank = 11
	RankQueen Rank = 12
	RankKing  Rank = 13
	RankAce   Rank = 14
)

// Card represents a playing card
type Card struct {
	Suit Suit `json:"suit" db:"suit" validate:"required,oneof=clubs diamonds hearts spades"`
	Rank Rank `json:"rank" db:"rank" validate:"required,min=2,max=14"`
}

// String returns a string representation of the card
func (c Card) String() string {
	return fmt.Sprintf("%s:%d", c.Suit, c.Rank)
}

// RoundState represents the state of a game round
type RoundState string

const (
	RoundStateLocked   RoundState = "locked"
	RoundStateBidding  RoundState = "bidding"
	RoundStatePlaying  RoundState = "playing"
	RoundStateComplete RoundState = "complete"
	RoundStateScored   RoundState = "scored"
)

// ModerationType represents different moderation approaches for handling timeouts
type ModerationType string

const (
	ModerationTypeMajorityVote ModerationType = "majority_vote"
	ModerationTypeAutoSkip     ModerationType = "auto_skip"
	ModerationTypeHostControl  ModerationType = "host_control"
	ModerationTypeGraceful     ModerationType = "graceful"
)

// CommunicationMethod represents the real-time communication method
type CommunicationMethod string

const (
	CommunicationMethodWebSocket CommunicationMethod = "websocket"
	CommunicationMethodSSE       CommunicationMethod = "sse"
	CommunicationMethodPolling   CommunicationMethod = "polling"
)

// ErrorSeverity represents the severity level of errors
type ErrorSeverity string

const (
	ErrorSeverityLow      ErrorSeverity = "low"
	ErrorSeverityMedium   ErrorSeverity = "medium"
	ErrorSeverityHigh     ErrorSeverity = "high"
	ErrorSeverityCritical ErrorSeverity = "critical"
)