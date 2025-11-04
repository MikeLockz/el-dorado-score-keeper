package entities

import (
	"encoding/json"
	"fmt"
	"time"
)

// SessionState represents connection and synchronization status for each player in a game
type SessionState struct {
	ID               UUID              `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID              `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID              `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`

	// Connection status
	ConnectionStatus ConnectionStatus  `json:"connectionStatus" db:"connection_status" gorm:"not null;default:'disconnected'"`
	IsSynchronized   bool              `json:"isSynchronized" db:"is_synchronized" gorm:"default:false"`
	SyncProgress     float64           `json:"syncProgress" db:"sync_progress" gorm:"default:0.0"` // 0.0 to 1.0

	// Sequence tracking
	LastReceivedSeq  int64             `json:"lastReceivedSeq" db:"last_received_seq" gorm:"default:0"`
	LastProcessedSeq int64             `json:"lastProcessedSeq" db:"last_processed_seq" gorm:"default:0"`
	AcknowledgedSeq  int64             `json:"acknowledgedSeq" db:"acknowledged_seq" gorm:"default:0"`
	RequestedSeq     int64             `json:"requestedSeq" db:"requested_seq" gorm:"default:0"`

	// State information
	CurrentTurnID    string            `json:"currentTurnId" db:"current_turn_id" gorm:"size:255"`
	IsActivePlayer   bool              `json:"isActivePlayer" db:"is_active_player" gorm:"default:false"`
	IsSpectator      bool              `json:"isSpectator" db:"is_spectator" gorm:"default:false"`

	// Reconnection state
	ReconnectionSessionID *UUID        `json:"reconnectionSessionId" db:"reconnection_session_id" gorm:"type:uuid;index"`
	DisconnectReason  *string           `json:"disconnectReason" db:"disconnect_reason" gorm:"size:255"`
	DisconnectedAt    *time.Time        `json:"disconnectedAt" db:"disconnected_at" gorm:"index"`
	GracePeriodUntil *time.Time        `json:"gracePeriodUntil" db:"grace_period_until" gorm:"index"`
	MaxReconnectAttempts int           `json:"maxReconnectAttempts" db:"max_reconnect_attempts" gorm:"default:5"`
	ReconnectAttempts   int           `json:"reconnectAttempts" db:"reconnect_attempts" gorm:"default:0"`

	// Turn management
	TurnTimerStarted  *time.Time        `json:"turnTimerStarted" db:"turn_timer_started" gorm:"index"`
	TurnTimerEnds     *time.Time        `json:"turnTimerEnds" db:"turn_timer_ends" gorm:"index"`
	TurnTimeoutCount  int               `json:"turnTimeoutCount" db:"turn_timeout_count" gorm:"default:0"`
	IsTurnActive      bool              `json:"isTurnActive" db:"is_turn_active" gorm:"default:false"`

	// Quality metrics
	ConnectionQuality float64           `json:"connectionQuality" db:"connection_quality" gorm:"default:1.0"`
	LatencyAverage    float64           `json:"latencyAverage" db:"latency_average" gorm:"default:0.0"` // milliseconds
	PacketLossRate    float64           `json:"packetLossRate" db:"packet_loss_rate" gorm:"default:0.0"` // percentage

	// Client capabilities
	SupportedFeatures JSONB             `json:"supportedFeatures" db:"-" gorm:"-"` // Array of supported features
	SupportedFeaturesDB JSONB           `json:"-" db:"supported_features" gorm:"type:jsonb"`
	ClientVersion     string            `json:"clientVersion" db:"client_version" gorm:"size:50"`
	Platform          string            `json:"platform" db:"platform" gorm:"size:100"`

	// Timestamps
	CreatedAt         time.Time         `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt         time.Time         `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastSyncAt        *time.Time        `json:"lastSyncAt" db:"last_sync_at" gorm:"index"`
	LastActivityAt    time.Time         `json:"lastActivityAt" db:"last_activity_at" gorm:"autoUpdateTime"`

	// Associations
	GameSession       GameSession       `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player            PlayerProfile     `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
	ReconnectionSession *ReconnectionSession `json:"reconnectionSession,omitempty" gorm:"foreignKey:ReconnectionSessionID"`
}

// TableName returns the table name for SessionState
func (SessionState) TableName() string {
	return "session_states"
}

