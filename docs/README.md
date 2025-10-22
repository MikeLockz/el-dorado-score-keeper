# Documentation

This directory contains comprehensive documentation for the El Dorado Score Keeper project.

## Documentation Structure

### 🏗️ Architecture & Design
- **[`architecture/`](architecture/)** - System architecture, navigation, and state management
  - [`navigation.md`](architecture/navigation.md) - Application navigation patterns
  - [`ROUTES.md`](architecture/ROUTES.md) - Complete routing documentation
  - [`STATE.md`](architecture/STATE.md) - State management architecture

### 🎯 Core Features
- **[`features/single-player/`](features/single-player/)** - Single player game mode
  - [`SINGLE_PLAYER.md`](features/single-player/SINGLE_PLAYER.md) - Single player feature overview
  - [`SP_RULES.md`](features/single-player/SP_RULES.md) - Game rules and logic
  - [`GAME_STATISTICS.md`](features/single-player/GAME_STATISTICS.md) - Statistics tracking

- **[`features/multiplayer/`](features/multiplayer/)** - Multiplayer functionality
  - [`MULTIPLAYER.md`](features/multiplayer/MULTIPLAYER.md) - Multiplayer overview
  - [`MULTIPLAYER_PROTOCOL.md`](features/multiplayer/MULTIPLAYER_PROTOCOL.md) - Communication protocol
  - [`MULTIPLAYER_SERVER.md`](features/multiplayer/MULTIPLAYER_SERVER.md) - Server implementation

- **[`features/players/`](features/players/)** - Player and roster management
  - [`ROSTERS.md`](features/players/ROSTERS.md) - Roster system documentation
  - [`PLAYER_ENHANCEMENTS.md`](features/players/PLAYER_ENHANCEMENTS.md) - Player feature improvements
  - [`PLAYER_DATA_GENERATOR.md`](features/players/PLAYER_DATA_GENERATOR.md) - Test data generation

- **[`features/ui/`](features/ui/)** - User interface and experience
  - [`SINGLE_PLAYER_UI_MOBILE.md`](features/ui/SINGLE_PLAYER_UI_MOBILE.md) - Mobile UI considerations
  - [`MOBILE_LAYOUT.md`](features/ui/MOBILE_LAYOUT.md) - Mobile layout patterns
  - [`ui-removal-template.md`](features/ui/ui-removal-template.md) - UI component removal template

### 🔧 Implementation
- **[`implementation/`](implementation/)** - Implementation plans and technical specifications
  - Feature implementation documents prefixed with `IMPLEMENT_`
  - Technical specifications and architecture decisions

### 🏛️ Architecture Decision Records
- **[`ADR/`](ADR/)** - Formal architecture decision records
  - Historical decisions and their rationale
  - Evolution of system architecture

### 📊 Infrastructure & Operations
- **[`infrastructure/`](infrastructure/)** - Infrastructure, monitoring, and deployment
  - [`DATABASE_SCHEMA.md`](infrastructure/DATABASE_SCHEMA.md) - IndexedDB schema and migrations
  - [`PERSISTENCE.md`](infrastructure/PERSISTENCE.md) - Data persistence implementation
  - [`OBSERVABILITY.md`](infrastructure/OBSERVABILITY.md) - Monitoring and telemetry
  - [`ANALYTICS.md`](infrastructure/ANALYTICS.md) - Analytics implementation

### 🧪 Testing & Quality
- **[`testing/`](testing/)** - Testing strategies and plans
  - [`TEST_PLAN.md`](testing/TEST_PLAN.md) - Comprehensive testing strategy
  - [`FIX_TESTS.md`](testing/FIX_TESTS.md) - Test fixing guidelines

### 📋 Planning & Research
- **[`planning/`](planning/)** - Project planning and roadmaps
  - Feature planning documents
  - Implementation timelines and milestones

- **[`research/`](research/)** - Research and discovery work
  - Feasibility studies
  - Technical research and investigation

### ♿ Accessibility
- **[`accessibility/`](accessibility/)** - Accessibility documentation
  - Accessibility reviews and improvements
  - Compliance documentation

### 🔄 Migration Guides
- **[`migrations/`](migrations/)** - System migration documentation
  - Styling migration phases and logs
  - Migration checklists and communication

### 📈 Tracking & Analytics
- **[`tracking/`](tracking/)** - Analytics tracking implementation
  - New Relic browser integration
  - Performance tracking

## Quick Links

- **New Contributors**: Start with [`architecture/`](architecture/) and [`features/`](features/)
- **Developers**: See [`implementation/`](implementation/) for technical specs
- **Operations**: Check [`infrastructure/`](infrastructure/) for deployment and monitoring
- **QA/Testing**: Review [`testing/`](testing/) for test strategies

## Documentation Standards

- Use clear, descriptive filenames
- Keep documentation up-to-date with implementation changes
- Cross-reference related documents
- Include examples and code snippets where helpful