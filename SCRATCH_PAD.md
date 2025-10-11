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
