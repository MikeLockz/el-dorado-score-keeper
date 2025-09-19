Why do some of these have sp prefi and some don't? phase, spTrickPlays, trickLeader, spHands, human, tricks, spOrder, spTrump, spTrumpBroken, spTrickCounts, roundNo, state.rounds

Add idempotency-focused tests for SP events if we tighten reducers to handle duplicates more defensively (e.g., guard duplicate sp/trick/played).

What does this mean: If final round (round 10), keeps round 10 scored and sets round 9 to bidding, as before.

- shouldn't round 10 be first because it has 10 tricks? If it is the final round, why would it set the previous round to bidding? There won't be any more rounds after the final round.
- first make a plan on how to fix it so that rounds decrease in number by the number of tricks available in each round. First round is 10 and last round is 1.

Extend tests for out-of-order event robustness (e.g., clear before plays) in integration scenarios.

Remove vercel and v0 from readme and remove from github actions and remove any other reliance or reference to building on v0 or deploying via vercel

The debugging tool has a slider to go back in time, but it doesn't show the correct state when you slide back. It seems to just show the current state no matter where you slide the slider.

Create multiple bot personas with different play styles and strategies. Randomize which bot persona is used in each game to add variety and unpredictability. Some bots should be more aggressive with bidding and winning tricks, while other bots should bid conservatively and rely on sloughing high cards during play that do not follow suite of the lead card to avoid winning tricks. Bot personas and thought processes should be part of the game state so that they can be used for testing and debugging.

You are an expert UI designer with experience in creating user-friendly card game interfaces for consumers. Create SINGLE_PLAYER_UI_MOBILE.md with recommendations on how update the single player UI so that it is much more focused on the current round and hand. The experience should be mobile-first. Extraneous or superflous information should be hidden or minimized. The user should be able to focus on the current hand and round, see their cards clearly, and easily access important actions like revealing the hand, clearing the hand, and finalizing the round. The UI should also provide clear feedback on the current state of the game, including the number of tricks won, the current score, and any special conditions like trump being broken. Consider using collapsible sections, or other UI patterns to manage space effectively on a mobile screen. Provide wireframes or sketches to illustrate your recommendations in SINGLE_PLAYER_UI_MOBILE.md

you are a staff software engineer. Review the single player game code and identify any areas where the code could be refactored or improved for better readability, maintainability, or performance. Provide specific recommendations and examples of how to implement these improvements in SINGLE_PLAYER_CODE_REVIEW.md. Consider aspects such as code organization, naming conventions, modularity, and adherence to best practices in software development.

You are a staff software engineer. Create UPDATED_PLAYER_ENHANCEMENTS based on PLAYER_ENHANCEMENTS.md with a comprehensive plan to enhance the player management features in the El Dorado Score Keeper application. The plan should address current limitations, improve user experience, and ensure robustness and maintainability of the codebase. Consider aspects such as data modeling, event handling, user interface improvements, safety mechanisms, and developer experience. Provide detailed recommendations and justifications for each proposed change.

Data Model

- Rosters as First-Class Entities: rosters: Record<rosterId, {name, playersById, displayOrder, type: 'scorecard'|'single', createdAt}>; state stores activeScorecardRosterId and
  activeSingleRosterId. Games reference rosterId for history.
- Mode-Scoped Active Roster: Switch active roster without mutating previous; supports multiple concurrent SP/Score Card lineups.
- Name Templates: Centralize default naming helpers: defaultHumanName(i), defaultBotName(i), locale-aware; avoids scattered string literals.

Events and Selectors

- Namespaced Events: Consolidate under roster/\* with mode or rosterId in payloads: roster/player/added, roster/reset, roster/human-set, roster/activated.
- Selector Adapters: selectPlayersOrderedFor(mode), selectHumanIdFor(mode), selectActiveRoster(mode); reduces duplication and prevents wrong-roster bugs.
- Seat Order Consistency: Store a per-roster displayOrder; import flows preserve order or offer a “re-seat human first” toggle.

Safety and Recovery

- Undo/Redo (Local): Keep a small undo stack for roster edits and resets; quick “Undo reset” reduces destructive mistakes.
- Destructive Action Details: Confirmation dialogs list exactly what changes (e.g., “Remove 5 players, keep scores intact”).
- Validation Guards: Enforce min/max players consistently (2–10), block SP deal if <2 players, friendly errors.

