package entities

import (
	"encoding/json"
	"fmt"
	"time"
)

// ErrorHandler represents hierarchical system for managing different types of errors with appropriate responses
type ErrorHandler struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	HandlerName      string    `json:"handlerName" db:"handler_name" gorm:"not null;size:255;uniqueIndex"`
	ErrorCategory    string    `json:"errorCategory" db:"error_category" gorm:"not null;size:100;index"` // network, auth, game, system
	Severity         ErrorSeverity `json:"severity" db:"severity" gorm:"not null;default:'medium'"`
	IsEnabled        bool      `json:"isEnabled" db:"is_enabled" gorm:"default:true"`

	// Handler configuration
	ErrorPattern     string    `json:"errorPattern" db:"error_pattern" gorm:"size:500"` // Regex pattern to match error messages
	ErrorCode        *string   `json:"errorCode" db:"error_code" gorm:"size:100"` // Specific error codes to handle
	Priority         int       `json:"priority" db:"priority" gorm:"default:0"` // Higher priority handlers run first

	// Response configuration
	ResponseAction   string    `json:"responseAction" db:"response_action" gorm:"not null;size:100"` // retry, fallback, notify, graceful_shutdown
	MaxRetries       int       `json:"maxRetries" db:"max_retries" gorm:"default:3"`
	RetryDelay       int       `json:"retryDelay" db:"retry_delay" gorm:"default:1000"` // milliseconds
	ExponentialBackoff bool    `json:"exponentialBackoff" db:"exponential_backoff" gorm:"default:true"`

	// Fallback configuration
	FallbackAction   *string   `json:"fallbackAction" db:"fallback_action" gorm:"size:100"`
	FallbackHandler  *string   `json:"fallbackHandler" db:"fallback_handler" gorm:"size:255"`
	CircuitBreakerThreshold int `json:"circuitBreakerThreshold" db:"circuit_breaker_threshold" gorm:"default:5"`
	CircuitBreakerTimeout int  `json:"circuitBreakerTimeout" db:"circuit_breaker_timeout" gorm:"default:60000"` // milliseconds

	// Notification configuration
	NotifyUsers      bool      `json:"notifyUsers" db:"notify_users" gorm:"default:false"`
	NotifyAdmins     bool      `json:"notifyAdmins" db:"notify_admins" gorm:"default:false"`
	UserMessage      *string   `json:"userMessage" db:"user_message" gorm:"size:500"`
	AdminMessage     *string   `json:"adminMessage" db:"admin_message" gorm:"size:1000"`

	// Logging and monitoring
	LogLevel         string    `json:"logLevel" db:"log_level" gorm:"default:'ERROR';size:20"`
	MetricTags       JSONB     `json:"metricTags" db:"-" gorm:"-"` // Additional metric tags
	MetricTagsDB     JSONB     `json:"-" db:"metric_tags" gorm:"type:jsonb"`

	// Handler state
	IsInCircuitBreaker bool      `json:"isInCircuitBreaker" db:"is_in_circuit_breaker" gorm:"default:false"`
	CircuitBreakerOpenedAt *time.Time `json:"circuitBreakerOpenedAt" db:"circuit_breaker_opened_at"`
	FailureCount    int64     `json:"failureCount" db:"failure_count" gorm:"default:0"`
	SuccessCount    int64     `json:"successCount" db:"success_count" gorm:"default:0"`
	LastFailureAt   *time.Time `json:"lastFailureAt" db:"last_failure_at" gorm:"index"`
	LastSuccessAt   *time.Time `json:"lastSuccessAt" db:"last_success_at" gorm:"index"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastTriggeredAt  *time.Time `json:"lastTriggeredAt" db:"last_triggered_at" gorm:"index"`
}

// TableName returns the table name for ErrorHandler
func (ErrorHandler) TableName() string {
	return "error_handlers"
}

// BeforeSave handles the JSON serialization of array fields
func (eh *ErrorHandler) BeforeSave() error {
	if len(eh.MetricTags) > 0 {
		data, err := json.Marshal(eh.MetricTags)
		if err != nil {
			return fmt.Errorf("failed to marshal metric tags: %w", err)
		}
		eh.MetricTagsDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (eh *ErrorHandler) AfterFind() error {
	if len(eh.MetricTagsDB) > 0 {
		err := json.Unmarshal(eh.MetricTagsDB, &eh.MetricTags)
		if err != nil {
			return fmt.Errorf("failed to unmarshal metric tags: %w", err)
		}
	}
	return nil
}

// Validate validates the error handler
func (eh *ErrorHandler) Validate() error {
	if eh.HandlerName == "" {
		return fmt.Errorf("handler name is required")
	}
	if eh.ErrorCategory == "" {
		return fmt.Errorf("error category is required")
	}
	if eh.ResponseAction == "" {
		return fmt.Errorf("response action is required")
	}
	if eh.MaxRetries < 0 {
		return fmt.Errorf("max retries cannot be negative")
	}
	if eh.RetryDelay < 0 {
		return fmt.Errorf("retry delay cannot be negative")
	}
	if eh.CircuitBreakerThreshold < 1 {
		return fmt.Errorf("circuit breaker threshold must be at least 1")
	}
	if eh.CircuitBreakerTimeout < 1000 {
		return fmt.Errorf("circuit breaker timeout must be at least 1000ms")
	}
	return nil
}

// CanHandle checks if this handler can handle the given error
func (eh *ErrorHandler) CanHandle(errorCode, errorMessage string) bool {
	if !eh.IsEnabled {
		return false
	}
	if eh.IsInCircuitBreaker {
		return false
	}

	// Check error code match
	if eh.ErrorCode != nil && *eh.ErrorCode != "" && *eh.ErrorCode != errorCode {
		return false
	}

	// TODO: Implement regex pattern matching for error messages
	// For now, always return true if no specific pattern is set
	return true
}

// ShouldRetry returns whether this error should be retried
func (eh *ErrorHandler) ShouldRetry(attemptCount int) bool {
	if eh.ResponseAction != "retry" {
		return false
	}
	return attemptCount < eh.MaxRetries
}

// GetRetryDelay returns the retry delay for the given attempt
func (eh *ErrorHandler) GetRetryDelay(attemptCount int) time.Duration {
	delay := time.Duration(eh.RetryDelay) * time.Millisecond
	if eh.ExponentialBackoff && attemptCount > 0 {
		delay *= time.Duration(1 << uint(attemptCount-1))
	}
	return delay
}

// RecordFailure records a failure for circuit breaker tracking
func (eh *ErrorHandler) RecordFailure() {
	now := time.Now()
	eh.FailureCount++
	eh.LastFailureAt = &now
	eh.LastTriggeredAt = &now

	// Check if circuit breaker should be opened
	if eh.FailureCount >= int64(eh.CircuitBreakerThreshold) {
		eh.OpenCircuitBreaker()
	}
}

// RecordSuccess records a success for circuit breaker tracking
func (eh *ErrorHandler) RecordSuccess() {
	now := time.Now()
	eh.SuccessCount++
	eh.LastSuccessAt = &now

	// Check if circuit breaker should be closed (after timeout)
	if eh.IsInCircuitBreaker && eh.CircuitBreakerOpenedAt != nil {
		timeout := time.Duration(eh.CircuitBreakerTimeout) * time.Millisecond
		if now.Sub(*eh.CircuitBreakerOpenedAt) > timeout {
			eh.CloseCircuitBreaker()
		}
	}
}

// OpenCircuitBreaker opens the circuit breaker
func (eh *ErrorHandler) OpenCircuitBreaker() {
	now := time.Now()
	eh.IsInCircuitBreaker = true
	eh.CircuitBreakerOpenedAt = &now
}

// CloseCircuitBreaker closes the circuit breaker
func (eh *ErrorHandler) CloseCircuitBreaker() {
	eh.IsInCircuitBreaker = false
	eh.FailureCount = 0
	eh.SuccessCount = 0
}

// GetFailureRate returns the failure rate as a percentage
func (eh *ErrorHandler) GetFailureRate() float64 {
	total := eh.FailureCount + eh.SuccessCount
	if total == 0 {
		return 0.0
	}
	return float64(eh.FailureCount) / float64(total) * 100.0
}

// GracefulDegradation represents progressive reduction of functionality while maintaining core gameplay
type GracefulDegradation struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	GameSessionID    UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	ComponentName    string    `json:"componentName" db:"component_name" gorm:"not null;size:255;index"`
	CurrentLevel     int       `json:"currentLevel" db:"current_level" gorm:"default:0"` // 0 = full functionality, higher = more degraded

	// Degradation configuration
	MaxLevels        int       `json:"maxLevels" db:"max_levels" gorm:"default:3"` // Maximum degradation levels
	AutoDegrade      bool      `json:"autoDegrade" db:"auto_degrade" gorm:"default:true"`
	AutoRecover      bool      `json:"autoRecover" db:"auto_recover" gorm:"default:true"`
	RecoveryDelay    int       `json:"recoveryDelay" db:"recovery_delay" gorm:"default:30000"` // milliseconds

	// Trigger conditions
	ErrorThreshold   float64   `json:"errorThreshold" db:"error_threshold" gorm:"default:0.1"` // Error rate threshold (0.0 to 1.0)
	PerformanceThreshold float64 `json:"performanceThreshold" db:"performance_threshold" gorm:"default:200.0"` // Response time threshold in ms
	LatencyThreshold  float64   `json:"latencyThreshold" db:"latency_threshold" gorm:"default:1000.0"` // Latency threshold in ms

	// Level configurations
	LevelConfigs     JSONB     `json:"levelConfigs" db:"-" gorm:"-"` // Configuration for each degradation level
	LevelConfigsDB   JSONB     `json:"-" db:"level_configs" gorm:"type:jsonb"`

	// Current state
	IsActive         bool      `json:"isActive" db:"is_active" gorm:"default:true"`
	IsDegraded       bool      `json:"isDegraded" db:"is_degraded" gorm:"default:false"`
	LastDegradeAt    *time.Time `json:"lastDegradeAt" db:"last_degrade_at" gorm:"index"`
	LastRecoverAt    *time.Time `json:"lastRecoverAt" db:"last_recover_at" gorm:"index"`
	RecoveryScheduledAt *time.Time `json:"recoveryScheduledAt" db:"recovery_scheduled_at" gorm:"index"`

	// Metrics tracking
	ErrorRate        float64   `json:"errorRate" db:"error_rate" gorm:"default:0.0"`
	ResponseTime     float64   `json:"responseTime" db:"response_time" gorm:"default:0.0"` // milliseconds
	Latency          float64   `json:"latency" db:"latency" gorm:"default:0.0"` // milliseconds
	QualityScore     float64   `json:"qualityScore" db:"quality_score" gorm:"default:1.0"` // 0.0 to 1.0

	// Feature flags at current level
	DisabledFeatures JSONB     `json:"disabledFeatures" db:"-" gorm:"-"` // Array of disabled feature names
	DisabledFeaturesDB JSONB   `json:"-" db:"disabled_features" gorm:"type:jsonb"`
	LimitedFeatures  JSONB     `json:"limitedFeatures" db:"-" gorm:"-"` // Map of feature limits
	LimitedFeaturesDB JSONB    `json:"-" db:"limited_features" gorm:"type:jsonb"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastAssessmentAt time.Time `json:"lastAssessmentAt" db:"last_assessment_at" gorm:"autoUpdateTime"`

	// Associations
	GameSession      GameSession `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
}

// TableName returns the table name for GracefulDegradation
func (GracefulDegradation) TableName() string {
	return "graceful_degradation"
}

// BeforeSave handles the JSON serialization of array fields
func (gd *GracefulDegradation) BeforeSave() error {
	if len(gd.LevelConfigs) > 0 {
		data, err := json.Marshal(gd.LevelConfigs)
		if err != nil {
			return fmt.Errorf("failed to marshal level configs: %w", err)
		}
		gd.LevelConfigsDB = JSONB(data)
	}

	if len(gd.DisabledFeatures) > 0 {
		data, err := json.Marshal(gd.DisabledFeatures)
		if err != nil {
			return fmt.Errorf("failed to marshal disabled features: %w", err)
		}
		gd.DisabledFeaturesDB = JSONB(data)
	}

	if len(gd.LimitedFeatures) > 0 {
		data, err := json.Marshal(gd.LimitedFeatures)
		if err != nil {
			return fmt.Errorf("failed to marshal limited features: %w", err)
		}
		gd.LimitedFeaturesDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (gd *GracefulDegradation) AfterFind() error {
	if len(gd.LevelConfigsDB) > 0 {
		err := json.Unmarshal(gd.LevelConfigsDB, &gd.LevelConfigs)
		if err != nil {
			return fmt.Errorf("failed to unmarshal level configs: %w", err)
		}
	}

	if len(gd.DisabledFeaturesDB) > 0 {
		err := json.Unmarshal(gd.DisabledFeaturesDB, &gd.DisabledFeatures)
		if err != nil {
			return fmt.Errorf("failed to unmarshal disabled features: %w", err)
		}
	}

	if len(gd.LimitedFeaturesDB) > 0 {
		err := json.Unmarshal(gd.LimitedFeaturesDB, &gd.LimitedFeatures)
		if err != nil {
			return fmt.Errorf("failed to unmarshal limited features: %w", err)
		}
	}

	return nil
}

// Validate validates the graceful degradation configuration
func (gd *GracefulDegradation) Validate() error {
	if gd.ComponentName == "" {
		return fmt.Errorf("component name is required")
	}
	if gd.MaxLevels < 1 {
		return fmt.Errorf("max levels must be at least 1")
	}
	if gd.CurrentLevel < 0 || gd.CurrentLevel > gd.MaxLevels {
		return fmt.Errorf("current level must be between 0 and max levels")
	}
	if gd.ErrorThreshold < 0.0 || gd.ErrorThreshold > 1.0 {
		return fmt.Errorf("error threshold must be between 0.0 and 1.0")
	}
	if gd.PerformanceThreshold < 0.0 {
		return fmt.Errorf("performance threshold cannot be negative")
	}
	if gd.LatencyThreshold < 0.0 {
		return fmt.Errorf("latency threshold cannot be negative")
	}
	if gd.RecoveryDelay < 1000 {
		return fmt.Errorf("recovery delay must be at least 1000ms")
	}
	return nil
}

// ShouldDegrade returns whether the component should be degraded based on current metrics
func (gd *GracefulDegradation) ShouldDegrade() bool {
	if !gd.IsActive || gd.CurrentLevel >= gd.MaxLevels {
		return false
	}

	return gd.ErrorRate > gd.ErrorThreshold ||
		gd.ResponseTime > gd.PerformanceThreshold ||
		gd.Latency > gd.LatencyThreshold
}

// ShouldRecover returns whether the component should attempt recovery
func (gd *GracefulDegradation) ShouldRecover() bool {
	if !gd.AutoRecover || !gd.IsDegraded {
		return false
	}

	// Check if recovery delay has passed
	if gd.RecoveryScheduledAt != nil {
		return time.Now().After(*gd.RecoveryScheduledAt)
	}

	return false
}

// Degrade degrades the component to the next level
func (gd *GracefulDegradation) Degrade() {
	if gd.CurrentLevel < gd.MaxLevels {
		gd.CurrentLevel++
		now := time.Now()
		gd.LastDegradeAt = &now
		gd.IsDegraded = gd.CurrentLevel > 0

		// Update disabled and limited features for current level
		gd.updateFeaturesForLevel(gd.CurrentLevel)
	}
}

// Recover recovers the component to the previous level
func (gd *GracefulDegradation) Recover() {
	if gd.CurrentLevel > 0 {
		gd.CurrentLevel--
		now := time.Now()
		gd.LastRecoverAt = &now
		gd.IsDegraded = gd.CurrentLevel > 0

		// Update disabled and limited features for current level
		gd.updateFeaturesForLevel(gd.CurrentLevel)
	}
}

// ScheduleRecovery schedules a recovery attempt
func (gd *GracefulDegradation) ScheduleRecovery() {
	delay := time.Duration(gd.RecoveryDelay) * time.Millisecond
	scheduledTime := time.Now().Add(delay)
	gd.RecoveryScheduledAt = &scheduledTime
}

// UpdateMetrics updates the component metrics
func (gd *GracefulDegradation) UpdateMetrics(errorRate, responseTime, latency float64) {
	gd.ErrorRate = errorRate
	gd.ResponseTime = responseTime
	gd.Latency = latency
	gd.LastAssessmentAt = time.Now()

	// Calculate quality score (inverse of performance issues)
	gd.QualityScore = gd.calculateQualityScore()

	// Auto-degrade if needed
	if gd.AutoDegrade && gd.ShouldDegrade() {
		gd.Degrade()
	}

	// Auto-recover if needed
	if gd.AutoRecover && gd.ShouldRecover() {
		gd.Recover()
	}
}

// calculateQualityScore calculates the quality score based on current metrics
func (gd *GracefulDegradation) calculateQualityScore() float64 {
	errorScore := 1.0 - gd.ErrorRate
	performanceScore := 1.0

	if gd.PerformanceThreshold > 0 {
		if gd.ResponseTime <= gd.PerformanceThreshold {
			performanceScore = 1.0
		} else {
			performanceScore = gd.PerformanceThreshold / gd.ResponseTime
		}
	}

	latencyScore := 1.0
	if gd.LatencyThreshold > 0 {
		if gd.Latency <= gd.LatencyThreshold {
			latencyScore = 1.0
		} else {
			latencyScore = gd.LatencyThreshold / gd.Latency
		}
	}

	// Weighted average
	return (errorScore * 0.4) + (performanceScore * 0.3) + (latencyScore * 0.3)
}

// updateFeaturesForLevel updates the disabled and limited features based on the degradation level
func (gd *GracefulDegradation) updateFeaturesForLevel(level int) {
	// This would typically load configuration from the level configs
	// For now, implement basic logic
	gd.DisabledFeatures = make([]string, 0)
	gd.LimitedFeatures = make(map[string]interface{})

	switch level {
	case 1:
		// Level 1: Disable some non-critical features
		gd.DisabledFeatures = []string{"advanced_animations", "background_music"}
		gd.LimitedFeatures = map[string]interface{}{
			"max_particles": 100,
			"update_rate":   30,
		}
	case 2:
		// Level 2: Disable more features
		gd.DisabledFeatures = []string{
			"advanced_animations",
			"background_music",
			"particle_effects",
			"voice_chat",
		}
		gd.LimitedFeatures = map[string]interface{}{
			"max_particles": 10,
			"update_rate":   15,
			"max_connections": 5,
		}
	case 3:
		// Level 3: Maximum degradation - only core gameplay
		gd.DisabledFeatures = []string{
			"advanced_animations",
			"background_music",
			"particle_effects",
			"voice_chat",
			"chat",
			"emotes",
			"spectator_mode",
		}
		gd.LimitedFeatures = map[string]interface{}{
			"max_particles": 0,
			"update_rate":   10,
			"max_connections": 2,
			"bandwidth_limit": 1000, // bytes per second
		}
	}
}

// IsFeatureDisabled checks if a feature is disabled at the current degradation level
func (gd *GracefulDegradation) IsFeatureDisabled(featureName string) bool {
	for _, feature := range gd.DisabledFeatures {
		if feature == featureName {
			return true
		}
	}
	return false
}

// GetFeatureLimit returns the limit for a feature if it's limited
func (gd *GracefulDegradation) GetFeatureLimit(featureName string) (interface{}, bool) {
	if limit, exists := gd.LimitedFeatures[featureName]; exists {
		return limit, true
	}
	return nil, false
}

// ErrorRecovery represents user-friendly mechanisms for recovering from various error conditions
type ErrorRecovery struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	RecoveryName     string    `json:"recoveryName" db:"recovery_name" gorm:"not null;size:255;uniqueIndex"`
	ErrorType        string    `json:"errorType" db:"error_type" gorm:"not null;size:100;index"` // network, auth, game, system
	Severity         ErrorSeverity `json:"severity" db:"severity" gorm:"not null;default:'medium'"`
	IsEnabled        bool      `json:"isEnabled" db:"is_enabled" gorm:"default:true"`

	// Recovery configuration
	RecoveryAction   string    `json:"recoveryAction" db:"recovery_action" gorm:"not null;size:100"` // retry, reconnect, refresh, fallback
	Automatic        bool      `json:"automatic" db:"automatic" gorm:"default:true"` // Whether recovery is automatic
	UserConfirmation bool      `json:"userConfirmation" db:"user_confirmation" gorm:"default:false"` // Whether user confirmation is required

	// User interface
	UserMessage      string    `json:"userMessage" db:"user_message" gorm:"not null;size:500"`
	UserActionText   *string   `json:"userActionText" db:"user_action_text" gorm:"size:100"`
	UserCancelText   *string   `json:"userCancelText" db:"user_cancel_text" gorm:"size:100"`
	ShowProgress     bool      `json:"showProgress" db:"show_progress" gorm:"default:true"`
	ProgressMessage  *string   `json:"progressMessage" db:"progress_message" gorm:"size:500"`

	// Recovery parameters
	MaxAttempts      int       `json:"maxAttempts" db:"max_attempts" gorm:"default:3"`
	AttemptDelay     int       `json:"attemptDelay" db:"attempt_delay" gorm:"default:1000"` // milliseconds
	ExponentialBackoff bool     `json:"exponentialBackoff" db:"exponential_backoff" gorm:"default:true"`
	Timeout          int       `json:"timeout" db:"timeout" gorm:"default:30000"` // milliseconds

	// Fallback options
	FallbackRecovery *string   `json:"fallbackRecovery" db:"fallback_recovery" gorm:"size:255"`
	FallbackMessage  *string   `json:"fallbackMessage" db:"fallback_message" gorm:"size:500"`

	// Success and failure handling
	SuccessMessage   *string   `json:"successMessage" db:"success_message" gorm:"size:500"`
	FailureMessage   *string   `json:"failureMessage" db:"failure_message" gorm:"size:500"`
	OnSuccessAction  *string   `json:"onSuccessAction" db:"on_success_action" gorm:"size:100"` // continue, restart, quit
	OnFailureAction  *string   `json:"onFailureAction" db:"on_failure_action" gorm:"size:100"` // continue, restart, quit

	// Recovery context
	Context          JSONB     `json:"context" db:"-" gorm:"-"` // Additional context data
	ContextDB        JSONB     `json:"-" db:"context" gorm:"type:jsonb"`
	RequiredState    JSONB     `json:"requiredState" db:"-" gorm:"-"` // Required state for recovery
	RequiredStateDB  JSONB     `json:"-" db:"required_state" gorm:"type:jsonb"`

	// Metrics tracking
	UsageCount       int64     `json:"usageCount" db:"usage_count" gorm:"default:0"`
	SuccessCount     int64     `json:"successCount" db:"success_count" gorm:"default:0"`
	FailureCount     int64     `json:"failureCount" db:"failure_count" gorm:"default:0"`
	AverageRecoveryTime float64 `json:"averageRecoveryTime" db:"average_recovery_time" gorm:"default:0.0"` // milliseconds

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	LastUsedAt       *time.Time `json:"lastUsedAt" db:"last_used_at" gorm:"index"`

	// Associations
	RecoveryAttempts []RecoveryAttempt `json:"recoveryAttempts,omitempty" gorm:"foreignKey:RecoveryID"`
}

// TableName returns the table name for ErrorRecovery
func (ErrorRecovery) TableName() string {
	return "error_recovery"
}

// BeforeSave handles the JSON serialization of array fields
func (er *ErrorRecovery) BeforeSave() error {
	if len(er.Context) > 0 {
		data, err := json.Marshal(er.Context)
		if err != nil {
			return fmt.Errorf("failed to marshal context: %w", err)
		}
		er.ContextDB = JSONB(data)
	}

	if len(er.RequiredState) > 0 {
		data, err := json.Marshal(er.RequiredState)
		if err != nil {
			return fmt.Errorf("failed to marshal required state: %w", err)
		}
		er.RequiredStateDB = JSONB(data)
	}

	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (er *ErrorRecovery) AfterFind() error {
	if len(er.ContextDB) > 0 {
		err := json.Unmarshal(er.ContextDB, &er.Context)
		if err != nil {
			return fmt.Errorf("failed to unmarshal context: %w", err)
		}
	}

	if len(er.RequiredStateDB) > 0 {
		err := json.Unmarshal(er.RequiredStateDB, &er.RequiredState)
		if err != nil {
			return fmt.Errorf("failed to unmarshal required state: %w", err)
		}
	}

	return nil
}

// Validate validates the error recovery configuration
func (er *ErrorRecovery) Validate() error {
	if er.RecoveryName == "" {
		return fmt.Errorf("recovery name is required")
	}
	if er.ErrorType == "" {
		return fmt.Errorf("error type is required")
	}
	if er.RecoveryAction == "" {
		return fmt.Errorf("recovery action is required")
	}
	if er.UserMessage == "" {
		return fmt.Errorf("user message is required")
	}
	if er.MaxAttempts < 1 {
		return fmt.Errorf("max attempts must be at least 1")
	}
	if er.AttemptDelay < 0 {
		return fmt.Errorf("attempt delay cannot be negative")
	}
	if er.Timeout < 1000 {
		return fmt.Errorf("timeout must be at least 1000ms")
	}
	return nil
}

// CanAttemptRecovery returns whether a recovery can be attempted
func (er *ErrorRecovery) CanAttemptRecovery() bool {
	return er.IsEnabled
}

// GetUserMessage returns the user message with any interpolated values
func (er *ErrorRecovery) GetUserMessage() string {
	// TODO: Implement message interpolation with context values
	return er.UserMessage
}

// GetRetryDelay returns the retry delay for the given attempt
func (er *ErrorRecovery) GetRetryDelay(attempt int) time.Duration {
	delay := time.Duration(er.AttemptDelay) * time.Millisecond
	if er.ExponentialBackoff && attempt > 0 {
		delay *= time.Duration(1 << uint(attempt-1))
	}
	return delay
}

// RecordUsage records that this recovery was used
func (er *ErrorRecovery) RecordUsage(success bool, duration time.Duration) {
	now := time.Now()
	er.UsageCount++
	er.LastUsedAt = &now

	if success {
		er.SuccessCount++
	} else {
		er.FailureCount++
	}

	// Update average recovery time
	totalTime := er.AverageRecoveryTime * float64(er.UsageCount-1) + float64(duration.Milliseconds())
	er.AverageRecoveryTime = totalTime / float64(er.UsageCount)
}

// GetSuccessRate returns the success rate as a percentage
func (er *ErrorRecovery) GetSuccessRate() float64 {
	if er.UsageCount == 0 {
		return 0.0
	}
	return float64(er.SuccessCount) / float64(er.UsageCount) * 100.0
}

// RecoveryAttempt represents a specific attempt to recover from an error
type RecoveryAttempt struct {
	ID               UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	RecoveryID       UUID      `json:"recoveryId" db:"recovery_id" gorm:"not null;index;type:uuid"`
	GameSessionID    UUID      `json:"gameSessionId" db:"game_session_id" gorm:"not null;index;type:uuid"`
	PlayerID         UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`

	// Attempt details
	AttemptNumber    int       `json:"attemptNumber" db:"attempt_number" gorm:"not null"`
	TriggerError     string    `json:"triggerError" db:"trigger_error" gorm:"not null;size:500"`
	ErrorContext     JSONB     `json:"errorContext" db:"-" gorm:"-"` // Additional error context
	ErrorContextDB   JSONB     `json:"-" db:"error_context" gorm:"type:jsonb"`

	// Attempt timeline
	StartedAt        time.Time `json:"startedAt" db:"started_at" gorm:"autoCreateTime"`
	CompletedAt      *time.Time `json:"completedAt" db:"completed_at" gorm:"index"`
	Duration         int64     `json:"duration" db:"duration" gorm:"default:0"` // milliseconds

	// Attempt result
	Status           string    `json:"status" db:"status" gorm:"not null;default:'pending';size:50"` // pending, running, success, failed, timeout, cancelled
	ResultMessage    *string   `json:"resultMessage" db:"result_message" gorm:"size:500"`
	ErrorCode        *string   `json:"errorCode" db:"error_code" gorm:"size:100"`

	// User interaction
	RequiredUserAction bool    `json:"requiredUserAction" db:"required_user_action" gorm:"default:false"`
	UserActionTaken   bool      `json:"userActionTaken" db:"user_action_taken" gorm:"default:false"`
	UserActionAt      *time.Time `json:"userActionAt" db:"user_action_at"`

	// Progress tracking
	Progress         int       `json:"progress" db:"progress" gorm:"default:0"` // 0 to 100
	ProgressMessage  *string   `json:"progressMessage" db:"progress_message" gorm:"size:500"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`

	// Associations
	Recovery         ErrorRecovery `json:"recovery,omitempty" gorm:"foreignKey:RecoveryID"`
	GameSession      GameSession   `json:"gameSession,omitempty" gorm:"foreignKey:GameSessionID"`
	Player           PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for RecoveryAttempt
