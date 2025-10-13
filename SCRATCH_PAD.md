- shouldn't round 10 be first because it has 10 tricks? If it is the final round, why would it set the previous round to bidding? There won't be any more rounds after the final round.
- first make a plan on how to fix it so that rounds decrease in number by the number of tricks available in each round. First round is 10 and last round is 1.

- i18n-Ready Names: Default name templates go through i18n to support non-English locales.

Add a toggle to the debug panel to enable/disable event logging to the console.

Do we have the data stored to expand each round to show all the hands played in that round? Each player's card and which won the trick? Do we have timestamps for each trick played?

Add a link at the bottom of Players > Players component to "See archived players" which when clicked shows a list of all archived players with an option to restore them. Archived players should not be shown in the main player list or in the add player dropdown when adding players to a roster. When in acrchive view there should be a link to "Back to players" to return to the main player list.
Archived players should be soft deleted. Add an "archived" boolean field to the player object in the data model. Use existing events and patterns and stores and models.

When starting a new single player game and selecting 6 players, the game started with only 4 players that look like there were from a previous game or from the static score card mode. I would expect that I would start the single player game with 6 players as selected. If there was an existing game in progress, I would expect to be prompted to resume that game or start a new game. If I did start a new game, I would expect that the existing game in progress would be archived.

Show a component at the end of a single player game that shows the final scores, highlights the winner, and has buttons to "Start New Game" or "View Game History". This component should be shown instead of the scorecard and should not require navigating back to the home screen.

After a game is complete on the game summary show a 5 star rating component to rate the game experience. Store the rating in local storage and show an average rating on the home screen.

Generate FAQs for the game and display them in the Help section. Use common questions about rules, scoring, and gameplay. Include what information is stored locally versus on the server. Include troubleshooting tips for common issues like game not starting, players not showing up, or scores not saving. How to get support if needed.

Generate terms of use and privacy policies at each route based on common templates. Include information about data storage, user rights, and contact information. Ensure compliance with relevant regulations like GDPR or CCPA.

Generate about page content that describes the game, its history, and the development team. The game originates from a family in south western Michigan in a small farming community of immigrants from Germany and Ukraine. The game has been passed down the generations and has a rich history of late night banter and fun with friends and family.

Create player stats.

Create a landing page for a card game. There are primary, secondary, tertiary actions on the main page. The layout should be responsive and mobile first. I should see the Primary CTA on the first screen without scrolling. The design should be clean and modern with a focus on usability. Use Tailwind CSS for styling. The page should load quickly and be optimized for performance. Use best practices for accessibility and SEO. The background should be a subtle gradient or pattern. The font should be easy to read and the color scheme should be visually appealing. The page should have a header with the game title: El Dorado and subtitle: Card Game. The secondary CTAs should be below the primary CTA and look more like normal links. The tertiary CTA should be at the bottom footer of the page.

Primary CTA:

- Play
  - Single player mode
  - Multiplayer mode
  - In person mode
    - Players
      - Rosters
- Resume
  - Score card
  - Single player
  - Multiplayer

Secondary CTA:

- Stats
  - Game history
  - Player history
  - Online leaderboards
- Settings

Tertiary CTA:

- Help
- About

Fix the single player summary Auto-advance so that the countdown timer works and is not immediately in canceled state. Make sure there is test coverage.

Bug when I have an existing single player game, I navigate to home screen, i click on start a new game then when the confirmation modal appears I click on Continue current game and nothing happens. I expect that when I click on Continue current game that I am taken to the existing game in progress. Add any tests needed to cover this flow.

Fix bug when I close out of modal: Start a new game? You have an in-progress game. Starting a new one will archive current progress and reset scores and I hit ESC character and I am redirected to the current in progress single player game. I should return to whatever view i was just on.

when you click on details in single player during a game it should navigate to the summary route

is there a way to simplify the the presentation layer of jsx and separate out the more functional logic into a separate file so that it's easier to read the markup and understand the structure of the component at a glance without having to read through all the logic?

page.tsx:27 Server Error: Route "/single-player/[gameId]" used `params.gameId`. `params` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
at Module.generateMetadata (page.tsx:27:24)