// BeforeSave handles the JSON serialization of array fields
func (ss *SessionState) BeforeSave() error {
	if len(ss.SupportedFeatures) > 0 {
		data, err := json.Marshal(ss.SupportedFeatures)
		if err != nil {
			return fmt.Errorf("failed to marshal supported features: %w", err)
		}
		ss.SupportedFeaturesDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (ss *SessionState) AfterFind() error {
	if len(ss.SupportedFeaturesDB) > 0 {
		err := json.Unmarshal(ss.SupportedFeaturesDB, &ss.SupportedFeatures)
		if err != nil {
			return fmt.Errorf("failed to unmarshal supported features: %w", err)
		}
	}
	return nil
}

// Validate validates the session state
func (ss *SessionState) Validate() error {
	if ss.LastReceivedSeq < 0 {
		return fmt.Errorf("last received sequence cannot be negative")
	}
	if ss.LastProcessedSeq < 0 {
		return fmt.Errorf("last processed sequence cannot be negative")
	}
	if ss.AcknowledgedSeq < 0 {
		return fmt.Errorf("acknowledged sequence cannot be negative")
	}
	if ss.SyncProgress < 0.0 || ss.SyncProgress > 1.0 {
		return fmt.Errorf("sync progress must be between 0.0 and 1.0")
	}
	if ss.ConnectionQuality < 0.0 || ss.ConnectionQuality > 1.0 {
		return fmt.Errorf("connection quality must be between 0.0 and 1.0")
	}
	if ss.PacketLossRate < 0.0 || ss.PacketLossRate > 100.0 {
		return fmt.Errorf("packet loss rate must be between 0.0 and 100.0")
	}
	return nil
}

// IsConnected returns whether the player is currently connected
func (ss *SessionState) IsConnected() bool {
	return ss.ConnectionStatus == ConnectionStatusConnected
}

// IsDisconnected returns whether the player is currently disconnected
func (ss *SessionState) IsDisconnected() bool {
	return ss.ConnectionStatus == ConnectionStatusDisconnected
}

// IsInGracePeriod returns whether the player is currently in a grace period for reconnection
func (ss *SessionState) IsInGracePeriod() bool {
	if ss.GracePeriodUntil == nil {
		return false
	}
	return time.Now().Before(*ss.GracePeriodUntil)
}

// CanReconnect returns whether the player can attempt to reconnect
func (ss *SessionState) CanReconnect() bool {
	if !ss.IsDisconnected() {
		return false
	}
	if ss.ReconnectAttempts >= ss.MaxReconnectAttempts {
		return false
	}
	if ss.GracePeriodUntil != nil && time.Now().After(*ss.GracePeriodUntil) {
		return false
	}
	return true
}

// UpdateSequence updates sequence tracking information
func (ss *SessionState) UpdateSequence(received, processed, acknowledged int64) {
	ss.LastReceivedSeq = received
	ss.LastProcessedSeq = processed
	ss.AcknowledgedSeq = acknowledged
	ss.RecordActivity()
}

// StartReconnection starts the reconnection process
func (ss *SessionState) StartReconnection(reason string, gracePeriod time.Duration) {
	ss.ConnectionStatus = ConnectionStatusReconnecting
	ss.DisconnectReason = &reason
	now := time.Now()
	ss.DisconnectedAt = &now
	graceEnd := now.Add(gracePeriod)
	ss.GracePeriodUntil = &graceEnd
	ss.ReconnectAttempts = 0
}

// RecordReconnectionAttempt records a reconnection attempt
func (ss *SessionState) RecordReconnectionAttempt() {
	ss.ReconnectAttempts++
	ss.RecordActivity()
}

// CompleteReconnection marks the reconnection as successful
func (ss *SessionState) CompleteReconnection() {
	ss.ConnectionStatus = ConnectionStatusConnected
	ss.IsSynchronized = true
	ss.SyncProgress = 1.0
	ss.DisconnectedAt = nil
	ss.GracePeriodUntil = nil
	ss.ReconnectAttempts = 0
	now := time.Now()
	ss.LastSyncAt = &now
	ss.RecordActivity()
}

// RecordActivity updates the last activity timestamp
func (ss *SessionState) RecordActivity() {
	ss.LastActivityAt = time.Now()
}

// StartTurnTimer starts the turn timer for this player
func (ss *SessionState) StartTurnTimer(timeout time.Duration) {
	now := time.Now()
	ss.TurnTimerStarted = &now
	endTime := now.Add(timeout)
	ss.TurnTimerEnds = &endTime
	ss.IsTurnActive = true
}

// StopTurnTimer stops the turn timer
func (ss *SessionState) StopTurnTimer() {
	ss.TurnTimerStarted = nil
	ss.TurnTimerEnds = nil
	ss.IsTurnActive = false
}

// IsTurnTimedOut returns whether the turn has timed out
func (ss *SessionState) IsTurnTimedOut() bool {
	if !ss.IsTurnActive || ss.TurnTimerEnds == nil {
		return false
	}
	return time.Now().After(*ss.TurnTimerEnds)
}

// HasFeature checks if the client supports a specific feature
func (ss *SessionState) HasFeature(feature string) bool {
	if len(ss.SupportedFeatures) == 0 {
		return false
	}

	var features []string
	if err := json.Unmarshal(ss.SupportedFeaturesDB, &features); err != nil {
		return false
	}

	for _, f := range features {
		if f == feature {
			return true
		}
	}
	return false
}

// EventReceiptTracking represents server-side record of which events each client has successfully received and processed
type EventReceiptTracking struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	EventSequence    int64     `json:"eventSequence" db:"event_sequence" gorm:"not null;index"`

	// Receipt details
	EventID          UUID      `json:"eventId" db:"event_id" gorm:"not null;index;type:uuid"`
	EventType        string    `json:"eventType" db:"event_type" gorm:"not null;size:100"`
	TurnID           string    `json:"turnId" db:"turn_id" gorm:"not null;size:255;index"`

	// Tracking information
	Status           string    `json:"status" db:"status" gorm:"not null;default:'pending';size:50"` // pending, sent, received, processed, failed
	SentAt           *time.Time `json:"sentAt" db:"sent_at" gorm:"index"`
	ReceivedAt       *time.Time `json:"receivedAt" db:"received_at" gorm:"index"`
	ProcessedAt      *time.Time `json:"processedAt" db:"processed_at" gorm:"index"`
	FailedAt         *time.Time `json:"failedAt" db:"failed_at" gorm:"index"`

	// Quality metrics
	DeliveryLatency  int64     `json:"deliveryLatency" db:"delivery_latency" gorm:"default:0"` // milliseconds
	ProcessingLatency int64     `json:"processingLatency" db:"processing_latency" gorm:"default:0"` // milliseconds
	RetryCount       int       `json:"retryCount" db:"retry_count" gorm:"default:0"`
	MaxRetries       int       `json:"maxRetries" db:"max_retries" gorm:"default:3"`

	// Error information
	ErrorCode        *string   `json:"errorCode" db:"error_code" gorm:"size:50"`
	ErrorMessage     *string   `json:"errorMessage" db:"error_message" gorm:"size:500"`

	// Event metadata
	EventSize        int64     `json:"eventSize" db:"event_size" gorm:"default:0"` // bytes
	Priority         int       `json:"priority" db:"priority" gorm:"default:0"` // Higher priority = faster delivery

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	ExpiresAt        *time.Time `json:"expiresAt" db:"expires_at" gorm:"index"` // When this tracking record expires

	// Associations
	GameSession      GameSession   `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player           PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for EventReceiptTracking
func (EventReceiptTracking) TableName() string {
	return "event_receipt_tracking"
}

// Validate validates the event receipt tracking
func (ert *EventReceiptTracking) Validate() error {
	if ert.EventSequence < 0 {
		return fmt.Errorf("event sequence cannot be negative")
	}
	if ert.EventType == "" {
		return fmt.Errorf("event type is required")
	}
	if ert.TurnID == "" {
		return fmt.Errorf("turn ID is required")
	}
	if ert.RetryCount < 0 {
		return fmt.Errorf("retry count cannot be negative")
	}
	if ert.MaxRetries < 0 {
		return fmt.Errorf("max retries cannot be negative")
	}
	return nil
}

// IsPending returns whether the event receipt is still pending
func (ert *EventReceiptTracking) IsPending() bool {
	return ert.Status == "pending" || ert.Status == "sent"
}

// IsCompleted returns whether the event receipt has been completed (successfully or not)
func (ert *EventReceiptTracking) IsCompleted() bool {
	return ert.Status == "processed" || ert.Status == "failed"
}

// IsSuccessful returns whether the event receipt was successful
func (ert *EventReceiptTracking) IsSuccessful() bool {
	return ert.Status == "processed"
}

// CanRetry returns whether the event receipt can be retried
func (ert *EventReceiptTracking) CanRetry() bool {
	return ert.Status == "failed" && ert.RetryCount < ert.MaxRetries
}

// IsExpired returns whether the tracking record has expired
func (ert *EventReceiptTracking) IsExpired() bool {
	if ert.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*ert.ExpiresAt)
}

// MarkSent marks the event as sent
func (ert *EventReceiptTracking) MarkSent() {
	now := time.Now()
	ert.Status = "sent"
	ert.SentAt = &now
	ert.UpdatedAt = now
}

// MarkReceived marks the event as received
func (ert *EventReceiptTracking) MarkReceived() {
	now := time.Now()
	ert.Status = "received"
	ert.ReceivedAt = &now

	// Calculate delivery latency
	if ert.SentAt != nil {
		ert.DeliveryLatency = now.Sub(*ert.SentAt).Milliseconds()
	}

	ert.UpdatedAt = now
}

// MarkProcessed marks the event as processed
func (ert *EventReceiptTracking) MarkProcessed() {
	now := time.Now()
	ert.Status = "processed"
	ert.ProcessedAt = &now

	// Calculate processing latency
	if ert.ReceivedAt != nil {
		ert.ProcessingLatency = now.Sub(*ert.ReceivedAt).Milliseconds()
	}

	ert.UpdatedAt = now
}

// MarkFailed marks the event as failed
func (ert *EventReceiptTracking) MarkFailed(errorCode, errorMessage string) {
	now := time.Now()
	ert.Status = "failed"
	ert.FailedAt = &now
	ert.ErrorCode = &errorCode
	ert.ErrorMessage = &errorMessage
	ert.UpdatedAt = now
}

// RecordRetry records a retry attempt
func (ert *EventReceiptTracking) RecordRetry() {
	ert.RetryCount++
	ert.Status = "pending"
	ert.UpdatedAt = time.Now()
}

// ReconnectionSession represents temporary preservation of player state and turn position during disconnection periods
type ReconnectionSession struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	SessionToken     string    `json:"sessionToken" db:"session_token" gorm:"not null;size:255;uniqueIndex"`

	// Session state
	IsActive         bool      `json:"isActive" db:"is_active" gorm:"default:true"`
	ExpiresAt        time.Time `json:"expiresAt" db:"expires_at" gorm:"not null;index"`
	LastActivityAt   time.Time `json:"lastActivityAt" db:"last_activity_at" gorm:"autoUpdateTime"`

	// Player state at disconnection
	PlayerState      JSONB     `json:"playerState" db:"player_state" gorm:"type:jsonb;not null"`
	GameStateHash    string    `json:"gameStateHash" db:"game_state_hash" gorm:"not null;size:128"`
	LastSequence     int64     `json:"lastSequence" db:"last_sequence" gorm:"not null"`
	CurrentTurnID    string    `json:"currentTurnId" db:"current_turn_id" gorm:"size:255"`
	PositionInTurn   int       `json:"positionInTurn" db:"position_in_turn" gorm:"default:0"`

	// Synchronization data
	MissedEvents     JSONB     `json:"missedEvents" db:"-" gorm:"-"` // Array of missed event sequences
	MissedEventsDB   JSONB     `json:"-" db:"missed_events" gorm:"type:jsonb"`
	SnapshotRequired bool      `json:"snapshotRequired" db:"snapshot_required" gorm:"default:false"`
	SnapshotData     JSONB     `json:"snapshotData" db:"snapshot_data" gorm:"type:jsonb"`

	// Reconnection attempts
	MaxAttempts      int       `json:"maxAttempts" db:"max_attempts" gorm:"default:5"`
	AttemptCount     int       `json:"attemptCount" db:"attempt_count" gorm:"default:0"`
	LastAttemptAt    *time.Time `json:"lastAttemptAt" db:"last_attempt_at" gorm:"index"`
	SuccessfulReconnectionAt *time.Time `json:"successfulReconnectionAt" db:"successful_reconnection_at" gorm:"index"`

	// Quality of service
	Priority         int       `json:"priority" db:"priority" gorm:"default:0"` // Higher priority gets better service
	BandwidthLimit   int64     `json:"bandwidthLimit" db:"bandwidth_limit" gorm:"default:0"` // bytes per second, 0 = unlimited
	CompressionEnabled bool    `json:"compressionEnabled" db:"compression_enabled" gorm:"default:true"`

	// Security and validation
	ClientFingerprint string    `json:"clientFingerprint" db:"client_fingerprint" gorm:"size:255;index"`
	IPAddress         string    `json:"ipAddress" db:"ip_address" gorm:"size:45"` // IPv6 compatible
	UserAgent         string    `json:"userAgent" db:"user_agent" gorm:"size:500"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	ArchivedAt       *time.Time `json:"archivedAt" db:"archived_at" gorm:"index"`

	// Associations
	GameSession      GameSession   `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player           PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
	SessionStates    []SessionState `json:"sessionStates,omitempty" gorm:"foreignKey:ReconnectionSessionID"`
}

// TableName returns the table name for ReconnectionSession
func (ReconnectionSession) TableName() string {
	return "reconnection_sessions"
}

// BeforeSave handles the JSON serialization of array fields
func (rs *ReconnectionSession) BeforeSave() error {
	if len(rs.MissedEvents) > 0 {
		data, err := json.Marshal(rs.MissedEvents)
		if err != nil {
			return fmt.Errorf("failed to marshal missed events: %w", err)
		}
		rs.MissedEventsDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (rs *ReconnectionSession) AfterFind() error {
	if len(rs.MissedEventsDB) > 0 {
		err := json.Unmarshal(rs.MissedEventsDB, &rs.MissedEvents)
		if err != nil {
			return fmt.Errorf("failed to unmarshal missed events: %w", err)
		}
	}
	return nil
}

// Validate validates the reconnection session
func (rs *ReconnectionSession) Validate() error {
	if rs.SessionToken == "" {
		return fmt.Errorf("session token is required")
	}
	if rs.ExpiresAt.IsZero() {
		return fmt.Errorf("expiration time is required")
	}
	if len(rs.PlayerState) == 0 {
		return fmt.Errorf("player state is required")
	}
	if rs.GameStateHash == "" {
		return fmt.Errorf("game state hash is required")
	}
	if rs.LastSequence < 0 {
		return fmt.Errorf("last sequence cannot be negative")
	}
	if rs.MaxAttempts < 1 {
		return fmt.Errorf("max attempts must be at least 1")
	}
	if rs.AttemptCount < 0 {
		return fmt.Errorf("attempt count cannot be negative")
	}
	return nil
}

// IsExpired returns whether the reconnection session has expired
func (rs *ReconnectionSession) IsExpired() bool {
	return time.Now().After(rs.ExpiresAt)
}

// IsActiveAndNotExpired returns whether the session is both active and not expired
func (rs *ReconnectionSession) IsActiveAndNotExpired() bool {
	return rs.IsActive && !rs.IsExpired()
}

// CanAttemptReconnection returns whether a reconnection attempt can be made
func (rs *ReconnectionSession) CanAttemptReconnection() bool {
	return rs.IsActiveAndNotExpired() && rs.AttemptCount < rs.MaxAttempts
}

// RecordAttempt records a reconnection attempt
func (rs *ReconnectionSession) RecordAttempt() {
	now := time.Now()
	rs.AttemptCount++
	rs.LastAttemptAt = &now
	rs.LastActivityAt = now
}

// MarkSuccessful marks the reconnection as successful
func (rs *ReconnectionSession) MarkSuccessful() {
	now := time.Now()
	rs.SuccessfulReconnectionAt = &now
	rs.IsActive = false
	rs.LastActivityAt = now
}

// AddMissedEvent adds a missed event sequence to the list
func (rs *ReconnectionSession) AddMissedEvent(sequence int64) {
	if rs.MissedEvents == nil {
		rs.MissedEvents = make([]int64, 0)
	}
	rs.MissedEvents = append(rs.MissedEvents, sequence)
}

// GetMissedEvents returns the list of missed event sequences
func (rs *ReconnectionSession) GetMissedEvents() []int64 {
	if len(rs.MissedEventsDB) == 0 {
		return make([]int64, 0)
	}

	var events []int64
	if err := json.Unmarshal(rs.MissedEventsDB, &events); err != nil {
		return make([]int64, 0)
	}
	return events
}

// ClearMissedEvents clears the missed events list
func (rs *ReconnectionSession) ClearMissedEvents() {
	rs.MissedEvents = make([]int64, 0)
	rs.MissedEventsDB = JSONB("[]")
}

// HasMissedEvents returns whether there are any missed events
func (rs *ReconnectionSession) HasMissedEvents() bool {
	return len(rs.GetMissedEvents()) > 0
}

// Extend extends the session expiration time
func (rs *ReconnectionSession) Extend(additionalDuration time.Duration) {
	rs.ExpiresAt = rs.ExpiresAt.Add(additionalDuration)
	rs.LastActivityAt = time.Now()
}

// Archive archives the session
func (rs *ReconnectionSession) Archive() {
	rs.IsActive = false
	now := time.Now()
	rs.ArchivedAt = &now
}