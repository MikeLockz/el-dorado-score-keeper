export type MissingEntityAction = Readonly<{
  label: string;
  href: string;
}>;

export type MissingEntityMetadata = Readonly<{
  title: string;
  description: string;
  primary: MissingEntityAction;
  secondary?: MissingEntityAction | null;
}>;

type MissingEntityKey = 'singlePlayerGame' | 'scorecard' | 'player' | 'roster' | 'archivedGame';

const metadataByEntity: Record<MissingEntityKey, MissingEntityMetadata> = {
  singlePlayerGame: {
    title: 'Single Player game not found',
    description:
      "We couldn't load that game. Single-player snapshots keep the most recent 8 runs for about 30 days, so older links may expire once the archive rotates.",
    primary: { label: 'Start a New Game', href: '/single-player/new' },
    secondary: { label: 'Browse Archived Games', href: '/games' },
  },
  scorecard: {
    title: 'Scorecard session missing',
    description:
      'That scorecard link no longer resolves. Check your current scorecard or browse archived games for historical exports.',
    primary: { label: 'Open Scorecard hub', href: '/scorecard' },
    secondary: { label: 'View Game History', href: '/games' },
  },
  player: {
    title: 'Player record unavailable',
    description:
      "This player isn't available. They might have been archived or deleted. Return to the player list to continue.",
    primary: { label: 'Manage Players', href: '/players' },
    secondary: { label: 'View Archived Players', href: '/players/archived' },
  },
  roster: {
    title: 'Roster record unavailable',
    description:
      'We were unable to load that roster. It could be archived or missing. Head back to your saved lineups.',
    primary: { label: 'Manage Rosters', href: '/rosters' },
    secondary: { label: 'View Archived Rosters', href: '/rosters/archived' },
  },
  archivedGame: {
    title: 'Archived game not found',
    description:
      'The archived game you requested could not be loaded. It may have been permanently removed.',
    primary: { label: 'Browse Games', href: '/games' },
    secondary: { label: 'Start a New Single Player Game', href: '/single-player/new' },
  },
};

export function getMissingEntityMetadata(kind: MissingEntityKey): MissingEntityMetadata {
  return metadataByEntity[kind];
}

export { metadataByEntity as missingEntityMetadata };
