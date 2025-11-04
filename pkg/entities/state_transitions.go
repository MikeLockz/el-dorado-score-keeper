package entities

import (
	"fmt"
	"time"
)

// StateTransition represents a state transition rule
type StateTransition struct {
	FromState       string                    `json:"fromState"`
	ToState         string                    `json:"toState"`
	Event           string                    `json:"event"`
	Conditions      []TransitionCondition     `json:"conditions"`
	Actions         []TransitionAction        `json:"actions"`
	Description     string                    `json:"description"`
	IsReversible    bool                      `json:"isReversible"`
	RequiresAuth    bool                      `json:"requiresAuth"`
	TimeoutDuration *time.Duration            `json:"timeoutDuration"`
}

// TransitionCondition represents a condition that must be met for a transition
type TransitionCondition struct {
	Field       string      `json:"field"`
	Operator    string      `json:"operator"` // eq, ne, gt, lt, gte, lte, in, not_in, is_null, is_not_null
	Value       interface{} `json:"value"`
	Description string      `json:"description"`
}

// TransitionAction represents an action to execute during a transition
type TransitionAction struct {
	Type        string      `json:"type"`        // set, increment, decrement, append, remove, validate, notify, log
	Target      string      `json:"target"`      // field or method name
	Parameters  interface{} `json:"parameters"`  // action parameters
	Description string      `json:"description"`
}

// TransitionResult represents the result of a state transition
type TransitionResult struct {
	Success     bool              `json:"success"`
	NewState    string            `json:"newState"`
	OldState    string            `json:"oldState"`
	TriggeredBy string            `json:"triggeredBy"`
	Actions     []string          `json:"actions"`      // Actions that were executed
	Errors      []TransitionError `json:"errors"`
	Timestamp   time.Time         `json:"timestamp"`
	Duration    time.Duration     `json:"duration"`
}

// TransitionError represents an error during state transition
type TransitionError struct {
	Code        string `json:"code"`
	Message     string `json:"message"`
	Field       string `json:"field"`
	Expected    string `json:"expected"`
	Actual      string `json:"actual"`
}

// StateMachine defines state transition logic for entities
type StateMachine struct {
	EntityName    string              `json:"entityName"`
	StateField    string              `json:"stateField"`
	States        []string            `json:"states"`
	Transitions   []StateTransition   `json:"transitions"`
	InitialState  string              `json:"initialState"`
	FinalStates   []string            `json:"finalStates"`
	Description   string              `json:"description"`
}

