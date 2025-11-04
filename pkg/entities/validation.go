package entities

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// ValidationResult represents the result of validation
type ValidationResult struct {
	IsValid bool              `json:"isValid"`
	Errors  []ValidationError `json:"errors"`
}

// ValidationError represents a single validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
	Code    string `json:"code"`
}

// AddError adds a validation error
func (vr *ValidationResult) AddError(field, message, code string) {
	vr.IsValid = false
	vr.Errors = append(vr.Errors, ValidationError{
		Field:   field,
		Message: message,
		Code:    code,
	})
}

// ValidationErrorCodes represents validation error codes
const (
	ErrorCodeRequired     = "REQUIRED"
	ErrorCodeInvalid      = "INVALID"
	ErrorCodeMinLength    = "MIN_LENGTH"
	ErrorCodeMaxLength    = "MAX_LENGTH"
	ErrorCodeMinValue     = "MIN_VALUE"
	ErrorCodeMaxValue     = "MAX_VALUE"
	ErrorCodeInvalidEmail = "INVALID_EMAIL"
	ErrorCodeInvalidUUID  = "INVALID_UUID"
	ErrorCodeInvalidURL   = "INVALID_URL"
	ErrorCodeOutOfRange   = "OUT_OF_RANGE"
	ErrorCodeDuplicate    = "DUPLICATE"
	ErrorCodeExpired      = "EXPIRED"
	ErrorCodeFuture       = "FUTURE_DATE"
)

// Validator interface for entities that can be validated
type Validator interface {
	Validate() error
}

// ValidateUUID validates a UUID string
func ValidateUUID(uuid string) error {
	if uuid == "" {
		return fmt.Errorf("UUID is required")
	}

	// Basic UUID pattern validation (RFC 4122 format)
	uuidPattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	if !uuidPattern.MatchString(strings.ToLower(uuid)) {
		return fmt.Errorf("invalid UUID format")
	}

	return nil
}

// ValidateEmail validates an email address
func ValidateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
	}

	emailPattern := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailPattern.MatchString(email) {
		return fmt.Errorf("invalid email format")
	}

	if len(email) > 255 {
		return fmt.Errorf("email address too long (max 255 characters)")
	}

	return nil
}

// ValidateURL validates a URL
func ValidateURL(url string) error {
	if url == "" {
		return fmt.Errorf("URL is required")
	}

	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return fmt.Errorf("URL must start with http:// or https://")
	}

	if len(url) > 2048 {
		return fmt.Errorf("URL too long (max 2048 characters)")
	}

	return nil
}

// ValidateStringLength validates string length constraints
func ValidateStringLength(value string, fieldName string, minLength, maxLength int) error {
	if value == "" {
		return fmt.Errorf("%s is required", fieldName)
	}

	length := len(value)
	if length < minLength {
		return fmt.Errorf("%s must be at least %d characters", fieldName, minLength)
	}

	if maxLength > 0 && length > maxLength {
		return fmt.Errorf("%s must be at most %d characters", fieldName, maxLength)
	}

	return nil
}

// ValidateOptionalStringLength validates optional string length constraints
func ValidateOptionalStringLength(value string, fieldName string, minLength, maxLength int) error {
	if value == "" {
		return nil
	}

	return ValidateStringLength(value, fieldName, minLength, maxLength)
}

// ValidateIntRange validates integer range constraints
func ValidateIntRange(value int, fieldName string, min, max int) error {
	if value < min {
		return fmt.Errorf("%s must be at least %d", fieldName, min)
	}

	if max > min && value > max {
		return fmt.Errorf("%s must be at most %d", fieldName, max)
	}

	return nil
}

// ValidateInt64Range validates int64 range constraints
func ValidateInt64Range(value int64, fieldName string, min, max int64) error {
	if value < min {
		return fmt.Errorf("%s must be at least %d", fieldName, min)
	}

	if max > min && value > max {
		return fmt.Errorf("%s must be at most %d", fieldName, max)
	}

	return nil
}

// ValidateFloatRange validates float range constraints
func ValidateFloatRange(value float64, fieldName string, min, max float64) error {
	if value < min {
		return fmt.Errorf("%s must be at least %.2f", fieldName, min)
	}

	if max > min && value > max {
		return fmt.Errorf("%s must be at most %.2f", fieldName, max)
	}

	return nil
}

// ValidatePercentage validates percentage values (0.0 to 100.0)
func ValidatePercentage(value float64, fieldName string) error {
	return ValidateFloatRange(value, fieldName, 0.0, 100.0)
}

// ValidateQualityScore validates quality score values (0.0 to 1.0)
func ValidateQualityScore(value float64, fieldName string) error {
	return ValidateFloatRange(value, fieldName, 0.0, 1.0)
}