func (RecoveryAttempt) TableName() string {
	return "recovery_attempts"
}

// BeforeSave handles the JSON serialization of array fields
func (ra *RecoveryAttempt) BeforeSave() error {
	if len(ra.ErrorContext) > 0 {
		data, err := json.Marshal(ra.ErrorContext)
		if err != nil {
			return fmt.Errorf("failed to marshal error context: %w", err)
		}
		ra.ErrorContextDB = JSONB(data)
	}
	return nil
}

// AfterFind handles the JSON deserialization of array fields
func (ra *RecoveryAttempt) AfterFind() error {
	if len(ra.ErrorContextDB) > 0 {
		err := json.Unmarshal(ra.ErrorContextDB, &ra.ErrorContext)
		if err != nil {
			return fmt.Errorf("failed to unmarshal error context: %w", err)
		}
	}
	return nil
}

// Validate validates the recovery attempt
func (ra *RecoveryAttempt) Validate() error {
	if ra.TriggerError == "" {
		return fmt.Errorf("trigger error is required")
	}
	if ra.AttemptNumber < 1 {
		return fmt.Errorf("attempt number must be at least 1")
	}
	if ra.Progress < 0 || ra.Progress > 100 {
		return fmt.Errorf("progress must be between 0 and 100")
	}
	return nil
}

