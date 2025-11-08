<!--
Sync Impact Report:
- Version change: none (initial constitution)
- Added sections: Browser-First Architecture, Test-Driven Development, Observable User Experience, Deterministic State Management, Progressive Enhancement, Technical Constraints, Development Workflow, Governance
- Updated templates:
  ✅ .specify/templates/plan-template.md (Constitution Check section)
  ✅ .specify/templates/spec-template.md (Success Criteria section)
  ✅ .specify/templates/tasks-template.md (no changes needed)
- Command files validated: ✅ .claude/commands/speckit.plan.md, ✅ .claude/commands/speckit.analyze.md
- Follow-up TODOs: None
-->

# El Dorado Score Keeper Constitution

## Core Principles

### I. Browser-First Architecture

The application runs entirely in the browser as a progressive web app. All game state management, scoring logic, and data persistence must work offline-first using IndexedDB. No server-side runtime is required for core functionality. Multi-player synchronization uses browser-native APIs (BroadcastChannel, localStorage) with optional server relay when available.

### II. Test-Driven Development (NON-NEGOTIABLE)

All features MUST be implemented test-first using TDD methodology. Write failing tests, then implement code to make tests pass. Red-Green-Refactor cycle is strictly enforced. Unit tests require 95%+ coverage on reducers/selectors. Integration tests must validate IndexedDB operations and cross-tab synchronization. Property-based tests verify state machine determinism.

### III. Observable User Experience

All user interactions, errors, and performance events MUST be captured through structured telemetry. Use the pluggable browser observability system (New Relic Browser agent with log fallback). NEVER ship personally identifiable information. Keep payloads lightweight and ensure graceful degradation when telemetry is disabled or fails to load.

### IV. Deterministic State Management

Game state MUST be managed through an append-only event log with deterministic reducers. State reconstruction from events MUST produce identical results regardless of timing or intermediate snapshots. Event sourcing enables time travel, undo/redo, and cross-tab synchronization. All state transitions MUST be reproducible and testable.

### V. Progressive Enhancement

Core game functionality MUST work without any external dependencies or network connectivity. Enhanced features (analytics, multiplayer sync, theme switching) MUST layer on top without breaking the base experience. Mobile-first responsive design is mandatory. All interactions MUST be accessible via keyboard and screen reader.

## Technical Constraints

### Technology Stack

- **Framework**: Next.js 15 with App Router
- **UI**: React 19 with Radix UI primitives and custom theme tokens
- **Styling**: Sass modules with token-driven design system
- **State**: Custom event-sourcing with IndexedDB persistence
- **Testing**: Vitest for unit/integration, Playwright for E2E
- **Language**: TypeScript with strict mode enabled

### Performance Requirements

- Bundle size MUST stay under 250KB gzipped for initial load
- First paint MUST occur within 1.5 seconds on 3G networks
- Game state rehydration MUST complete within 100ms with 5k events
- All animations MUST maintain 60fps on target devices

### Data Privacy & Security

- No personal data collected or transmitted without explicit consent
- All game state stored locally in IndexedDB with user-controlled export/import
- Optional telemetry MUST be disabled by default in development
- No third-party cookies or tracking pixels

## Development Workflow

### Code Quality Gates

- All PRs MUST pass linting, formatting, type checking, and automated tests
- Code coverage MUST NOT decrease below established thresholds
- Bundle analysis MUST be run on significant UI changes
- Accessibility MUST be validated using automated tools and manual testing

### Feature Development Process

1. Create feature specification using `/speckit.specify`
2. Generate implementation plan using `/speckit.plan`
3. Execute tasks using `/speckit.implement`
4. Verify constitution compliance at each phase
5. Deploy to staging for user acceptance testing
6. Merge to main after automated production deployment

### Review Requirements

- Every feature MUST be independently testable as specified in user stories
- Complex state changes MUST include property-based tests
- UI components MUST include accessibility tests
- Performance regressions MUST be justified with documented rationale

## Governance

This constitution supersedes all other development practices and guidelines. Amendments require:

1. Documentation of proposed changes with impact analysis
2. Version bump according to semantic versioning rules
3. Approval through pull request review process
4. Migration plan for any breaking changes
5. Update to all dependent templates and documentation

All development work MUST verify compliance with relevant constitution sections. Complexity not justified by explicit user value is prohibited. For runtime development guidance, consult project documentation in `docs/` directory and feature-specific ADRs.

**Version**: 1.0.0 | **Ratified**: 2025-11-02 | **Last Amended**: 2025-11-02