Add a precommit hook that runs prettier to format code before committing. Remove prettier from running in CI. Ensure all code is formatted before committing.

create a new file called @IMPLEMENT_PLAYER_STATISTICS.md which is a detailed engineering plan to implement PLAYER_STATISTICS.md. Break into phases. first build the route and view. Then primary statistics, then secondary, then tertiary. Consider things like best practices, maintainability, performance and follow existing patterns. After each phase is complete perform validation that the phase is complete. All new code should have tests. Keep docs updated. Commit changes after each phase.

with new relic and my current browser agent do I get an "apm" like view of front end performance? I am making indexdb calls and processing a lot of data on the front end. I want to see how long those calls take and how they impact page load performance. Ideally I would see a waterfall view of all the calls and how long they take.

refactor the UI for the players management page. there should be a single players component and inside there will be a list of active players that are on the current roster. there will be a button to add a player to the roster and players can be removed from the roster. Below the players list there will be a roster component that shows all the rosters. rosters can be created, renamed, deleted, archived, and restored. rosters can be loaded into the current game or into single player mode. archived rosters are hidden by default but can be shown with a toggle. archived players are hidden by default but can be shown with a toggle. players can be dragged and dropped to reorder them. players have a type (human or bot) that can be toggled. players have a name that can be edited. players have an archived state that can be toggled. rosters have a name that can be edited. rosters have an archived state that can be toggled. rosters show the number of players in the roster and the number of active players in the roster. There is a link to view archived players and a link to view archived rosters. The UI should be responsive and work on mobile and desktop. The UI should be accessible and follow best practices. The UI should be tested with unit tests and integration tests. The UI should follow existing patterns and use existing components where possible. The UI should be easy to use and understand.

I see a lot of logs in the browser console like [player-stats] historical counted loss {playerId: '502cba8f-a18c-46fa-947f-e43293527b44', canonicalId: '502cba8f-a18c-46fa-947f-e43293527b44', gameId: '3d0d2650-931f-422a-869c-e4eb1d207abc'}
player-statistics.ts:571 [player-stats] historical game missing score for player {playerId: '502cba8f-a18c-46fa-947f-e43293527b44', gameId: '3c588ed1-2a60-40b2-8c80-e0d6e78f69c4', winnerIds: Array(1), availableScores: {…}}
player-statistics.ts:571 [player-stats] historical counted loss {playerId: '502cba8f-a18c-46fa-947f-e43293527b44', canonicalId: '502cba8f-a18c-46fa-947f-e43293527b44', gameId: '3c588ed1-2a60-40b2-8c80-e0d6e78f69c4'}
player-statistics.ts:571 [player-stats] historical players scanned {playerId: '502cba8f-a18c-46fa-947f-e43293527b44', scoreCount: 4, highestScore: 380, lowestScore: -101, legacySkipped: 0, …}
player-statistics.ts:571 [player-stats] combined totals {playerId: '502cba8f-a18c-46fa-947f-e43293527b44', liveMetrics: {…}, historicalTotals: {…}, winRatePercent: 4.6, loadError: null}
The /players route is slow to load. Is there something that happens when loading the player list that is slow? Can we benchmark the loading time and see where the bottlnecks are?

Remove the browser console logs for player statistics.

change the RoundAccuracyChart to be a table of values. No

Add Start New Game button to the single player summary screen after all 10 rounds are complete. Add a View Game History button that navigates to the game history screen.

When clicking start new game from the single player summary screen and the current game is complete, it should just start a new game without showing the confirmation modal.

Under games, create a separate list of historical Scorecard games that is different from the list of Single Player games.

Under games, don't allow any game to be resumed if it is already complete.

Under games, change the button to Archive from Delete. Archive removes the game from the list of games but does not delete it permanently. Archived games can be viewed in a separate list of archived games with an option to restore them. Archived games should not be shown in the main game list or in the resume dropdown when resuming a game. When in archive view there should be a link to "Back to games" to return to the main game list.

in the /games/{id} view, add the scorecard in a read-only mode at the top of the page. Below that show the single player summary with all the stats and charts.