// ValidateTimestamp validates timestamp constraints
func ValidateTimestamp(timestamp time.Time, fieldName string, allowPast, allowFuture bool) error {
	if timestamp.IsZero() {
		return fmt.Errorf("%s cannot be zero", fieldName)
	}

	now := time.Now()

	if !allowPast && timestamp.Before(now) {
		return fmt.Errorf("%s cannot be in the past", fieldName)
	}

	if !allowFuture && timestamp.After(now) {
		return fmt.Errorf("%s cannot be in the future", fieldName)
	}

	return nil
}

// ValidateDuration validates duration constraints
func ValidateDuration(duration time.Duration, fieldName string, min, max time.Duration) error {
	if duration < 0 {
		return fmt.Errorf("%s cannot be negative", fieldName)
	}

	if min > 0 && duration < min {
		return fmt.Errorf("%s must be at least %v", fieldName, min)
	}

	if max > 0 && duration > max {
		return fmt.Errorf("%s must be at most %v", fieldName, max)
	}

	return nil
}

// ValidateEnum validates enum values
func ValidateEnum(value string, fieldName string, validValues []string) error {
	if value == "" {
		return fmt.Errorf("%s is required", fieldName)
	}

	for _, valid := range validValues {
		if value == valid {
			return nil
		}
	}

	return fmt.Errorf("%s must be one of: %s", fieldName, strings.Join(validValues, ", "))
}

// ValidateEnumInt validates enum integer values
func ValidateEnumInt(value int, fieldName string, validValues []int) error {
	for _, valid := range validValues {
		if value == valid {
			return nil
		}
	}

	return fmt.Errorf("%s is not a valid value", fieldName)
}

// ValidateArray validates array constraints
func ValidateArray[T any](array []T, fieldName string, minLength, maxLength int) error {
	length := len(array)

	if minLength > 0 && length < minLength {
		return fmt.Errorf("%s must have at least %d items", fieldName, minLength)
	}

	if maxLength > 0 && length > maxLength {
		return fmt.Errorf("%s must have at most %d items", fieldName, maxLength)
	}

	return nil
}

// ValidateUniqueItems validates that array items are unique
func ValidateUniqueItems[T comparable](array []T, fieldName string) error {
	seen := make(map[T]bool)
	for _, item := range array {
		if seen[item] {
			return fmt.Errorf("%s contains duplicate items", fieldName)
		}
		seen[item] = true
	}
	return nil
}

// ValidatePlayerType validates player type enum
func ValidatePlayerType(playerType PlayerType) error {
	return ValidateEnum(string(playerType), "player type", []string{
		string(PlayerTypeHuman),
		string(PlayerTypeBot),
	})
}

// ValidateGamePhase validates game phase enum
func ValidateGamePhase(phase GamePhase) error {
	return ValidateEnum(string(phase), "game phase", []string{
		string(GamePhaseSetup),
		string(GamePhaseBidding),
		string(GamePhasePlaying),
		string(GamePhaseSummary),
		string(GamePhaseSummaryDone),
		string(GamePhaseDone),
	})
}

// ValidateConnectionStatus validates connection status enum
func ValidateConnectionStatus(status ConnectionStatus) error {
	return ValidateEnum(string(status), "connection status", []string{
		string(ConnectionStatusConnected),
		string(ConnectionStatusDisconnected),
		string(ConnectionStatusReconnecting),
		string(ConnectionStatusTimeout),
	})
}

// ValidateSuit validates suit enum
func ValidateSuit(suit Suit) error {
	return ValidateEnum(string(suit), "suit", []string{
		string(SuitClubs),
		string(SuitDiamonds),
		string(SuitHearts),
		string(SuitSpades),
	})
}

// ValidateRank validates rank enum
func ValidateRank(rank Rank) error {
	return ValidateIntRange(int(rank), "rank", 2, 14)
}

// ValidateRoundState validates round state enum
func ValidateRoundState(state RoundState) error {
	return ValidateEnum(string(state), "round state", []string{
		string(RoundStateLocked),
		string(RoundStateBidding),
		string(RoundStatePlaying),
		string(RoundStateComplete),
		string(RoundStateScored),
	})
}

// ValidateModerationType validates moderation type enum
func ValidateModerationType(moderationType ModerationType) error {
	return ValidateEnum(string(moderationType), "moderation type", []string{
		string(ModerationTypeMajorityVote),
		string(ModerationTypeAutoSkip),
		string(ModerationTypeHostControl),
		string(ModerationTypeGraceful),
	})
}

// ValidateCommunicationMethod validates communication method enum
func ValidateCommunicationMethod(method CommunicationMethod) error {
	return ValidateEnum(string(method), "communication method", []string{
		string(CommunicationMethodWebSocket),
		string(CommunicationMethodSSE),
		string(CommunicationMethodPolling),
	})
}

