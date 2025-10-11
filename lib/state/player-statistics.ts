export type PlayerStatsLoadState = Readonly<{
  isLoadingLive: boolean;
  isLoadingHistorical: boolean;
  loadError: string | null;
}>;

export type PrimaryMetrics = Readonly<{
  totalGamesPlayed: number;
  totalGamesWon: number;
  winRatePercent: number;
}>;

export type SecondaryMetrics = Readonly<{
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
}>;

export type RoundMetric = Readonly<{
  roundNo: number;
  bidCount: number;
  bids: number[];
  highestBid: number | null;
  lowestBid: number | null;
  accuracyPercent: number | null;
  accuracyMatches: number;
  accuracyTotal: number;
}>;

export type HandInsight = Readonly<{
  handsPlayed: number;
  suitCounts: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
  topSuit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
}>;

export type AdvancedMetrics = Readonly<{
  trickEfficiency: Readonly<{
    averageDelta: number | null;
    perfectBidStreak: number;
  }>;
  suitMastery: Readonly<{
    trumpWinRateBySuit: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
    trickSuccessBySuit: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
  }>;
  scoreVolatility: Readonly<{
    standardDeviation: number | null;
    largestComeback: number | null;
    largestLeadBlown: number | null;
  }>;
  momentum: Readonly<{
    rollingAverageScores: ReadonlyArray<{
      gameId: string;
      score: number;
      average: number;
    }>;
    currentWinStreak: number;
    longestWinStreak: number;
  }>;
}>;

export type PlayerStatisticsSummary = PlayerStatsLoadState &
  Readonly<{
    playerId: string;
    primary: PrimaryMetrics | null;
    secondary: SecondaryMetrics | null;
    rounds: ReadonlyArray<RoundMetric>;
    handInsights: HandInsight | null;
    advanced: AdvancedMetrics | null;
  }>;

export type PlayerStatisticsLoadInput = Readonly<{
  playerId: string;
}>;

const suitNames: Array<'clubs' | 'diamonds' | 'hearts' | 'spades'> = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
];

export const createPendingPlayerStatisticsSummary = (
  playerId: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: true,
  isLoadingHistorical: true,
  loadError: null,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export const createEmptyPlayerStatisticsSummary = (
  playerId: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: false,
  isLoadingHistorical: false,
  loadError: null,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export const createErroredPlayerStatisticsSummary = (
  playerId: string,
  errorMessage: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: false,
  isLoadingHistorical: false,
  loadError: errorMessage,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export async function loadPlayerStatisticsSummary(
  input: PlayerStatisticsLoadInput,
): Promise<PlayerStatisticsSummary> {
  const playerId = typeof input.playerId === 'string' ? input.playerId.trim() : '';
  if (!playerId) {
    throw new Error('Player ID is required to load statistics');
  }
  return createEmptyPlayerStatisticsSummary(playerId);
}

export function clonePlayerStatisticsSummary(
  summary: PlayerStatisticsSummary,
  overrides: Partial<PlayerStatisticsSummary> = {},
): PlayerStatisticsSummary {
  return {
    ...summary,
    ...overrides,
    handInsights:
      overrides.handInsights ??
      (summary.handInsights
        ? {
            handsPlayed: summary.handInsights.handsPlayed,
            suitCounts: { ...summary.handInsights.suitCounts },
            topSuit: summary.handInsights.topSuit,
          }
        : null),
    primary: overrides.primary ?? summary.primary,
    secondary: overrides.secondary ?? summary.secondary,
    rounds: overrides.rounds ?? summary.rounds,
    advanced: overrides.advanced ?? summary.advanced,
  };
}

export const PLAYER_STATISTICS_SUITS = Object.freeze([...suitNames]);