// IsCompleted returns whether the attempt has completed (successfully or not)
func (ra *RecoveryAttempt) IsCompleted() bool {
	return ra.Status == "success" || ra.Status == "failed" || ra.Status == "timeout" || ra.Status == "cancelled"
}

// IsSuccessful returns whether the attempt was successful
func (ra *RecoveryAttempt) IsSuccessful() bool {
	return ra.Status == "success"
}

// IsRunning returns whether the attempt is currently running
func (ra *RecoveryAttempt) IsRunning() bool {
	return ra.Status == "running"
}

// Start marks the attempt as started
func (ra *RecoveryAttempt) Start() {
	ra.Status = "running"
	ra.StartedAt = time.Now()
	ra.UpdatedAt = time.Now()
}

// Complete marks the attempt as completed with success
func (ra *RecoveryAttempt) Complete(message string) {
	now := time.Now()
	ra.Status = "success"
	ra.CompletedAt = &now
	ra.Duration = now.Sub(ra.StartedAt).Milliseconds()
	ra.Progress = 100
	ra.ResultMessage = &message
	ra.UpdatedAt = now
}

// Fail marks the attempt as failed
func (ra *RecoveryAttempt) Fail(errorCode, message string) {
	now := time.Now()
	ra.Status = "failed"
	ra.CompletedAt = &now
	ra.Duration = now.Sub(ra.StartedAt).Milliseconds()
	ra.ErrorCode = &errorCode
	ra.ResultMessage = &message
	ra.UpdatedAt = now
}

// Timeout marks the attempt as timed out
func (ra *RecoveryAttempt) Timeout(message string) {
	now := time.Now()
	ra.Status = "timeout"
	ra.CompletedAt = &now
	ra.Duration = now.Sub(ra.StartedAt).Milliseconds()
	ra.ResultMessage = &message
	ra.UpdatedAt = now
}

// Cancel marks the attempt as cancelled
func (ra *RecoveryAttempt) Cancel(message string) {
	now := time.Now()
	ra.Status = "cancelled"
	ra.CompletedAt = &now
	ra.Duration = now.Sub(ra.StartedAt).Milliseconds()
	ra.ResultMessage = &message
	ra.UpdatedAt = now
}

// UpdateProgress updates the progress of the attempt
func (ra *RecoveryAttempt) UpdateProgress(progress int, message string) {
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}

	ra.Progress = progress
	ra.ProgressMessage = &message
	ra.UpdatedAt = time.Now()
}

// RecordUserAction records that the user took the required action
func (ra *RecoveryAttempt) RecordUserAction() {
	now := time.Now()
	ra.UserActionTaken = true
	ra.UserActionAt = &now
	ra.UpdatedAt = now
}