// ValidateErrorSeverity validates error severity enum
func ValidateErrorSeverity(severity ErrorSeverity) error {
	return ValidateEnum(string(severity), "error severity", []string{
		string(ErrorSeverityLow),
		string(ErrorSeverityMedium),
		string(ErrorSeverityHigh),
		string(ErrorSeverityCritical),
	})
}

// ValidateCard validates a card
func ValidateCard(card Card) error {
	if err := ValidateSuit(card.Suit); err != nil {
		return fmt.Errorf("card suit: %w", err)
	}

	if err := ValidateRank(card.Rank); err != nil {
		return fmt.Errorf("card rank: %w", err)
	}

	return nil
}

// ValidateGameSessionConstraints validates game session specific constraints
func ValidateGameSessionConstraints(gs *GameSession) error {
	// Room ID validation
	if err := ValidateStringLength(gs.RoomID, "room ID", 1, 64); err != nil {
		return err
	}

	// Name validation
	if err := ValidateStringLength(gs.Name, "name", 1, 255); err != nil {
		return err
	}

	// Player count validation
	if err := ValidateIntRange(gs.MaxPlayers, "max players", 2, 10); err != nil {
		return err
	}

	// Current round validation
	if err := ValidateIntRange(gs.CurrentRound, "current round", 1, 20); err != nil {
		return err
	}

	// Turn timeout validation
	if err := ValidateIntRange(gs.TurnTimeoutSeconds, "turn timeout", 10, 300); err != nil {
		return err
	}

	// Player order validation
	if err := ValidateArray(gs.PlayerOrder, "player order", 0, 10); err != nil {
		return err
	}

	if err := ValidateUniqueItems(gs.PlayerOrder, "player order"); err != nil {
		return err
	}

	// Validate moderation type
	if err := ValidateModerationType(gs.ModerationType); err != nil {
		return err
	}

	// Validate game phase
	if err := ValidateGamePhase(gs.Phase); err != nil {
		return err
	}

	return nil
}

// ValidatePlayerProfileConstraints validates player profile specific constraints
func ValidatePlayerProfileConstraints(pp *PlayerProfile) error {
	// Display name validation
	if err := ValidateStringLength(pp.DisplayName, "display name", 2, 255); err != nil {
		return err
	}

	// Display name pattern validation (no special characters except spaces, hyphens, underscores)
	namePattern := regexp.MustCompile(`^[a-zA-Z0-9 _-]+$`)
	if !namePattern.MatchString(pp.DisplayName) {
		return fmt.Errorf("display name can only contain letters, numbers, spaces, hyphens, and underscores")
	}

	// Public key validation
	if err := ValidateStringLength(pp.PublicKey, "public key", 100, 10000); err != nil {
		return err
	}

	// Optional avatar URL validation
	if pp.AvatarURL != nil {
		if err := ValidateOptionalStringLength(*pp.AvatarURL, "avatar URL", 1, 500); err != nil {
			return err
		}
	}

	// Rating validation
	if err := ValidateFloatRange(pp.CurrentRating, "current rating", 0, 3000); err != nil {
		return err
	}

	if err := ValidateFloatRange(pp.PeakRating, "peak rating", 0, 3000); err != nil {
		return err
	}

	// Validate player type
	if err := ValidatePlayerType(pp.PlayerType); err != nil {
		return err
	}

	// Statistics validation
	if pp.GamesPlayed < 0 || pp.GamesWon < 0 {
		return fmt.Errorf("game statistics cannot be negative")
	}

	if pp.GamesWon > pp.GamesPlayed {
		return fmt.Errorf("games won cannot exceed games played")
	}

	// Validate win rate calculation consistency
	expectedWinRate := 0.0
	if pp.GamesPlayed > 0 {
		expectedWinRate = float64(pp.GamesWon) / float64(pp.GamesPlayed) * 100.0
	}

	if abs(pp.WinRate-expectedWinRate) > 0.01 {
		return fmt.Errorf("win rate is inconsistent with games played/won statistics")
	}

	return nil
}

// ValidatePlayerActionConstraints validates player action specific constraints
func ValidatePlayerActionConstraints(pa *PlayerAction) error {
	// Action type validation
	if err := ValidateStringLength(pa.ActionType, "action type", 1, 100); err != nil {
		return err
	}

	// Turn ID validation
	if err := ValidateStringLength(pa.TurnID, "turn ID", 1, 255); err != nil {
		return err
	}

	// Signature validation
	if err := ValidateStringLength(pa.Signature, "signature", 1, 1024); err != nil {
		return err
	}

	// Sequence validation
	if err := ValidateInt64Range(pa.Sequence, "sequence", 0, 9999999999); err != nil {
		return err
	}

	return nil
}

