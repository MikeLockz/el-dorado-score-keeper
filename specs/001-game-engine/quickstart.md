# Quickstart Guide - Standalone Game Engine Service

**Version**: 1.0.0
**Last Updated**: 2025-11-02

## Overview

This quickstart guide covers the setup and basic usage of the El Dorado multiplayer game engine, including server setup, client integration, and development workflows.

## Prerequisites

- **Go 1.21+** for server development
- **PostgreSQL 14+** for data storage
- **Node.js 18+** for client development
- **Modern web browser** with WebSocket support

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App     │    │  Multiplayer    │    │   Database      │
│  (React/Next.js)  │◄──►│   Game Engine   │◄──►│   PostgreSQL   │
│                 │    │   (Go Server)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Server Setup

### 1. Clone and Build

```bash
git clone https://github.com/your-org/el-dorado-game-engine.git
cd el-dorado-game-engine

# Build the Go server
go build -o bin/engine ./cmd/server
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb eldorado_multiplayer

# Run migrations
psql eldorado_multiplayer < migrations/schema.sql
```

### 3. Configuration

Create `.env` file:

```env
# Database
DATABASE_URL=postgresql://localhost/eldorado_multiplayer
DATABASE_MAX_CONNECTIONS=20

# Server
SERVER_PORT=8080
SERVER_HOST=localhost
SERVER_MODE=production

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRY=24h

# Game Settings
MAX_CONCURRENT_GAMES=1000
MAX_PLAYERS_PER_GAME=10
GAME_TIMEOUT_MINUTES=30
```

### 4. Run the Server

```bash
# Development mode
./bin/engine --config .env --dev

# Production mode
./bin/engine --config .env
```

The server will start on `http://localhost:8080`

## Client Integration

### 1. Install Dependencies

```bash
npm install @eldorado/game-engine-client
```

### 2. Initialize Client

```typescript
import { MultiplayerClient, PlayerIdentity } from '@eldorado/game-engine-client';

// Initialize client
const client = new MultiplayerClient({
  serverUrl: 'ws://localhost:8080',
  apiBaseUrl: 'http://localhost:8080/v1'
});
```

### 3. Create Player Identity

```typescript
// Generate cryptographic key pair
const identity = await PlayerIdentity.create();

// Save keys to browser storage
await identity.saveToBrowser();

// Get player profile
const profile = await client.createProfile({
  publicKey: identity.publicKey,
  playerName: 'PlayerName'
});
```

### 4. Connect to Game

```typescript
// Authenticate with stored identity
await client.authenticate(identity);

// Join existing game
const game = await client.joinGame({
  gameCode: 'ABCDEF',
  playerName: 'PlayerName'
});

// OR create new game
const newGame = await client.createGame({
  name: 'My Game',
  maxPlayers: 4,
  gameConfig: {
    // Game-specific settings
  }
});
```

### 5. Game Interaction

```typescript
// Listen for game updates
game.on('stateUpdate', (state) => {
  console.log('Game state updated:', state);
});

game.on('playerJoined', (player) => {
  console.log('Player joined:', player.name);
});

game.on('actionProcessed', (action) => {
  console.log('Action processed:', action);
});

// Take turn
await game.playCard({
  cardId: 'card-123',
  targetPlayer: 'player-456',
  payment: 5
});
```

## Development Workflow

### 1. Server Development

```bash
# Run tests
go test ./...

# Run with coverage
go test -cover ./...

# Run integration tests
go test -tags=integration ./...

# Run load tests
go test -tags=load ./...
```

### 2. Client Development

```bash
# Install development dependencies
npm install --save-dev

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

### 3. Local Development Setup

```bash
# Start server (development mode)
make dev-server

# Start client development server
npm run dev

# Run database migrations
make migrate

# Seed test data
make seed
```

## API Usage Examples

### Authentication

```typescript
// Login with existing keys
const authResponse = await client.login({
  publicKey: 'your-public-key',
  signature: 'challenge-signature'
});

console.log('JWT Token:', authResponse.token);
console.log('Player Profile:', authResponse.playerProfile);
```

### Game Management

```typescript
// List available games
const games = await client.listGames({
  status: 'waiting',
  limit: 50
});

console.log('Available games:', games);

// Get game details
const gameDetails = await client.getGame('game-id');
console.log('Game details:', gameDetails);