// GetGameSessionStateMachine returns the state machine for GameSession
func GetGameSessionStateMachine() *StateMachine {
	return &StateMachine{
		EntityName:   "GameSession",
		StateField:   "phase",
		States: []string{
			string(GamePhaseSetup),
			string(GamePhaseBidding),
			string(GamePhasePlaying),
			string(GamePhaseSummary),
			string(GamePhaseSummaryDone),
			string(GamePhaseDone),
		},
		InitialState: string(GamePhaseSetup),
		FinalStates:  []string{string(GamePhaseDone)},
		Transitions: []StateTransition{
			{
				FromState:    string(GamePhaseSetup),
				ToState:      string(GamePhaseBidding),
				Event:        "start_bidding",
				Conditions:   []TransitionCondition{
					{Field: "is_started", Operator: "eq", Value: true, Description: "Game must be started"},
					{Field: "player_count", Operator: "gte", Value: 2, Description: "At least 2 players required"},
					{Field: "roster_configured", Operator: "eq", Value: true, Description: "Roster must be configured"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "current_round", Parameters: 1, Description: "Set current round to 1"},
					{Type: "set", Target: "dealer_index", Parameters: 0, Description: "Set dealer to first player"},
					{Type: "notify", Target: "players", Parameters: "Game starting bidding phase", Description: "Notify players of phase change"},
					{Type: "log", Target: "system", Parameters: "GameSession transitioned to bidding phase", Description: "Log state transition"},
				},
				Description: "Transition from setup to bidding phase when game starts",
				RequiresAuth: true,
			},
			{
				FromState:    string(GamePhaseBidding),
				ToState:      string(GamePhasePlaying),
				Event:        "start_playing",
				Conditions:   []TransitionCondition{
					{Field: "all_bids_complete", Operator: "eq", Value: true, Description: "All players must have bid"},
					{Field: "current_round", Operator: "gt", Value: 0, Description: "Must have a valid round number"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "trick_count", Parameters: 0, Description: "Initialize trick counter"},
					{Type: "set", Target: "lead_player_index", Parameters: "current_dealer_index + 1", Description: "Set lead player to left of dealer"},
					{Type: "deal_cards", Target: "players", Parameters: nil, Description: "Deal cards to all players"},
					{Type: "notify", Target: "players", Parameters: "Bidding complete, starting play", Description: "Notify players of phase change"},
				},
				Description: "Transition from bidding to playing phase when all bids are complete",
				RequiresAuth: false,
			},
			{
				FromState:    string(GamePhasePlaying),
				ToState:      string(GamePhaseBidding),
				Event:        "next_round",
				Conditions:   []TransitionCondition{
					{Field: "round_complete", Operator: "eq", Value: true, Description: "Current round must be complete"},
					{Field: "current_round", Operator: "lt", Value: "max_rounds", Description: "Must not have reached max rounds"},
				},
				Actions: []TransitionAction{
					{Type: "increment", Target: "current_round", Parameters: 1, Description: "Advance to next round"},
					{Type: "rotate", Target: "dealer_index", Parameters: 1, Description: "Rotate dealer to next player"},
					{Type: "reset", Target: "bids", Parameters: nil, Description: "Reset bids for new round"},
					{Type: "notify", Target: "players", Parameters: "Starting next round of bidding", Description: "Notify players of new round"},
				},
				Description: "Transition to next round of bidding",
				RequiresAuth: false,
			},
			{
				FromState:    string(GamePhasePlaying),
				ToState:      string(GamePhaseSummary),
				Event:        "game_complete",
				Conditions:   []TransitionCondition{
					{Field: "final_round_complete", Operator: "eq", Value: true, Description: "Final round must be complete"},
					{Field: "current_round", Operator: "gte", Value: "max_rounds", Description: "Must have completed all rounds"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "is_finished", Parameters: true, Description: "Mark game as finished"},
					{Type: "set", Target: "finished_at", Parameters: "NOW()", Description: "Set finish timestamp"},
					{Type: "calculate", Target: "final_scores", Parameters: nil, Description: "Calculate final scores"},
					{Type: "determine", Target: "winner", Parameters: nil, Description: "Determine game winner"},
					{Type: "update", Target: "statistics", Parameters: nil, Description: "Update player statistics"},
					{Type: "notify", Target: "players", Parameters: "Game completed", Description: "Notify players of game completion"},
				},
				Description: "Transition to summary phase when game is complete",
				RequiresAuth: false,
			},
			{
				FromState:    string(GamePhaseSummary),
				ToState:      string(GamePhaseSummaryDone),
				Event:        "summary_complete",
				Conditions:   []TransitionCondition{
					{Field: "summary_reviewed", Operator: "eq", Value: true, Description: "Summary must be reviewed"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "summary_completed_at", Parameters: "NOW()", Description: "Mark summary completion time"},
					{Type: "notify", Target: "players", Parameters: "Summary complete", Description: "Notify players of summary completion"},
				},
				Description: "Complete the game summary phase",
				RequiresAuth: false,
			},
			{
				FromState:    string(GamePhaseSummaryDone),
				ToState:      string(GamePhaseDone),
				Event:        "cleanup_complete",
				Conditions:   []TransitionCondition{
					{Field: "cleanup_performed", Operator: "eq", Value: true, Description: "Cleanup must be performed"},
				},
				Actions: []TransitionAction{
					{Type: "cleanup", Target: "temporary_data", Parameters: nil, Description: "Clean up temporary game data"},
					{Type: "archive", Target: "game_data", Parameters: nil, Description: "Archive game data for history"},
				},
				Description: "Final cleanup and transition to done state",
				RequiresAuth: true,
			},
		},
		Description: "State machine for game session lifecycle",
	}
}

