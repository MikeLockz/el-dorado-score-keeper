package entities

import (
	"encoding/json"
	"fmt"
	"time"
)

// RealTimeConnection represents active communication channel using optimal method (WebSocket/SSE/polling)
type RealTimeConnection struct {
	ID               UUID              `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID              `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID              `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	ConnectionID     string            `json:"connectionId" db:"connection_id" gorm:"not null;size:255;uniqueIndex"` // Unique connection identifier

	// Connection details
	CommunicationMethod CommunicationMethod `json:"communicationMethod" db:"communication_method" gorm:"not null;default:'websocket'"`
	Endpoint         string            `json:"endpoint" db:"endpoint" gorm:"not null;size:500"`
	Protocol         string            `json:"protocol" db:"protocol" gorm:"size:50"` // ws, wss, sse, http

	// Status and health
	Status           ConnectionStatus  `json:"status" db:"status" gorm:"not null;default:'disconnected'"`
	IsHealthy        bool              `json:"isHealthy" db:"is_healthy" gorm:"default:true"`
	LatencyMs        int               `json:"latencyMs" db:"latency_ms" gorm:"default:0"` // Last measured latency
	LastPingAt       *time.Time        `json:"lastPingAt" db:"last_ping_at" gorm:"index"`
	LastPongAt       *time.Time        `json:"lastPongAt" db:"last_pong_at" gorm:"index"`
	NextPingAt       time.Time         `json:"nextPingAt" db:"next_ping_at" gorm:"index"`

	// Performance metrics
	MessagesSent     int64             `json:"messagesSent" db:"messages_sent" gorm:"default:0"`
	MessagesReceived int64             `json:"messagesReceived" db:"messages_received" gorm:"default:0"`
	BytesTransmitted int64             `json:"bytesTransmitted" db:"bytes_transmitted" gorm:"default:0"`
	BytesReceived    int64             `json:"bytesReceived" db:"bytes_received" gorm:"default:0"`
	ConnectionDrops  int               `json:"connectionDrops" db:"connection_drops" gorm:"default:0"`
	ReconnectAttempts int              `json:"reconnectAttempts" db:"reconnect_attempts" gorm:"default:0"`

	// Quality of service
	QualityScore     float64           `json:"qualityScore" db:"quality_score" gorm:"default:1.0"` // 0.0 to 1.0
	Priority         int               `json:"priority" db:"priority" gorm:"default:0"` // Higher priority gets better service

	// Fallback chain
	CurrentMethodIndex int             `json:"currentMethodIndex" db:"current_method_index" gorm:"default:0"`
	AvailableMethods   JSONB           `json:"availableMethods" db:"-" gorm:"-"` // Stored as JSONB
	AvailableMethodsDB JSONB           `json:"-" db:"available_methods" gorm:"type:jsonb"`
	AutoFallbackEnabled bool           `json:"autoFallbackEnabled" db:"auto_fallback_enabled" gorm:"default:true"`

	// Client information
	UserAgent        string            `json:"userAgent" db:"user_agent" gorm:"size:500"`
	IPAddress        string            `json:"ipAddress" db:"ip_address" gorm:"size:45"` // IPv6 compatible
	DeviceType       string            `json:"deviceType" db:"device_type" gorm:"size:50"` // desktop, mobile, tablet
	Platform         string            `json:"platform" db:"platform" gorm:"size:100"` // browser, native app

	// Session management
	EstablishedAt    time.Time         `json:"establishedAt" db:"established_at" gorm:"autoCreateTime"`
	LastActivityAt   time.Time         `json:"lastActivityAt" db:"last_activity_at" gorm:"autoUpdateTime"`
	DisconnectedAt   *time.Time        `json:"disconnectedAt" db:"disconnected_at" gorm:"index"`
	TimeoutDuration  int               `json:"timeoutDuration" db:"timeout_duration" gorm:"default:30"` // seconds

	// Timestamps
	CreatedAt        time.Time         `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time         `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`

	// Associations
	GameSession      GameSession       `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player           PlayerProfile     `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
	EventStreams     []EventStream     `json:"eventStreams,omitempty" gorm:"foreignKey:ConnectionID"`
}

// TableName returns the table name for RealTimeConnection
func (RealTimeConnection) TableName() string {
	return "real_time_connections"
}

