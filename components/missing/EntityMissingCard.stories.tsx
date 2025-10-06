import type { MissingEntityMetadata } from '@/lib/ui/not-found-metadata';
import { missingEntityMetadata } from '@/lib/ui/not-found-metadata';
import { EntityMissingCard } from './EntityMissingCard';

const meta = {
  title: 'Navigation/Entity Missing Card',
  component: EntityMissingCard,
  parameters: {
    layout: 'centered',
    previewTabs: {
      canvas: { hidden: false },
    },
  },
} as const;

export default meta;

interface EntityMissingStory {
  args: {
    metadata: MissingEntityMetadata;
  };
}

export const SinglePlayerGame: EntityMissingStory = {
  args: {
    metadata: missingEntityMetadata.singlePlayerGame,
  },
};

export const ScorecardSession: EntityMissingStory = {
  args: {
    metadata: missingEntityMetadata.scorecard,
  },
};

export const PlayerRecord: EntityMissingStory = {
  args: {
    metadata: missingEntityMetadata.player,
  },
};

export const RosterRecord: EntityMissingStory = {
  args: {
    metadata: missingEntityMetadata.roster,
  },
};

export const ArchivedGame: EntityMissingStory = {
  args: {
    metadata: missingEntityMetadata.archivedGame,
  },
};
