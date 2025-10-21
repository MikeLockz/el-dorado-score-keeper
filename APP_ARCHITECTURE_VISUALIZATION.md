# App Architecture Overview

## High-Level Architecture & Data Flow

```mermaid
flowchart TB
    subgraph "El Dorado Score Keeper"
        subgraph "Frontend (Next.js)"
            Games[Games Management]
            Players[Players Statistics]
            Scorecards[Scorecards Tracking]
            Landing[Landing Page]
            SinglePlayer[Single Player Mode]
        end

        subgraph "State Management"
            Events[Events System]
            Reducers[Reducers Logic]
            Instance[Instance Manager]
            Selectors[Selectors]
            Persistence[Persistence Layer]
        end

        subgraph "Data Layer"
            EventSchema[Events Schema]
            PlayerSchema[Players Schema]
            GameSchema[Games Schema]
        end

        subgraph "Development Tools"
            GameGen[Game Generator]
            PlayerGen[Player Generator]
        end

        subgraph "Storage"
            DB[(IndexedDB)]
            LocalStorage[(Local Storage)]
        end
    end

    %% Data Flow Arrows
    Games --> |"User Actions"| Events
    Players --> |"User Actions"| Events
    Scorecards --> |"User Actions"| Events
    SinglePlayer --> |"User Actions"| Events
    Landing --> |"User Actions"| Events

    Events --> |"Creates Events"| Reducers
    Reducers --> |"Transforms State"| Instance
    Instance --> |"Holds AppState"| Selectors
    Selectors --> |"Provides Data"| Games
    Selectors --> |"Provides Data"| Players
    Selectors --> |"Provides Data"| Scorecards
    Selectors --> |"Provides Data"| SinglePlayer
    Selectors --> |"Provides Data"| Landing

    Instance --> |"Auto-Snapshots"| Persistence
    Persistence --> |"IndexedDB"| DB
    Persistence --> |"LocalStorage"| LocalStorage
    DB --> |"Rehydrate"| Instance
    LocalStorage --> |"Fallback"| Instance

    EventSchema --> |"Validates"| Events
    PlayerSchema --> |"Validates"| Instance
    GameSchema --> |"Validates"| Instance

    GameGen --> |"Generates Test Data"| Instance
    PlayerGen --> |"Generates Test Data"| Instance
```

## Frontend Architecture & Component Data Flow

```mermaid
flowchart TD
    subgraph "Frontend Components"
        subgraph "Pages"
            GamesPage["games/page.tsx"]
            PlayerStats["players/[playerId]/statistics/"]
            ScorecardSummary["scorecard/[scorecardId]/summary/"]
            SinglePlayerApp["single-player/SinglePlayerApp.tsx"]
            LandingPage["landing/page.tsx"]
        end

        subgraph "Modals"
            DeleteModal["@modal/delete/DeleteGameModalClient.tsx"]
            RestoreModal["@modal/restore/RestoreGameModalClient.tsx"]
        end

        subgraph "Components"
            AdvancedInsights["AdvancedInsightsPanel.tsx"]
            ScorecardSummaryComp["ScorecardSummaryPageClient.tsx"]
            SinglePlayerNew["SinglePlayerNewPageClient.tsx"]
        end
    end

    subgraph "State Management"
        EventsSystem[Events System]
        Selectors[Selectors]
    end

    %% Component Data Flow
    GamesPage --> |"dispatches delete events"| EventsSystem
    GamesPage --> |"dispatches restore events"| EventsSystem
    GamesPage --> |"reads game data"| Selectors

    PlayerStats --> |"reads player stats"| Selectors
    ScorecardSummary --> |"reads scorecard data"| Selectors
    SinglePlayerApp --> |"dispatches game events"| EventsSystem
    SinglePlayerApp --> |"reads game state"| Selectors
    LandingPage --> |"reads app state"| Selectors

    %% Component Relationships
    GamesPage --> DeleteModal
    GamesPage --> RestoreModal
    PlayerStats --> AdvancedInsights
    ScorecardSummary --> ScorecardSummaryComp
    SinglePlayerApp --> SinglePlayerNew

    %% Modal Interactions
    DeleteModal --> |"confirm delete"| EventsSystem
    RestoreModal --> |"confirm restore"| EventsSystem

    %% Component Interactions
    AdvancedInsights --> |"filter data"| Selectors
    ScorecardSummaryComp --> |"calculate scores"| Selectors
    SinglePlayerNew --> |"create new game"| EventsSystem
```

## State Management Architecture & Data Flow