// Start game (host only)
await game.start({
  moderationConfig: {
    timeoutSeconds: 60,
    votingEnabled: true
  }
});
```

### Player Actions

```typescript
// Create roster
await game.createRoster({
  rosterData: {
    players: [
      { id: 'player-1', selections: [...] },
      { id: 'player-2', selections: [...] }
    ]
  }
});

// Initiate timeout vote
await game.initiateVote({
  targetPlayerId: 'player-3',
  voteType: 'skip_turn'
});

// Leave game
await game.leaveGame({
  reason: 'voluntary'
});
```

### Statistics and Profiles

```typescript
// Get player statistics
const stats = await client.getPlayerStatistics();
console.log('Player stats:', stats);

// Update profile
await client.updateProfile({
  playerName: 'NewPlayerName'
});

// Get action history
const history = await client.getActionHistory({
  playerId: 'player-id',
  limit: 100
});
```

## Testing

### Server Testing

```bash
# Unit tests
go test ./internal/auth/...
go test ./internal/game/...
go test ./internal/storage/...

# Integration tests
go test -tags=integration ./test/integration/...

# Load tests
go test -tags=load ./test/load/...

# End-to-end tests
go test -tags=e2e ./test/e2e/...
```

### Client Testing

```bash
# Unit tests
npm test -- --coverage

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Load tests
npm run test:load
```

## Monitoring and Debugging

### Server Monitoring

```bash
# Health check
curl http://localhost:8080/health

# Metrics endpoint
curl http://localhost:8080/metrics

# Active games
curl http://localhost:8080/api/games
```

### Client Debugging

```typescript
// Enable debug logging
client.setDebugMode(true);

// Connection status
console.log('Connection status:', client.isConnected());

// Current game
console.log('Current game:', client.getCurrentGame());

// Player identity
console.log('Player identity:', client.getIdentity());
```

### Database Debugging

```sql
-- View active games
SELECT * FROM games WHERE status = 'active';

-- View player actions
SELECT * FROM player_actions
WHERE game_id = 'your-game-id'
ORDER BY created_at DESC;

-- View game events
SELECT COUNT(*) as event_count,
       event_type,
       MIN(created_at) as first_event,
       MAX(created_at) as last_event
FROM game_events
WHERE game_id = 'your-game-id'
GROUP BY event_type;
```

## Production Deployment

### 1. Build and Package

```bash
# Build server binary
GOOS=linux go build -o bin/engine-linux ./cmd/server

# Create Docker image
docker build -t eldorado-game-engine:latest .

# Push to registry
docker push your-registry/eldorado-game-engine:latest
```

### 2. Database Migration

```bash
# Run production migrations
./bin/engine migrate --config production.env

# Validate data consistency
./bin/engine validate --config production.env
```

### 3. Environment Configuration

```yaml
# docker-compose.yml
version: '3.8'
services:
  engine:
    image: eldorado-game-engine:latest
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://db:5432/eldorado_multiplayer
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=eldorado_multiplayer
      - POSTGRES_USER=eldorado
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### 4. Monitoring Setup

```bash
# Install monitoring
kubectl apply -f k8s/monitoring/

# Configure alerts
kubectl apply -f k8s/alerts/

# Set up logging
kubectl apply -f k8s/logging/
```

## Common Issues

### Connection Problems

**Issue**: WebSocket connection fails
**Solution**: Check JWT token validity and server connectivity

```typescript
// Debug connection
try {
  await client.connect();
} catch (error) {
  console.error('Connection failed:', error);
  console.log('JWT Token:', client.getToken());
  console.log('Server URL:', client.getServerUrl());
}
```

### Authentication Issues

**Issue**: Invalid signature errors
**Solution**: Verify key storage and generation

```typescript
// Debug authentication
const identity = await PlayerIdentity.loadFromBrowser();
if (!identity) {
  console.error('No identity found in browser storage');
}

const isValid = await identity.validate();
console.log('Identity valid:', isValid);
```

### Performance Issues

**Issue**: Slow game updates
**Solution**: Check server metrics and optimize database queries

```sql
-- Slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC;
```

## Next Steps

1. **Complete Setup**: Finish server and client configuration
2. **Run Tests**: Verify functionality with comprehensive testing
3. **Develop Features**: Implement game-specific logic
4. **Deploy**: Set up production environment
5. **Monitor**: Configure monitoring and alerting

## Support

- **Documentation**: Full API documentation available at `/docs/api`
- **Examples**: Complete working examples in `/examples`
- **Community**: Join discussions on GitHub Discussions
- **Issues**: Report bugs via GitHub Issues

## License

This project is licensed under the MIT License. See LICENSE file for details.