// GetConnectionStateMachine returns the state machine for RealTimeConnection
func GetConnectionStateMachine() *StateMachine {
	return &StateMachine{
		EntityName:   "RealTimeConnection",
		StateField:   "status",
		States: []string{
			string(ConnectionStatusDisconnected),
			string(ConnectionStatusReconnecting),
			string(ConnectionStatusConnected),
			string(ConnectionStatusTimeout),
		},
		InitialState: string(ConnectionStatusDisconnected),
		FinalStates:  []string{string(ConnectionStatusDisconnected)},
		Transitions: []StateTransition{
			{
				FromState:    string(ConnectionStatusDisconnected),
				ToState:      string(ConnectionStatusReconnecting),
				Event:        "connect_request",
				Conditions:   []TransitionCondition{
					{Field: "endpoint", Operator: "is_not_null", Value: nil, Description: "Endpoint must be configured"},
					{Field: "session_active", Operator: "eq", Value: true, Description: "Game session must be active"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "connection_attempts", Parameters: "connection_attempts + 1", Description: "Increment connection attempts"},
					{Type: "set", Target: "last_connection_attempt", Parameters: "NOW()", Description: "Record connection attempt time"},
					{Type: "initiate", Target: "websocket", Parameters: nil, Description: "Initiate WebSocket connection"},
				},
				Description: "Attempt to establish connection",
				IsReversible: false,
				TimeoutDuration: &time.Duration{30 * time.Second},
			},
			{
				FromState:    string(ConnectionStatusReconnecting),
				ToState:      string(ConnectionStatusConnected),
				Event:        "connection_established",
				Conditions:   []TransitionCondition{
					{Field: "websocket_open", Operator: "eq", Value: true, Description: "WebSocket must be open"},
					{Field: "handshake_complete", Operator: "eq", Value: true, Description: "Handshake must be complete"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "connected_at", Parameters: "NOW()", Description: "Record connection time"},
					{Type: "set", Target: "connection_quality", Parameters: 1.0, Description: "Set initial connection quality"},
					{Type: "notify", Target: "game_session", Parameters: "player_connected", Description: "Notify game session of connection"},
					{Type: "start", Target: "heartbeat", Parameters: nil, Description: "Start heartbeat monitoring"},
				},
				Description: "Connection successfully established",
				IsReversible: true,
			},
			{
				FromState:    string(ConnectionStatusReconnecting),
				ToState:      string(ConnectionStatusDisconnected),
				Event:        "connection_failed",
				Conditions:   []TransitionCondition{
					{Field: "max_attempts_reached", Operator: "eq", Value: true, Description: "Max attempts must be reached"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "disconnected_at", Parameters: "NOW()", Description: "Record disconnection time"},
					{Type: "set", Target: "connection_quality", Parameters: 0.0, Description: "Reset connection quality"},
					{Type: "notify", Target: "game_session", Parameters: "player_disconnected", Description: "Notify game session of disconnection"},
					{Type: "cleanup", Target: "websocket", Parameters: nil, Description: "Clean up WebSocket resources"},
				},
				Description: "Connection failed after max attempts",
				IsReversible: true,
			},
			{
				FromState:    string(ConnectionStatusConnected),
				ToState:      string(ConnectionStatusReconnecting),
				Event:        "connection_lost",
				Conditions:   []TransitionCondition{
					{Field: "can_reconnect", Operator: "eq", Value: true, Description: "Reconnection must be allowed"},
					{Field: "grace_period_active", Operator: "eq", Value: true, Description: "Grace period must be active"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "reconnection_grace_period", Parameters: "NOW() + 5 MINUTES", Description: "Set reconnection grace period"},
					{Type: "notify", Target: "game_session", Parameters: "player_reconnecting", Description: "Notify game session of reconnection"},
					{Type: "pause", Target: "heartbeat", Parameters: nil, Description: "Pause heartbeat monitoring"},
				},
				Description: "Lost connection, attempting to reconnect",
				IsReversible: true,
				TimeoutDuration: &time.Duration{5 * time.Minute},
			},
			{
				FromState:    string(ConnectionStatusConnected),
				ToState:      string(ConnectionStatusTimeout),
				Event:        "heartbeat_timeout",
				Conditions:   []TransitionCondition{
					{Field: "last_pong_age", Operator: "gt", Value: "timeout_threshold", Description: "Pong age must exceed threshold"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "connection_quality", Parameters: 0.2, Description: "Degrade connection quality"},
					{Type: "notify", Target: "game_session", Parameters: "connection_timeout", Description: "Notify game session of timeout"},
					{Type: "record", Target: "timeout_count", Parameters: 1, Description: "Increment timeout count"},
				},
				Description: "Connection timeout detected",
				IsReversible: true,
			},
			{
				FromState:    string(ConnectionStatusTimeout),
				ToState:      string(ConnectionStatusDisconnected),
				Event:        "timeout_cleanup",
				Conditions:   []TransitionCondition{
					{Field: "cleanup_timer_expired", Operator: "eq", Value: true, Description: "Cleanup timer must expire"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "disconnected_at", Parameters: "NOW()", Description: "Record disconnection time"},
					{Type: "notify", Target: "game_session", Parameters: "player_disconnected", Description: "Notify game session of disconnection"},
					{Type: "cleanup", Target: "websocket", Parameters: nil, Description: "Clean up WebSocket resources"},
				},
				Description: "Cleanup after connection timeout",
				IsReversible: true,
			},
		},
		Description: "State machine for connection lifecycle management",
	}
}