```mermaid
flowchart TD
    subgraph "State Management System"
        subgraph "Core Components"
            EventsSystem["Events System<br/>(lib/state/events.ts)"]
            ReducerLogic["Reducer Logic<br/>(lib/state/reducer.ts)"]
            InstanceManager["Instance Manager<br/>(lib/state/instance.ts)"]
            SelectorsSystem["Selectors System<br/>(lib/state/selectors.ts)"]
        end

        subgraph "Persistence Layer"
            SnapshotSystem["Snapshot System<br/>(lib/state/persistence/sp-snapshot.ts)"]
            DB[(IndexedDB)]
            LocalStorage[(Local Storage)]
        end

        subgraph "Storage"
            EventStore[Event Store]
            StateStore[State Store]
            SnapshotStore[Snapshot Store]
        end
    end

    %% Primary Event Flow (Event Sourcing)
    UIAction[UI Action] --> |"1. User Interaction"| EventsSystem
    EventsSystem --> |"2. makeEvent()"| ReducerLogic
    ReducerLogic --> |"3. reduce(state, event)"| InstanceManager
    InstanceManager --> |"4. Holds AppState"| SelectorsSystem
    SelectorsSystem --> |"5. Memoized reads"| UIUpdate[UI Update]

    %% Event Storage Flow
    ReducerLogic --> |"stores event"| EventStore
    InstanceManager --> |"append()"| EventStore

    %% State Persistence Flow
    InstanceManager --> |"6. Auto-snapshot"| SnapshotSystem
    SnapshotSystem --> |"IndexedDB adapter"| DB
    SnapshotSystem --> |"LocalStorage adapter"| LocalStorage
    SnapshotSystem --> |"snapshot state"| SnapshotStore

    %% Rehydration Flow
    DB --> |"7. Load snapshots"| SnapshotStore
    LocalStorage --> |"8. Fallback load"| SnapshotStore
    SnapshotStore --> |"rehydrate()"| InstanceManager
    EventStore --> |"replay events"| InstanceManager

    %% Cross-tab Synchronization
    InstanceManager -.-> |"BroadcastChannel events"| CrossTab[Cross-tab Sync]
    CrossTab -.-> |"receive events"| InstanceManager

    %% State Queries
    InstanceManager --> |"current state"| StateStore
    StateStore --> |"persist current"| InstanceManager

    %% Event Categories
    subgraph "Event Types"
        RosterEvents[Roster Events]
        PlayerEvents[Player Events]
        ScoreEvents[Score Events]
        SinglePlayerEvents[Single Player Events]
    end

    EventsSystem --> RosterEvents
    EventsSystem --> PlayerEvents
    EventsSystem --> ScoreEvents
    EventsSystem --> SinglePlayerEvents

    RosterEvents --> ReducerLogic
    PlayerEvents --> ReducerLogic
    ScoreEvents --> ReducerLogic
    SinglePlayerEvents --> ReducerLogic
```

## Data Schema Architecture & Type Flow

```mermaid
flowchart TD
    subgraph "Data Layer"
        subgraph "Schema Definitions"
            EventsDef["schema/events.ts"]
            StateTypes["lib/state/types.ts"]
        end

        subgraph "Event Types"
            RosterEvents[Roster Events]
            PlayerEvents[Player Events]
            ScoreEvents[Score Events]
            SinglePlayerEvents[Single Player Events]
        end

        subgraph "State Types"
            AppStateType[AppState Interface]
            EventPayloadTypes[Event Payload Types]
            PlayerDetailTypes[Player Detail Types]
            RoundDataTypes[Round Data Types]
        end

        subgraph "Validation"
            EventValidation[Event Validation Schemas]
            TypeGuards[Type Guards]
        end
    end

    %% Schema Flow
    EventsDef --> EventValidation
    EventsDef --> EventPayloadTypes
    StateTypes --> AppStateType
    StateTypes --> PlayerDetailTypes
    StateTypes --> RoundDataTypes

    %% Event Type Definitions
    EventPayloadTypes --> RosterEvents
    EventPayloadTypes --> PlayerEvents
    EventPayloadTypes --> ScoreEvents
    EventPayloadTypes --> SinglePlayerEvents

    %% Type Validation Flow
    EventValidation --> TypeGuards
    TypeGuards --> |"runtime validation"| EventsDef

    %% State Type Composition
    AppStateType --> |"contains"| PlayerDetailTypes
    AppStateType --> |"contains"| RoundDataTypes
    AppStateType --> |"contains"| EventPayloadTypes

    %% Schema Dependencies
    EventValidation -.-> |"zod schemas"| EventsDef
    TypeGuards -.-> |"type predicates"| StateTypes
```

## Development Tools Architecture & Test Data Flow

```mermaid
flowchart TD
    subgraph "Development Tools"
        subgraph "Generators"
            GameDataGen["lib/devtools/generator/gameDataGenerator.ts"]
            PlayerDataGen["lib/devtools/generator/playerDataGenerator.ts"]
        end

        subgraph "Test Files"
            GameGenTests["tests/devtools/__tests__/gameDataGenerator.test.ts"]
            PlayerGenTests["tests/devtools/__tests__/playerDataGenerator.test.ts"]
        end

        subgraph "Test Data"
            MockGames[Mock Game Data]
            MockPlayers[Mock Player Data]
            MockEvents[Mock Event Sequences]
        end
    end

    subgraph "State Management"
        EventsSystem[Events System]
        InstanceManager[Instance Manager]
    end

    %% Generation Flow
    GameDataGen --> |generates| MockGames
    PlayerDataGen --> |generates| MockPlayers
    GameDataGen --> |creates| MockEvents
    PlayerDataGen --> |creates| MockEvents

    %% Test Integration
    MockGames --> GameGenTests
    MockPlayers --> PlayerGenTests
    MockEvents --> GameGenTests
    MockEvents --> PlayerGenTests

    %% State Integration
    MockGames --> |"populate"| InstanceManager
    MockPlayers --> |"populate"| InstanceManager
    MockEvents --> |"dispatch through"| EventsSystem

    %% Test Validation
    GameGenTests --> |"validates"| GameDataGen
    PlayerGenTests --> |"validates"| PlayerDataGen

    %% Data Relationships
    MockGames --> |"contains"| MockPlayers
    MockEvents --> |"based on"| MockGames
    MockEvents --> |"based on"| MockPlayers
```