Defaults and Automation

- First-Run Smart Defaults: SP modal offers “use current Score Card players” if present; otherwise prompt for N players with Player 1 + Bot N.
- Remember Choices: Persist last SP player count and bot naming preference; preselect next time.
- Randomize Single Player: Player 1 is not always first in seat order; shuffle bots to vary gameplay dynamics. Player order should follow existing rules for rotating dealer and first player of the round and first player of each hand. Player order should be persisted in the game data store.

Interoperability

- i18n-Ready Names: Default name templates go through i18n to support non-English locales.

Developer Maintainability

- Roster Module: Extract a lib/roster/ with pure utilities (create, clone, rename, import/export, default names), minimizing spread of logic.
- Type Refinement: Discriminated unions for roster events; mode-safe helpers to avoid mixing SP/Score Card.
- Tests: Unit tests for selectors/events; UI tests for modal flows, import/copy, human marking, and resets. Property tests for min/max constraints.
- Docs: Expand PLAYER_ENHANCEMENTS with event contracts, examples, and migration notes; add a “Roster Patterns” doc for contributors.

you are a staff software engineer. Create IMPLEMENT_UPDATED_PLAYER_ENHANCEMENTS.md that creates phases to implement @UPDATED_PLAYER_ENHANCEMENTS.md considering things like best practices and maintainability and follow existing patterns. ensure each phase is formatted and linted and tested. Keep docs updated. commit changes before moving to next phase

fix error in components/error-boundary.tsx

help me design a application navigation hierarchy.

▌you are an expert in UX, UI, Front End web development, Product Design. Create IMPROVE_GAME_HIEARCHY_v2.md based on the information in GAME_HIERARCHY.md - which contains high-level web app
▌card game hiearchy of views and actions. Your job is to use your expert knowledge to make the document more actionable by reviewing the current hierarchy for mistakes, missing things,
▌areas of opportunity and recommend any changes. Don't be constrained by existing application code as limitations for current functionality which should also be included. Expand on rationale for the
▌hierachy on why that entity is good in that position and why they don't belong somewhere else that might also be acceptable including tradeoffs when helpful. This document will be used
▌to inform an expert in software development to take the hierachy and rationales and layout a component architecture. Goal is to create an engaging and easy to use game for a variety of
▌modes.

You are a staff front end engineer with a background in information architecture. Create FRONT_END_HIERARCHY.md based on the information in IMPROVE_GAME_HIEARCHY_v2.md. The document should outline a clear and organized front-end component hierarchy for the El Dorado Score Keeper application. Consider aspects such as reusability, maintainability, and scalability of components. Provide specific recommendations on how to structure the components, directories for files, including parent-child relationships, state management strategies, and any necessary props or context that should be passed down. The goal is to create a component architecture that supports the application's functionality while ensuring a seamless user experience. Don't be constrained by existing code; focus on best practices and future-proofing the architecture.

you are a staff software engineer. Combine FRONT_END_HIERARCHY.md FRONT_END_HIERARCHY_MIGRATION.md FRONT_END_HIERARCHY_TECHNOLOGY.md IMPROVE_GAME_HIEARCHY_v2.md together into IMPLEMENT_FRONT_END_HIERARCHY.md which details how to create a v2 of the game from scratch but utilizing existing code when possible so that all functionality is preserved or added. Consider things like best practices and maintainability. ensure each phase is formatted and linted and tested. Keep docs updated. commit changes before moving to next phase.

you are a staff software engineer. Follow @IMPLEMENT_FRONT_END_HIERARCHY.md considering things like best practices and maintainability and follow instructions. ensure each phase is formatted and linted and tested. Keep docs updated. commit changes before moving to next phase

you are a staff software engineer. Create a plan to internationalize the entire application. Create I18N_PLAN.md with phases to implement internationalization (i18n) in the El Dorado Score Keeper application. The plan should cover all aspects of i18n, including text extraction, translation management, locale switching, and formatting for dates, numbers, and currencies. Consider best practices for i18n in React and Next.js applications, as well as strategies for maintaining translations and ensuring consistency across the app. Each phase should include specific tasks, tools or libraries to be used, testing strategies, and validation steps to ensure the i18n implementation is robust and user-friendly while not majorly impacting the overall download size and performance of the application. The goal is to create a seamless experience for users in different locales while maintaining the application's functionality and performance.

