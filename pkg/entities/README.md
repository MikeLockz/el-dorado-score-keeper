# Multiplayer Game Engine Entities

This package contains comprehensive Go struct definitions and related infrastructure for a multiplayer game engine based on the El Dorado card game. The entities are designed to support real-time multiplayer gameplay with cryptographic identity verification, robust state management, and graceful error handling.

## Overview

The entity system is organized into several logical categories:

1. **Core Entities**: Game Session, Player Profile, Player Action, Game State, Multiplayer Roster, Player Statistics
2. **Identity Entities**: Cryptographic Key Pair, Authentication Token, Key Backup, Recovery Phrase
3. **Communication Entities**: Real-Time Connection, Event Stream, State Hash
4. **Session Management**: Session State, Event Receipt Tracking, Reconnection Session
5. **Error Handling**: Error Handler, Graceful Degradation, Error Recovery, Recovery Attempt

## File Structure

```
pkg/entities/
├── types.go                    # Common types, enums, and utility functions
├── core_entities.go           # Core game entities
├── identity_entities.go       # Identity and authentication entities
├── communication_entities.go  # Real-time communication entities
├── session_management_entities.go # Session and reconnection entities
├── error_handling_entities.go # Error handling and recovery entities
├── validation.go              # Comprehensive validation rules and constraints
├── database_schema.go         # Database schema definitions and indexing
├── relationships.go           # Entity relationships and foreign keys
├── state_transitions.go       # State machine definitions and transition logic
└── README.md                  # This documentation
```

## Core Entities

### GameSession

Represents an individual multiplayer game instance with complete lifecycle management.

**Key Features:**

- Supports 2-10 players per session
- Host-controlled session lifecycle
- Configurable moderation systems
- Real-time state synchronization
- Turn-based gameplay with timeout handling
- Persistent game history and audit trails

### PlayerProfile

Server-side multiplayer identity with cryptographic key pair management.

**Key Features:**

- Cryptographic key pair generation and management
- Player statistics tracking
- Achievement system
- Skill rating calculations
- Cross-session identity persistence

### PlayerAction

Individual moves or decisions made by players with cryptographic verification.

**Key Features:**

- Cryptographic action signing
- Sequence-based processing
- Permanent action storage
- Timeout handling
- Validation and verification

### GameState

Complete snapshot of all game data with integrity verification.

**Key Features:**

- SHA-256 state hashing
- Version control with sequence numbers
- JSONB storage for flexible data
- Integrity verification
- Audit trail support

### MultiplayerRoster

Team composition created specifically for multiplayer games.

**Key Features:**

- Flexible player ordering
- Player type management (human/bot)
- Game-specific configuration
- Persistent roster management

### PlayerStatistics

Comprehensive player performance tracking and analytics.

**Key Features:**

- Core gameplay metrics
- Social statistics
- Achievement tracking
- Skill rating system
- Performance analytics

## Identity Entities

### CryptographicKeyPair

Locally-generated RSA key pairs for player identity and action signing.

**Key Features:**

- RSA-2048 key generation (minimum)
- PEM format storage
- Key versioning and rotation
- Usage tracking and limits
- Secure backup integration

### AuthenticationToken

Secure credentials for player authentication and authorization.

**Key Features:**

- SHA-256 token hashing
- Device-specific tokens
- Multi-factor authentication support
- Session management
- Revocation and expiration

### KeyBackup

Secure backup mechanisms for cryptographic key recovery.

**Key Features:**

- AES-256-GCM encryption
- Multiple backup types (encrypted, QR code, recovery phrase)
- Device-specific backups
- Secure recovery process
- Backup verification

## Communication Entities

### RealTimeConnection

Active communication channels with progressive fallback support.

**Key Features:**

- WebSocket/SSE/Polling support
- Automatic fallback chains
- Quality metrics and monitoring
- Connection health checking
- Graceful degradation

### EventStream

Server-side push mechanism for real-time game updates.

**Key Features:**

- Event filtering and routing
- Performance optimization
- Buffer management
- Priority-based delivery
- Compression support

### StateHash

Cryptographic verification of client game state integrity.

**Key Features:**

- SHA-256 state hashing
- Component-based verification
- Cross-client consistency checking
- Desync detection
- Recovery coordination

## Session Management

### SessionState

Connection and synchronization status for each player.

**Key Features:**

- Real-time connection tracking
- Synchronization progress monitoring
- Reconnection support
- Quality metrics
- Turn management

### EventReceiptTracking

Server-side record of event delivery confirmation.

**Key Features:**

- Event delivery verification
- Retry mechanisms
- Performance tracking
- Priority queuing
- Expiration handling

### ReconnectionSession

Temporary preservation of player state during disconnections.

**Key Features:**

- State snapshot management
- Graceful reconnection
- Event miss tracking
- Security verification
- Timeout handling

## Error Handling

### ErrorHandler

Hierarchical system for managing different error types.

**Key Features:**

- Pattern-based error matching
- Priority-based handling
- Circuit breaker support
- Notification integration
- Automatic retry logic

### GracefulDegradation

Progressive functionality reduction while maintaining core gameplay.

**Key Features:**