// BeforeSave handles the JSON serialization of array fields
func (rtc *RealTimeConnection) BeforeSave() error {
	if len(rtc.AvailableMethods) > 0 {
		data, err := json.Marshal(rtc.AvailableMethods)
		if err != nil {
			return fmt.Errorf("failed to marshal available methods: %w", err)
		}
		rtc.AvailableMethodsDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (rtc *RealTimeConnection) AfterFind() error {
	if len(rtc.AvailableMethodsDB) > 0 {
		err := json.Unmarshal(rtc.AvailableMethodsDB, &rtc.AvailableMethods)
		if err != nil {
			return fmt.Errorf("failed to unmarshal available methods: %w", err)
		}
	}
	return nil
}

// Validate validates the real-time connection
func (rtc *RealTimeConnection) Validate() error {
	if rtc.ConnectionID == "" {
		return fmt.Errorf("connection ID is required")
	}
	if rtc.Endpoint == "" {
		return fmt.Errorf("endpoint is required")
	}
	if rtc.TimeoutDuration < 5 || rtc.TimeoutDuration > 300 {
		return fmt.Errorf("timeout duration must be between 5 and 300 seconds")
	}
	if rtc.QualityScore < 0.0 || rtc.QualityScore > 1.0 {
		return fmt.Errorf("quality score must be between 0.0 and 1.0")
	}
	return nil
}

// IsActive returns whether the connection is currently active and healthy
func (rtc *RealTimeConnection) IsActive() bool {
	return rtc.Status == ConnectionStatusConnected && rtc.IsHealthy
}

// IsTimedOut returns whether the connection has timed out
func (rtc *RealTimeConnection) IsTimedOut() bool {
	if rtc.Status != ConnectionStatusConnected {
		return false
	}
	if rtc.LastPongAt == nil {
		return time.Now().After(rtc.NextPingAt.Add(time.Duration(rtc.TimeoutDuration) * time.Second))
	}
	timeoutAt := rtc.LastPongAt.Add(time.Duration(rtc.TimeoutDuration) * time.Second)
	return time.Now().After(timeoutAt)
}

// ShouldFallback returns whether the connection should try to fallback to the next method
func (rtc *RealTimeConnection) ShouldFallback() bool {
	return rtc.AutoFallbackEnabled && !rtc.IsActive() && rtc.CanFallback()
}

// CanFallback returns whether there are available fallback methods
func (rtc *RealTimeConnection) CanFallback() bool {
	var methods []CommunicationMethod
	if err := json.Unmarshal(rtc.AvailableMethodsDB, &methods); err != nil {
		return false
	}
	return rtc.CurrentMethodIndex < len(methods)-1
}

// GetNextMethod returns the next available communication method
func (rtc *RealTimeConnection) GetNextMethod() (CommunicationMethod, error) {
	if !rtc.CanFallback() {
		return "", fmt.Errorf("no fallback methods available")
	}

	var methods []CommunicationMethod
	if err := json.Unmarshal(rtc.AvailableMethodsDB, &methods); err != nil {
		return "", fmt.Errorf("failed to unmarshal available methods: %w", err)
	}

	if rtc.CurrentMethodIndex+1 >= len(methods) {
		return "", fmt.Errorf("no more fallback methods")
	}

	return methods[rtc.CurrentMethodIndex+1], nil
}

// UpdateQuality updates the connection quality score based on metrics
func (rtc *RealTimeConnection) UpdateQuality() {
	// Simple quality calculation based on latency, packet loss, and stability
	latencyScore := 1.0
	if rtc.LatencyMs > 100 {
		latencyScore = 0.7
	}
	if rtc.LatencyMs > 500 {
		latencyScore = 0.3
	}

	// Factor in connection drops
	dropScore := 1.0
	if rtc.ConnectionDrops > 0 {
		totalConnections := rtc.ConnectionDrops + 1
		dropScore = float64(totalConnections-rtc.ConnectionDrops) / float64(totalConnections)
	}

	// Update quality score (weighted average)
	rtc.QualityScore = (latencyScore * 0.6) + (dropScore * 0.4)
}

// RecordActivity updates the last activity timestamp
func (rtc *RealTimeConnection) RecordActivity() {
	rtc.LastActivityAt = time.Now()
}

// RecordMessageSent records that a message was sent
func (rtc *RealTimeConnection) RecordMessageSent(bytes int) {
	rtc.MessagesSent++
	rtc.BytesTransmitted += int64(bytes)
	rtc.RecordActivity()
}

// RecordMessageReceived records that a message was received
func (rtc *RealTimeConnection) RecordMessageReceived(bytes int) {
	rtc.MessagesReceived++
	rtc.BytesReceived += int64(bytes)
	rtc.RecordActivity()
}

// EventStream represents server-side push mechanism for real-time game updates
type EventStream struct {
	ID               UUID              `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	ConnectionID     UUID              `json:"connectionId" db:"connection_id" gorm:"not null;index;type:uuid"`
	GameSessionID    UUID              `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	StreamType       string            `json:"streamType" db:"stream_type" gorm:"not null;size:50"` // game, chat, system, presence

	// Stream configuration
	StreamName       string            `json:"streamName" db:"stream_name" gorm:"not null;size:255"`
	IsActive         bool              `json:"isActive" db:"is_active" gorm:"default:true"`
	IsBuffered       bool              `json:"isBuffered" db:"is_buffered" gorm:"default:false"`
	BufferSize       int               `json:"bufferSize" db:"buffer_size" gorm:"default:1000"` // Max buffered events
	CompressionEnabled bool            `json:"compressionEnabled" db:"compression_enabled" gorm:"default:true"`

	// Event tracking
	LastSequence     int64             `json:"lastSequence" db:"last_sequence" gorm:"default:0"`
	EventsSent       int64             `json:"eventsSent" db:"events_sent" gorm:"default:0"`
	EventsDropped    int64             `json:"eventsDropped" db:"events_dropped" gorm:"default:0"`
	LastEventSentAt  *time.Time        `json:"lastEventSentAt" db:"last_event_sent_at" gorm:"index"`

	// Filtering and subscription
	EventTypes       JSONB             `json:"eventTypes" db:"-" gorm:"-"` // Array of event types to filter
	EventTypesDB     JSONB             `json:"-" db:"event_types" gorm:"type:jsonb"`
	PlayerFilter     JSONB             `json:"playerFilter" db:"-" gorm:"-"` // Player IDs to include/exclude
	PlayerFilterDB   JSONB             `json:"-" db:"player_filter" gorm:"type:jsonb"`
	SinceSequence    int64             `json:"sinceSequence" db:"since_sequence" gorm:"default:0"` // Start from this sequence

	// Performance metrics
	ThroughputEventsPerSecond float64   `json:"throughputEventsPerSecond" db:"throughput_events_per_second" gorm:"default:0.0"`
	ThroughputBytesPerSecond  float64   `json:"throughputBytesPerSecond" db:"throughput_bytes_per_second" gorm:"default:0.0"`
	AverageEventSize          float64   `json:"averageEventSize" db:"average_event_size" gorm:"default:0.0"`

	// Quality of service
	Priority         int               `json:"priority" db:"priority" gorm:"default:0"` // Higher priority gets faster delivery
	MaxLatencyMs     int               `json:"maxLatencyMs" db:"max_latency_ms" gorm:"default:1000"` // Maximum acceptable latency
	RetryAttempts    int               `json:"retryAttempts" db:"retry_attempts" gorm:"default:3"`

	// Timestamps
	CreatedAt        time.Time         `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time         `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastActivityAt   time.Time         `json:"lastActivityAt" db:"last_activity_at" gorm:"autoUpdateTime"`
	ArchivedAt       *time.Time        `json:"archivedAt" db:"archived_at" gorm:"index"`

	// Associations
	Connection       RealTimeConnection `json:"connection,omitempty" gorm:"foreignKey:ConnectionID"`
	GameSession      GameSession        `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
}

// TableName returns the table name for EventStream
func (EventStream) TableName() string {
	return "event_streams"
}

// BeforeSave handles the JSON serialization of array fields
func (es *EventStream) BeforeSave() error {
	if len(es.EventTypes) > 0 {
		data, err := json.Marshal(es.EventTypes)
		if err != nil {
			return fmt.Errorf("failed to marshal event types: %w", err)
		}
		es.EventTypesDB = JSONB(data)
	}

	if len(es.PlayerFilter) > 0 {
		data, err := json.Marshal(es.PlayerFilter)
		if err != nil {
			return fmt.Errorf("failed to marshal player filter: %w", err)
		}
		es.PlayerFilterDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (es *EventStream) AfterFind() error {
	if len(es.EventTypesDB) > 0 {
		err := json.Unmarshal(es.EventTypesDB, &es.EventTypes)
		if err != nil {
			return fmt.Errorf("failed to unmarshal event types: %w", err)
		}
	}

	if len(es.PlayerFilterDB) > 0 {
		err := json.Unmarshal(es.PlayerFilterDB, &es.PlayerFilter)
		if err != nil {
			return fmt.Errorf("failed to unmarshal player filter: %w", err)
		}
	}

	return nil
}

// Validate validates the event stream
func (es *EventStream) Validate() error {
	if es.StreamName == "" {
		return fmt.Errorf("stream name is required")
	}
	if es.StreamType == "" {
		return fmt.Errorf("stream type is required")
	}
	if es.BufferSize < 0 || es.BufferSize > 10000 {
		return fmt.Errorf("buffer size must be between 0 and 10000")
	}
	if es.MaxLatencyMs < 0 || es.MaxLatencyMs > 30000 {
		return fmt.Errorf("max latency must be between 0 and 30000ms")
	}
	return nil
}

// ShouldProcessEvent checks if an event should be processed by this stream
func (es *EventStream) ShouldProcessEvent(eventType string, playerID UUID) bool {
	if !es.IsActive {
		return false
	}

	// Check event type filter
	if len(es.EventTypes) > 0 {
		var eventTypes []string
		if err := json.Unmarshal(es.EventTypesDB, &eventTypes); err != nil {
			return false
		}

		found := false
		for _, et := range eventTypes {
			if et == eventType {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check player filter
	if len(es.PlayerFilter) > 0 {
		var playerFilter map[string]interface{}
		if err := json.Unmarshal(es.PlayerFilterDB, &playerFilter); err != nil {
			return false
		}

		// If "include" is specified, only include those players
		if include, ok := playerFilter["include"].([]interface{}); ok {
			found := false
			for _, id := range include {
				if idStr, ok := id.(string); ok && UUID(idStr) == playerID {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}

		// If "exclude" is specified, exclude those players
		if exclude, ok := playerFilter["exclude"].([]interface{}); ok {
			for _, id := range exclude {
				if idStr, ok := id.(string); ok && UUID(idStr) == playerID {
					return false
				}
			}
		}
	}

	return true
}

// RecordEventSent records that an event was sent
func (es *EventStream) RecordEventSent(sequence int64, bytes int) {
	es.LastSequence = sequence
	es.EventsSent++
	es.LastEventSentAt = &time.Time{}
	*es.LastEventSentAt = time.Now()
	es.RecordActivity()

	// Update throughput metrics
	now := time.Now()
	if es.LastEventSentAt != nil {
		duration := now.Sub(*es.LastEventSentAt).Seconds()
		if duration > 0 {
			es.ThroughputEventsPerSecond = 1.0 / duration
			es.ThroughputBytesPerSecond = float64(bytes) / duration
		}
	}

	// Update average event size
	if es.EventsSent > 0 {
		totalBytes := es.ThroughputBytesPerSecond * float64(es.EventsSent)
		es.AverageEventSize = totalBytes / float64(es.EventsSent)
	}
}

// RecordEventDropped records that an event was dropped
func (es *EventStream) RecordEventDropped() {
	es.EventsDropped++
	es.RecordActivity()
}

// RecordActivity updates the last activity timestamp
func (es *EventStream) RecordActivity() {
	es.LastActivityAt = time.Now()
}

// Close deactivates the event stream
func (es *EventStream) Close() {
	es.IsActive = false
	now := time.Now()
	es.ArchivedAt = &now
}

// StateHash represents cryptographic hash of client game state for integrity validation
type StateHash struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	HashType         string    `json:"hashType" db:"hash_type" gorm:"not null;default:'sha256';size:50"`
	HashValue        string    `json:"hashValue" db:"hash_value" gorm:"not null;size:128;index"`

	// Context information
	TurnID           string    `json:"turnId" db:"turn_id" gorm:"not null;size:255;index"`
	Sequence         int64     `json:"sequence" db:"sequence" gorm:"not null;index"`
	RoundNumber      int       `json:"roundNumber" db:"round_number" gorm:"default:1"`
	GamePhase        GamePhase `json:"gamePhase" db:"game_phase" gorm:"not null"`

	// State information included in hash
	StateComponents  JSONB     `json:"stateComponents" db:"-" gorm:"-"` // List of state components included
	StateComponentsDB JSONB     `json:"-" db:"state_components" gorm:"type:jsonb"`
	StateSize        int64     `json:"stateSize" db:"state_size" gorm:"default:0"` // Size of state in bytes

	// Verification and status
	IsVerified       bool      `json:"isVerified" db:"is_verified" gorm:"default:false"`
	VerificationPassed *bool   `json:"verificationPassed" db:"verification_passed"` // null = not yet verified
	VerifiedAt       *time.Time `json:"verifiedAt" db:"verified_at" gorm:"index"`
	VerificationErrors JSONB   `json:"verificationErrors" db:"-" gorm:"-"` // List of verification errors
	VerificationErrorsDB JSONB `json:"-" db:"verification_errors" gorm:"type:jsonb"`

	// Metadata
	ClientVersion    string    `json:"clientVersion" db:"client_version" gorm:"size:50"`
	Platform         string    `json:"platform" db:"platform" gorm:"size:100"`
	UserAgent        string    `json:"userAgent" db:"user_agent" gorm:"size:500"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`

	// Associations
	GameSession      GameSession   `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player           PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for StateHash
func (StateHash) TableName() string {
	return "state_hashes"
}

// BeforeSave handles the JSON serialization of array fields
func (sh *StateHash) BeforeSave() error {
	if len(sh.StateComponents) > 0 {
		data, err := json.Marshal(sh.StateComponents)
		if err != nil {
			return fmt.Errorf("failed to marshal state components: %w", err)
		}
		sh.StateComponentsDB = JSONB(data)
	}

	if len(sh.VerificationErrors) > 0 {
		data, err := json.Marshal(sh.VerificationErrors)
		if err != nil {
			return fmt.Errorf("failed to marshal verification errors: %w", err)
		}
		sh.VerificationErrorsDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (sh *StateHash) AfterFind() error {
	if len(sh.StateComponentsDB) > 0 {
		err := json.Unmarshal(sh.StateComponentsDB, &sh.StateComponents)
		if err != nil {
			return fmt.Errorf("failed to unmarshal state components: %w", err)
		}
	}

	if len(sh.VerificationErrorsDB) > 0 {
		err := json.Unmarshal(sh.VerificationErrorsDB, &sh.VerificationErrors)
		if err != nil {
			return fmt.Errorf("failed to unmarshal verification errors: %w", err)
		}
	}

	return nil
}

// Validate validates the state hash
func (sh *StateHash) Validate() error {
	if sh.HashValue == "" {
		return fmt.Errorf("hash value is required")
	}
	if sh.TurnID == "" {
		return fmt.Errorf("turn ID is required")
	}
	if sh.Sequence < 0 {
		return fmt.Errorf("sequence must be non-negative")
	}
	return nil
}

// IsExpired returns whether the hash is considered too old to be relevant
func (sh *StateHash) IsExpired() bool {
	// Consider a hash expired after 1 hour
	expirationTime := sh.CreatedAt.Add(time.Hour)
	return time.Now().After(expirationTime)
}

// AddVerificationError adds a verification error to the list
func (sh *StateHash) AddVerificationError(error string) {
	if sh.VerificationErrors == nil {
		sh.VerificationErrors = make([]string, 0)
	}
	sh.VerificationErrors = append(sh.VerificationErrors, error)
}

// MarkVerified marks the hash as verified with the result
func (sh *StateHash) MarkVerified(passed bool) {
	now := time.Now()
	sh.IsVerified = true
	sh.VerifiedAt = &now
	sh.VerificationPassed = &passed
}

// HasComponent checks if a specific state component is included in the hash
func (sh *StateHash) HasComponent(component string) bool {
	if len(sh.StateComponents) == 0 {
		return false
	}

	var components []string
	if err := json.Unmarshal(sh.StateComponentsDB, &components); err != nil {
		return false
	}

	for _, c := range components {
		if c == component {
			return true
		}
	}
	return false
}