// ValidateGameStateConstraints validates game state specific constraints
func ValidateGameStateConstraints(gs *GameState) error {
	// State data validation
	if len(gs.StateData) == 0 {
		return fmt.Errorf("state data is required")
	}

	// State hash validation
	if err := ValidateStringLength(gs.StateHash, "state hash", 64, 64); err != nil {
		return err
	}

	// Sequence validation
	if err := ValidateInt64Range(gs.Sequence, "sequence", 0, 9999999999); err != nil {
		return err
	}

	// Round number validation
	if err := ValidateIntRange(gs.RoundNumber, "round number", 1, 20); err != nil {
		return err
	}

	// Validate game phase
	if err := ValidateGamePhase(gs.Phase); err != nil {
		return err
	}

	return nil
}

// ValidateMultiplayerRosterConstraints validates multiplayer roster specific constraints
func ValidateMultiplayerRosterConstraints(mr *MultiplayerRoster) error {
	// Name validation
	if err := ValidateStringLength(mr.Name, "name", 1, 255); err != nil {
		return err
	}

	// Player order validation
	if err := ValidateArray(mr.PlayerOrder, "player order", 2, 10); err != nil {
		return err
	}

	if err := ValidateUniqueItems(mr.PlayerOrder, "player order"); err != nil {
		return err
	}

	// Validate roster type
	validTypes := []string{"multiplayer", "team", "tournament"}
	if err := ValidateEnum(mr.RosterType, "roster type", validTypes); err != nil {
		return err
	}

	// Validate that player names match player order
	if len(mr.PlayerNames) != len(mr.PlayerOrder) {
		return fmt.Errorf("player names count must match player order count")
	}

	// Validate that player types match player order
	if len(mr.PlayerTypes) != len(mr.PlayerOrder) {
		return fmt.Errorf("player types count must match player order count")
	}

	// Validate each player type
	for _, playerType := range mr.PlayerTypes {
		if err := ValidatePlayerType(playerType); err != nil {
			return fmt.Errorf("player type validation failed: %w", err)
		}
	}

	return nil
}

// ValidatePlayerStatisticsConstraints validates player statistics specific constraints
func ValidatePlayerStatisticsConstraints(ps *PlayerStatistics) error {
	// Validate all statistics are non-negative
	if ps.GamesPlayed < 0 || ps.GamesWon < 0 || ps.GamesFinished < 0 {
		return fmt.Errorf("game statistics cannot be negative")
	}

	if ps.TotalRoundsPlayed < 0 || ps.TotalTricksWon < 0 || ps.TotalBidsMade < 0 {
		return fmt.Errorf("game performance statistics cannot be negative")
	}

	// Validate logical consistency
	if ps.GamesWon > ps.GamesPlayed {
		return fmt.Errorf("games won cannot exceed games played")
	}

	if ps.GamesFinished > ps.GamesPlayed {
		return fmt.Errorf("games finished cannot exceed games played")
	}

	// Validate rating range
	if err := ValidateFloatRange(ps.CurrentRating, "current rating", 0, 3000); err != nil {
		return err
	}

	if err := ValidateFloatRange(ps.PeakRating, "peak rating", 0, 3000); err != nil {
		return err
	}

	// Validate percentages
	if err := ValidatePercentage(ps.WinRate, "win rate"); err != nil {
		return err
	}

	if err := ValidatePercentage(ps.FinishRate, "finish rate"); err != nil {
		return err
	}

	if err := ValidatePercentage(ps.BidAccuracy, "bid accuracy"); err != nil {
		return err
	}

	// Validate average game time
	if ps.GamesFinished > 0 && ps.AverageGameMinutes < 1 {
		return fmt.Errorf("average game time must be at least 1 minute for finished games")
	}

	// Validate achievement points
	if ps.AchievementPoints < 0 {
		return fmt.Errorf("achievement points cannot be negative")
	}

	return nil
}

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// ValidateAll performs comprehensive validation on all entity types
func ValidateAll(entity any) error {
	switch e := entity.(type) {
	case *GameSession:
		if err := ValidateGameSessionConstraints(e); err != nil {
			return err
		}
	case *PlayerProfile:
		if err := ValidatePlayerProfileConstraints(e); err != nil {
			return err
		}
	case *PlayerAction:
		if err := ValidatePlayerActionConstraints(e); err != nil {
			return err
		}
	case *GameState:
		if err := ValidateGameStateConstraints(e); err != nil {
			return err
		}
	case *MultiplayerRoster:
		if err := ValidateMultiplayerRosterConstraints(e); err != nil {
			return err
		}
	case *PlayerStatistics:
		if err := ValidatePlayerStatisticsConstraints(e); err != nil {
			return err
		}
	default:
		// Try to use the entity's Validate method if it implements Validator
		if validator, ok := entity.(Validator); ok {
			return validator.Validate()
		}
		return fmt.Errorf("unknown entity type for validation")
	}

	return nil
}