you are a staff software engineer. review all the code and create @STAFF_RECOMMENDATIONS.md with things that would improve the codebase, performance, developer experience, architecture, product quality, and user experience. Provide specific recommendations and examples of how to implement these improvements. Consider aspects such as code organization, naming conventions, modularity, adherence to best practices in software development, performance optimizations, testing strategies, CI/CD improvements, and UX/UI enhancements. The goal is to provide a comprehensive set of actionable recommendations that can be prioritized and implemented to enhance the overall quality of the El Dorado Score Keeper application.

you are a staff software engineer. Create IMPLEMENT_I18N_PLAN.md with technical implementation details for the requirements in @I18N_PLAN.md. break into phases. After each phase is complete perform validation that the phase is complete. After Each phase run lint, format, test. All new code should have tests. Commit changes after each phase is complete. Ensure docs are updated as needed.

You are staff software engineer. create POSTHOG_ANALYTICS.md with details how to add PostHog analytics to the app. Ignore the existing analytics relay worker to forward events to PostHog. Track page views and key user actions (e.g., starting a new game, adding players, finalizing rounds). Ensure no PII is sent. Document the event schema and how to query in PostHog.

You are staff software engineer. use assessment framework for prioritization. create IMPLEMENT_POSTHOG_ANALYTICS.md from @POSTHOG_ANALYTICS.md. break into phases for technical implementation. Consider things like best practices, maintainability, performance and follow existing patterns. After each phase is complete perform validation that the phase is complete. After Each phase run lint, format, test. All new code should have tests. Commit changes after each phase.

you are a staff product designer. Create DESKTOP_SINGLE_PLAYER.MD Take components/views/SinglePlayerMobile.tsx and create a
▌ responsible desktop-centric layout. Use existing design tokens and Tailwind config. Ensure accessibility best practices (keyboard nav, screen reader labels). It should be visually appealing and easy to use on larger screens. Create a new file components/views/SinglePlayerDesktop.tsx for the desktop layout. Follow existing patterns in the codebase. Document any new design decisions or deviations from existing patterns.

You are a staff software engineer. create IMPLEMENT_DESKTOP_SINGLE_PLAYER.md from @DESKTOP_SINGLE_PLAYER.md. Break into phases for technical implementation. Consider things like best practices, maintainability, performance and follow existing patterns. After each phase is complete perform validation that the phase is complete. After Each phase run lint, format, test. All new code should have tests. Commit changes after each phase.

Update the landing page to be more dynamic. Single Player should initially have button with text "New Game". If a game is in progress, show the priary button as "Resume Game" and secondary hyperlink text "Start a new game" which will go through flow to initiate a new game.

Score card area should be similarly dynamic. Initially button text "New Score Card". If a score card is in progress, button text "Resume Score Card" and secondary hyperlink text "Start a new score card" which will go through flow to initiate a new score card.

The quick links > recent games should show a row for each recent game with game mode, number of players, date/time last played, and current hand number and a "Resume" button. Clicking anywhere on the row or the resume button should navigate to the appropriate game view. Handle any initiate new game confirmation flows as needed if an existing game is in progress.


Update the Players page. All the UI areas should be the same width. Players should be a single group with a header "Players" and a button to add a new player. Below that should be a list of players with their name, type (human or bot), and controls to rename, change type, reorder, and remove. Below that should be a button to reset all players which will show a confirmation dialog before proceeding which archives all players. There should be a state for when there are no players in the list and a button to auto-create X number of players with a dropdown. Auto-creating players should name them like Player 1, Player 2. There should be a link at the bottom of the players list to "Show all archived players" which will expand a section below the link to show a list of previously removed players with their name, type, and a button to restore them. The archived players section should be collapsed by default.

There should be a second section named Roster. Roster is a saved grouping of players that can be loaded into either a single player game or a score card game. The roster section should have a header "Rosters" with a button to create a new roster. Below that should be a list of rosters with their name, number of players, and controls to rename, load into single player, load into score card, and archive. Below that should be a button to reset all rosters which will show a confirmation dialog before proceeding which archives all rosters. There should be a state for when there are no rosters in the list and a button to auto-create a default roster with 4 players named Player 1, Player 2, Player 3, Player 4. There should be a link at the bottom of the rosters list to "Show all archived rosters" which will expand a section below the link to show a list of previously removed rosters with their name, number of players, and a button to restore them. The archived rosters section should be collapsed by default.