// GetSessionStateMachine returns the state machine for SessionState
func GetSessionStateMachine() *StateMachine {
	return &StateMachine{
		EntityName:   "SessionState",
		StateField:   "connection_status",
		States: []string{
			string(ConnectionStatusDisconnected),
			string(ConnectionStatusReconnecting),
			string(ConnectionStatusConnected),
			string(ConnectionStatusTimeout),
		},
		InitialState: string(ConnectionStatusDisconnected),
		FinalStates:  []string{string(ConnectionStatusDisconnected)},
		Transitions: []StateTransition{
			{
				FromState:    string(ConnectionStatusDisconnected),
				ToState:      string(ConnectionStatusConnected),
				Event:        "session_established",
				Conditions:   []TransitionCondition{
					{Field: "player_authenticated", Operator: "eq", Value: true, Description: "Player must be authenticated"},
					{Field: "game_session_active", Operator: "eq", Value: true, Description: "Game session must be active"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "is_synchronized", Parameters: true, Description: "Mark as synchronized"},
					{Type: "set", Target: "sync_progress", Parameters: 1.0, Description: "Set sync progress to 100%"},
					{Type: "record", Target: "last_sync_at", Parameters: "NOW()", Description: "Record sync time"},
					{Type: "notify", Target: "game_session", Parameters: "player_ready", Description: "Notify game session player is ready"},
				},
				Description: "Session established and synchronized",
				IsReversible: true,
			},
			{
				FromState:    string(ConnectionStatusConnected),
				ToState:      string(ConnectionStatusDisconnected),
				Event:        "session_lost",
				Conditions:   []TransitionCondition{
					{Field: "connection_timeout", Operator: "eq", Value: true, Description: "Connection must be timed out"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "is_synchronized", Parameters: false, Description: "Mark as not synchronized"},
					{Type: "set", Target: "grace_period_until", Parameters: "NOW() + 2 MINUTES", Description: "Set reconnection grace period"},
					{Type: "record", Target: "disconnect_reason", Parameters: "connection_timeout", Description: "Record disconnect reason"},
					{Type: "notify", Target: "game_session", Parameters: "player_disconnected", Description: "Notify game session of disconnection"},
				},
				Description: "Session lost due to connection issues",
				IsReversible: true,
			},
			{
				FromState:    string(ConnectionStatusDisconnected),
				ToState:      string(ConnectionStatusReconnecting),
				Event:        "reconnect_attempt",
				Conditions:   []TransitionCondition{
					{Field: "can_reconnect", Operator: "eq", Value: true, Description: "Reconnection must be allowed"},
					{Field: "grace_period_active", Operator: "eq", Value: true, Description: "Grace period must be active"},
				},
				Actions: []TransitionAction{
					{Type: "increment", Target: "reconnect_attempts", Parameters: 1, Description: "Increment reconnection attempts"},
					{Type: "record", Target: "last_reconnect_attempt", Parameters: "NOW()", Description: "Record reconnection attempt"},
					{Type: "notify", Target: "game_session", Parameters: "player_reconnecting", Description: "Notify game session of reconnection"},
				},
				Description: "Attempt to reconnect session",
				IsReversible: true,
			},
		},
		Description: "State machine for session management",
	}
}

