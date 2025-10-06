import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityMissingCard } from '@/components/missing/EntityMissingCard';
import { getMissingEntityMetadata } from '@/lib/ui/not-found-metadata';
import { SinglePlayerGameMissing } from '@/app/single-player/[gameId]/_components/SinglePlayerGameMissing';
import { ScorecardMissing } from '@/app/scorecard/[scorecardId]/_components/ScorecardMissing';
import { PlayerMissing } from '@/app/players/_components/PlayerMissing';
import { RosterMissing } from '@/app/rosters/_components/RosterMissing';
import { ArchivedGameMissing } from '@/app/games/_components/ArchivedGameMissing';

afterEach(() => {
  cleanup();
});

describe('EntityMissingCard', () => {
  it('renders metadata driven content', () => {
    const metadata = getMissingEntityMetadata('player');
    render(<EntityMissingCard metadata={metadata} />);
    expect(screen.getByText(metadata.title)).toBeTruthy();
    expect(screen.getByText(metadata.description)).toBeTruthy();
    const primary = screen.getByRole('link', { name: metadata.primary.label });
    expect(primary.getAttribute('href')).toBe(metadata.primary.href);
    if (metadata.secondary) {
      const secondary = screen.getByRole('link', { name: metadata.secondary.label });
      expect(secondary.getAttribute('href')).toBe(metadata.secondary.href);
    }
  });
});

describe('feature missing components', () => {
  it('renders single-player missing copy', () => {
    render(<SinglePlayerGameMissing />);
    expect(screen.getByText(/Single Player game not found/i)).toBeTruthy();
    const metadata = getMissingEntityMetadata('singlePlayerGame');
    const primary = screen.getByRole('link', { name: metadata.primary.label });
    expect(primary.getAttribute('href')).toBe(metadata.primary.href);
    if (metadata.secondary) {
      const secondary = screen.getByRole('link', { name: metadata.secondary.label });
      expect(secondary.getAttribute('href')).toBe(metadata.secondary.href);
    }
  });

  it('renders scorecard missing copy', () => {
    render(<ScorecardMissing />);
    expect(screen.getByText(/Scorecard session missing/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Open Scorecard hub/i });
    expect(link.getAttribute('href')).toBe('/scorecard');
  });

  it('renders player missing copy', () => {
    render(<PlayerMissing />);
    expect(screen.getByText(/Player record unavailable/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Manage Players/i });
    expect(link.getAttribute('href')).toBe('/players');
  });

  it('renders roster missing copy', () => {
    render(<RosterMissing />);
    expect(screen.getByText(/Roster record unavailable/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Manage Rosters/i });
    expect(link.getAttribute('href')).toBe('/rosters');
  });

  it('renders archived game missing copy', () => {
    render(<ArchivedGameMissing />);
    expect(screen.getByText(/Archived game not found/i)).toBeTruthy();
    const metadata = getMissingEntityMetadata('archivedGame');
    const primary = screen.getByRole('link', { name: metadata.primary.label });
    expect(primary.getAttribute('href')).toBe(metadata.primary.href);
    if (metadata.secondary) {
      const secondary = screen.getByRole('link', { name: metadata.secondary.label });
      expect(secondary.getAttribute('href')).toBe(metadata.secondary.href);
    }
  });
});
