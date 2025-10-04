Add idempotency-focused tests for SP events if we tighten reducers to handle duplicates more defensively (e.g., guard duplicate sp/trick/played).

Vendor registry landed — default alias is `@obs/browser-vendor/newrelic/browser-agent`; custom providers can shadow `@obs/browser-vendor/custom`.
New Relic baseline captured 2025-10-03 — env rename to `NEXT_PUBLIC_NEW_RELIC_*` landed with Phase 4; Phase 6 removed the legacy `NEXT_PUBLIC_HDX_*` vars entirely.

- shouldn't round 10 be first because it has 10 tricks? If it is the final round, why would it set the previous round to bidding? There won't be any more rounds after the final round.
- first make a plan on how to fix it so that rounds decrease in number by the number of tricks available in each round. First round is 10 and last round is 1.

Extend tests for out-of-order event robustness (e.g., clear before plays) in integration scenarios.

Remove vercel and v0 from readme and remove from github actions and remove any other reliance or reference to building on v0 or deploying via vercel

- i18n-Ready Names: Default name templates go through i18n to support non-English locales.

Add a toggle to the debug panel to enable/disable event logging to the console.

Legacy HyperDX TODOs superseded by New Relic rollout; keep scratchpad focused on current telemetry work.

Do we have the data stored to expand each round to show all the hands played in that round? Each player's card and which won the trick? Do we have timestamps for each trick played?

Add a link at the bottom of Players > Players component to "See archived players" which when clicked shows a list of all archived players with an option to restore them. Archived players should not be shown in the main player list or in the add player dropdown when adding players to a roster. When in acrchive view there should be a link to "Back to players" to return to the main player list.
Archived players should be soft deleted. Add an "archived" boolean field to the player object in the data model. Use existing events and patterns and stores and models.

you are a staff software engineer. You are reviewing the work of a senior engineer who wrote REFACTOR_STYLES_FROM_COMPONENTS.md. Provide feedback on the plan regarding its completeness, feasibility, and safety. Suggest any improvements or additional considerations that should be taken into account before proceeding with the refactor. Ensure that the plan aligns with best practices in front-end development, maintainability, and performance optimization.

When starting a new single player game and selecting 6 players, the game started with only 4 players that look like there were from a previous game or from the static score card mode. I would expect that I would start the single player game with 6 players as selected. If there was an existing game in progress, I would expect to be prompted to resume that game or start a new game. If I did start a new game, I would expect that the existing game in progress would be archived.

Show a component at the end of a single player game that shows the final scores, highlights the winner, and has buttons to "Start New Game" or "View Game History". This component should be shown instead of the scorecard and should not require navigating back to the home screen.