// GetRecoveryStateMachine returns the state machine for RecoveryAttempt
func GetRecoveryStateMachine() *StateMachine {
	return &StateMachine{
		EntityName:   "RecoveryAttempt",
		StateField:   "status",
		States: []string{
			"pending",
			"running",
			"success",
			"failed",
			"timeout",
			"cancelled",
		},
		InitialState: "pending",
		FinalStates:  []string{"success", "failed", "timeout", "cancelled"},
		Transitions: []StateTransition{
			{
				FromState:    "pending",
				ToState:      "running",
				Event:        "start_recovery",
				Conditions:   []TransitionCondition{
					{Field: "can_start", Operator: "eq", Value: true, Description: "Recovery can start"},
					{Field: "within_max_attempts", Operator: "eq", Value: true, Description: "Within max attempts"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "started_at", Parameters: "NOW()", Description: "Record start time"},
					{Type: "notify", Target: "user", Parameters: "recovery_started", Description: "Notify user of recovery start"},
					{Type: "log", Target: "system", Parameters: "Recovery attempt started", Description: "Log recovery start"},
				},
				Description: "Start recovery attempt",
				IsReversible: false,
			},
			{
				FromState:    "running",
				ToState:      "success",
				Event:        "recovery_complete",
				Conditions:   []TransitionCondition{
					{Field: "recovery_successful", Operator: "eq", Value: true, Description: "Recovery must be successful"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "completed_at", Parameters: "NOW()", Description: "Record completion time"},
					{Type: "set", Target: "duration", Parameters: "completed_at - started_at", Description: "Calculate duration"},
					{Type: "notify", Target: "user", Parameters: "recovery_successful", Description: "Notify user of success"},
					{Type: "record", Target: "success", Parameters: 1, Description: "Record recovery success"},
				},
				Description: "Recovery completed successfully",
				IsReversible: false,
			},
			{
				FromState:    "running",
				ToState:      "failed",
				Event:        "recovery_failed",
				Conditions:   []TransitionCondition{
					{Field: "recovery_failed", Operator: "eq", Value: true, Description: "Recovery must have failed"},
					{Field: "not_timeout", Operator: "eq", Value: true, Description: "Not a timeout"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "completed_at", Parameters: "NOW()", Description: "Record completion time"},
					{Type: "set", Target: "error_code", Parameters: "recovery_error", Description: "Record error code"},
					{Type: "set", Target: "error_message", Parameters: "error_description", Description: "Record error message"},
					{Type: "record", Target: "failure", Parameters: 1, Description: "Record recovery failure"},
				},
				Description: "Recovery failed",
				IsReversible: false,
			},
			{
				FromState:    "running",
				ToState:      "timeout",
				Event:        "recovery_timeout",
				Conditions:   []TransitionCondition{
					{Field: "duration_exceeded", Operator: "eq", Value: true, Description: "Duration must exceed timeout"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "completed_at", Parameters: "NOW()", Description: "Record completion time"},
					{Type: "set", Target: "error_code", Parameters: "TIMEOUT", Description: "Set timeout error code"},
					{Type: "set", Target: "error_message", Parameters: "Recovery operation timed out", Description: "Set timeout message"},
					{Type: "record", Target: "timeout", Parameters: 1, Description: "Record timeout occurrence"},
				},
				Description: "Recovery timed out",
				IsReversible: false,
			},
			{
				FromState:    "running",
				ToState:      "cancelled",
				Event:        "recovery_cancelled",
				Conditions:   []TransitionCondition{
					{Field: "user_cancelled", Operator: "eq", Value: true, Description: "User must have cancelled"},
				},
				Actions: []TransitionAction{
					{Type: "set", Target: "completed_at", Parameters: "NOW()", Description: "Record completion time"},
					{Type: "set", Target: "error_code", Parameters: "CANCELLED", Description: "Set cancelled error code"},
					{Type: "set", Target: "error_message", Parameters: "Recovery cancelled by user", Description: "Set cancelled message"},
				},
				Description: "Recovery cancelled by user",
				IsReversible: false,
			},
		},
		Description: "State machine for recovery attempt lifecycle",
	}
}

// GetAllStateMachines returns all defined state machines
func GetAllStateMachines() map[string]*StateMachine {
	return map[string]*StateMachine{
		"GameSession":        GetGameSessionStateMachine(),
		"RealTimeConnection": GetConnectionStateMachine(),
		"SessionState":       GetSessionStateMachine(),
		"RecoveryAttempt":    GetRecoveryStateMachine(),
	}
}

// StateTransitionManager manages state transitions for entities
type StateTransitionManager struct {
	stateMachines map[string]*StateMachine
	hooks          map[string][]TransitionHook
}