- Multi-level degradation
- Automatic quality adjustment
- Performance-based triggers
- Recovery mechanisms
- Feature toggling

### ErrorRecovery

User-friendly mechanisms for recovering from error conditions.

**Key Features:**

- Multiple recovery strategies
- User interaction support
- Progress tracking
- Success/failure handling
- Analytics integration

## Database Schema

The database schema is designed for PostgreSQL with the following key considerations:

### Performance Optimization

- Comprehensive indexing strategy
- Partial indexes for common queries
- JSONB storage for flexible data
- Efficient foreign key relationships

### Data Integrity

- Foreign key constraints with proper cascading
- Check constraints for data validation
- Unique constraints for key identifiers
- Referential integrity protection

### Scalability

- Horizontal scaling support
- Query optimization
- Efficient data types
- Minimal redundancy

## Validation System

The validation system provides comprehensive data integrity checking:

### Validation Types

- Field-level validation
- Entity-level validation
- Cross-entity validation
- Business rule validation

### Validation Rules

- String length and format validation
- Numeric range validation
- Enum value validation
- Relationship integrity checks

### Error Reporting

- Detailed error messages
- Error categorization
- Localization support
- User-friendly feedback

## State Transitions

The state transition system provides robust lifecycle management:

### State Machines

- Game session lifecycle
- Connection state management
- Recovery process flow
- Error handling workflow

### Transition Features

- Condition-based transitions
- Action execution
- Hook system
- Timeout handling
- Security validation

### Monitoring

- Transition logging
- Performance tracking
- Error detection
- Analytics integration

## Usage Examples

### Creating a New Game Session

```go
session := &entities.GameSession{
    RoomID:         "abc123",
    Name:           "Friendly Game",
    MaxPlayers:     4,
    ModerationType: entities.ModerationTypeHostControl,
}

// Validate
if err := entities.ValidateAll(session); err != nil {
    return err
}

// Save to database
if err := db.Create(session).Error; err != nil {
    return err
}
```

### Authenticating a Player

```go
keyPair, err := entities.GenerateRSAKeyPair(2048)
if err != nil {
    return err
}

player := &entities.PlayerProfile{
    DisplayName: "Alice",
    PublicKey:   keyPair.PublicKey,
    PlayerType:  entities.PlayerTypeHuman,
}

// Validate and save
if err := entities.ValidateAll(player); err != nil {
    return err
}
```

### Handling State Transitions

```go
manager := entities.NewStateTransitionManager()
result, err := manager.ExecuteTransition(
    "GameSession",
    entities.GamePhaseSetup,
    "start_bidding",
    gameSession,
    map[string]interface{}{
        "player_count": 4,
        "roster_configured": true,
    },
)

if err != nil {
    // Handle error
}

if result.Success {
    // Transition completed successfully
    fmt.Printf("Game session transitioned from %s to %s\n",
        result.OldState, result.NewState)
}
```

## Security Considerations

### Cryptographic Security

- RSA-2048 minimum key size
- SHA-256 hashing algorithms
- AES-256-GCM encryption
- Secure random number generation

### Data Protection

- Input validation and sanitization
- SQL injection prevention
- XSS protection
- Rate limiting

### Access Control

- Authentication token validation
- Authorization checks
- Session management
- Multi-factor authentication support

## Performance Considerations

### Database Optimization

- Strategic indexing
- Query optimization
- Connection pooling
- Batch operations

### Memory Management

- Efficient data structures
- JSON parsing optimization
- Connection pooling
- Resource cleanup

### Network Optimization

- Message compression
- Binary protocols
- Connection reuse
- Adaptive quality settings

## Monitoring and Analytics

### Performance Metrics

- Connection quality monitoring
- State transition tracking
- Error rate monitoring
- Resource usage tracking

### Business Metrics

- Player engagement
- Game completion rates
- System performance
- User satisfaction

### Health Checks

- Database connectivity
- Service availability
- Performance thresholds
- Automated alerts

## Testing

### Unit Testing

- Entity validation testing
- State transition testing
- Business logic testing
- Error condition testing

### Integration Testing

- Database integration
- API endpoint testing
- State machine integration
- Cross-entity interactions

### Performance Testing

- Load testing
- Stress testing
- Benchmarking
- Scalability testing

## Best Practices

### Code Organization

- Follow Go conventions
- Use dependency injection
- Implement interfaces
- Document public APIs

### Error Handling

- Use structured errors
- Provide context
- Log appropriately
- Handle gracefully

### Security

- Validate all inputs
- Use secure defaults
- Implement least privilege
- Regular security reviews

### Performance

- Profile before optimizing
- Use efficient algorithms
- Minimize memory allocations
- Cache appropriately

## Contributing

When contributing to this package:

1. Follow the existing code style and conventions
2. Add comprehensive tests for new functionality
3. Update documentation for any changes
4. Ensure all validation rules are covered
5. Test state transitions thoroughly
6. Verify database schema compatibility

## License

This package is part of the El Dorado Score Keeper project and follows the same licensing terms.

## Support

For questions, issues, or contributions, please refer to the main project documentation or submit an issue through the project's issue tracker.