// TransitionHook represents a hook that runs before or after transitions
type TransitionHook struct {
	Name        string                    `json:"name"`
	Type        string                    `json:"type"` // before, after, error
	Handler     TransitionHookHandler     `json:"-"`
	Conditions  []TransitionCondition     `json:"conditions"`
	Priority    int                       `json:"priority"`
	Description string                    `json:"description"`
}

// TransitionHookHandler defines the signature for transition hooks
type TransitionHookHandler func(transition StateTransition, entity interface{}) error

// NewStateTransitionManager creates a new state transition manager
func NewStateTransitionManager() *StateTransitionManager {
	manager := &StateTransitionManager{
		stateMachines: GetAllStateMachines(),
		hooks:          make(map[string][]TransitionHook),
	}

	// Register default hooks
	manager.registerDefaultHooks()

	return manager
}

// registerDefaultHooks registers default transition hooks
func (stm *StateTransitionManager) registerDefaultHooks() {
	// Logging hooks for all transitions
	stm.RegisterHook("logging", "before", func(transition StateTransition, entity interface{}) error {
		// Log transition attempt
		return nil
	}, 0)

	stm.RegisterHook("logging", "after", func(transition StateTransition, entity interface{}) error {
		// Log successful transition
		return nil
	}, 0)

	// Security hooks
	stm.RegisterHook("security", "before", func(transition StateTransition, entity interface{}) error {
		if transition.RequiresAuth {
			// Validate authentication
		}
		return nil
	}, 100)
}

// RegisterHook registers a transition hook
func (stm *StateTransitionManager) RegisterHook(name, hookType string, handler TransitionHookHandler, priority int) {
	if stm.hooks[hookType] == nil {
		stm.hooks[hookType] = make([]TransitionHook, 0)
	}

	stm.hooks[hookType] = append(stm.hooks[hookType], TransitionHook{
		Name:     name,
		Type:     hookType,
		Handler:  handler,
		Priority: priority,
	})
}

// ExecuteTransition executes a state transition
func (stm *StateTransitionManager) ExecuteTransition(entityName, currentState, event string, entity interface{}, context map[string]interface{}) (*TransitionResult, error) {
	startTime := time.Now()

	// Get state machine for entity
	stateMachine, exists := stm.stateMachines[entityName]
	if !exists {
		return nil, fmt.Errorf("no state machine found for entity: %s", entityName)
	}

	// Find transition rule
	var transition *StateTransition
	for _, t := range stateMachine.Transitions {
		if t.FromState == currentState && t.Event == event {
			transition = &t
			break
		}
	}

	if transition == nil {
		return nil, fmt.Errorf("no transition found from state %s with event %s", currentState, event)
	}

	result := &TransitionResult{
		OldState:    currentState,
		TriggeredBy: event,
		Timestamp:   startTime,
		Actions:     make([]string, 0),
		Errors:      make([]TransitionError, 0),
	}

	// Execute pre-transition hooks
	if err := stm.executeHooks("before", *transition, entity); err != nil {
		result.Success = false
		result.Errors = append(result.Errors, TransitionError{
			Code:    "HOOK_ERROR",
			Message: err.Error(),
		})
		return result, nil
	}

	// Check transition conditions
	if err := stm.checkConditions(transition.Conditions, entity, context); err != nil {
		result.Success = false
		result.Errors = append(result.Errors, TransitionError{
			Code:    "CONDITION_FAILED",
			Message: err.Error(),
		})
		return result, nil
	}

	// Execute transition actions
	actions, err := stm.executeActions(transition.Actions, entity, context)
	if err != nil {
		result.Success = false
		result.Errors = append(result.Errors, TransitionError{
			Code:    "ACTION_ERROR",
			Message: err.Error(),
		})
		return result, nil
	}

	result.Actions = actions
	result.NewState = transition.ToState
	result.Success = true
	result.Duration = time.Since(startTime)

	// Execute post-transition hooks
	if err := stm.executeHooks("after", *transition, entity); err != nil {
		// Post-transition hooks shouldn't fail the transition, just log
		result.Errors = append(result.Errors, TransitionError{
			Code:    "POST_HOOK_ERROR",
			Message: err.Error(),
		})
	}

	return result, nil
}

// checkConditions validates transition conditions
func (stm *StateTransitionManager) checkConditions(conditions []TransitionCondition, entity interface{}, context map[string]interface{}) error {
	for _, condition := range conditions {
		// Implement condition checking logic based on entity reflection
		// This is a simplified implementation
		if !stm.evaluateCondition(condition, entity, context) {
			return fmt.Errorf("condition failed: %s", condition.Description)
		}
	}
	return nil
}

// evaluateCondition evaluates a single condition
func (stm *StateTransitionManager) evaluateCondition(condition TransitionCondition, entity interface{}, context map[string]interface{}) bool {
	// Simplified condition evaluation
	// In a real implementation, this would use reflection to access entity fields
	// and evaluate the condition based on the operator

	// For now, return true as a placeholder
	return true
}

// executeActions executes transition actions
func (stm *StateTransitionManager) executeActions(actions []TransitionAction, entity interface{}, context map[string]interface{}) ([]string, error) {
	var executedActions []string

	for _, action := range actions {
		actionName := fmt.Sprintf("%s:%s", action.Type, action.Target)

		// Execute action based on type
		err := stm.executeAction(action, entity, context)
		if err != nil {
			return nil, fmt.Errorf("failed to execute action %s: %w", actionName, err)
		}

		executedActions = append(executedActions, actionName)
	}

	return executedActions, nil
}

// executeAction executes a single action
func (stm *StateTransitionManager) executeAction(action TransitionAction, entity interface{}, context map[string]interface{}) error {
	// Implement action execution logic
	// This is a simplified implementation that would use reflection
	// to dynamically call methods on the entity

	switch action.Type {
	case "set":
		// Set field value
		return nil
	case "increment":
		// Increment field value
		return nil
	case "decrement":
		// Decrement field value
		return nil
	case "notify":
		// Send notification
		return nil
	case "log":
		// Log message
		return nil
	default:
		return fmt.Errorf("unknown action type: %s", action.Type)
	}
}

// executeHooks executes hooks of a specific type
func (stm *StateTransitionManager) executeHooks(hookType string, transition StateTransition, entity interface{}) error {
	hooks, exists := stm.hooks[hookType]
	if !exists {
		return nil
	}

	for _, hook := range hooks {
		if err := hook.Handler(transition, entity); err != nil {
			return fmt.Errorf("hook %s failed: %w", hook.Name, err)
		}
	}

	return nil
}

// GetValidTransitions returns all valid transitions from a given state
func (stm *StateTransitionManager) GetValidTransitions(entityName, currentState string) []StateTransition {
	stateMachine, exists := stm.stateMachines[entityName]
	if !exists {
		return nil
	}

	var validTransitions []StateTransition
	for _, transition := range stateMachine.Transitions {
		if transition.FromState == currentState {
			validTransitions = append(validTransitions, transition)
		}
	}

	return validTransitions
}

// CanTransition checks if a transition is allowed
func (stm *StateTransitionManager) CanTransition(entityName, currentState, event string) bool {
	transitions := stm.GetValidTransitions(entityName, currentState)
	for _, transition := range transitions {
		if transition.Event == event {
			return true
		}
	}
	return false
}

// GetStateDiagram generates a simple text representation of the state diagram
func (stm *StateTransitionManager) GetStateDiagram(entityName string) string {
	stateMachine, exists := stm.stateMachines[entityName]
	if !exists {
		return fmt.Sprintf("No state machine found for entity: %s", entityName)
	}

	var diagram strings.Builder
	diagram.WriteString(fmt.Sprintf("State Diagram for %s\n", entityName))
	diagram.WriteString("=====================================\n\n")

	// List states
	diagram.WriteString("States:\n")
	for _, state := range stateMachine.States {
		diagram.WriteString(fmt.Sprintf("  - %s", state))
		if state == stateMachine.InitialState {
			diagram.WriteString(" (initial)")
		}
		for _, finalState := range stateMachine.FinalStates {
			if state == finalState {
				diagram.WriteString(" (final)")
				break
			}
		}
		diagram.WriteString("\n")
	}

	// List transitions
	diagram.WriteString("\nTransitions:\n")
	for _, transition := range stateMachine.Transitions {
		diagram.WriteString(fmt.Sprintf("  %s --[%s]--> %s",
			transition.FromState, transition.Event, transition.ToState))
		if transition.RequiresAuth {
			diagram.WriteString(" (requires auth)")
		}
		diagram.WriteString("\n")
	}

	return diagram.String()
}