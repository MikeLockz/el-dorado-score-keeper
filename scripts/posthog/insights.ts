import { type InsightDefinition } from './types';

const HOGQL_ROUNDS_PER_GAME_QUERY = String.raw`SELECT
  toDate(timestamp) AS day,
  countIf(event = 'game.started') AS games_started,
  countIf(event = 'round.finalized') AS rounds_finalized,
  round(countIf(event = 'round.finalized') * 1.0 / nullIf(countIf(event = 'game.started'), 0), 2) AS rounds_per_game
FROM events
WHERE timestamp >= dateSub('week', 4, now())
  AND properties["env"] = 'production'
GROUP BY day
ORDER BY day`;

export const INSIGHTS: ReadonlyArray<InsightDefinition> = Object.freeze([
  {
    name: 'Game Starts by Mode',
    description: 'Weekly trend of games started segmented by mode.',
    tags: ['automation', 'el-dorado'],
    kind: 'TRENDS',
    filters: {
      events: [
        {
          id: 'game.started',
          name: 'game.started',
          math: 'total',
          type: 'events',
        },
      ],
      breakdown_type: 'event',
      breakdown: 'mode',
      interval: 'week',
      date_from: '-90d',
      insight: 'TRENDS',
      filter_test_accounts: true,
    },
    query: {
      kind: 'TrendsQuery',
      interval: 'week',
      series: [
        {
          event: 'game.started',
          math: 'total',
          name: 'game.started',
        },
      ],
    },
  },
  {
    name: 'Round Completion Funnel',
    description: 'Homepage visits progressing through player setup to the first completed round.',
    tags: ['automation', 'el-dorado'],
    kind: 'FUNNELS',
    filters: {
      events: [
        {
          id: '$pageview',
          name: '$pageview',
          math: 'total',
          type: 'events',
          properties: [
            {
              key: 'path',
              value: '/',
              operator: 'exact',
              type: 'event',
            },
          ],
        },
        {
          id: 'players.added',
          name: 'players.added',
          math: 'total',
          type: 'events',
        },
        {
          id: 'round.finalized',
          name: 'round.finalized',
          math: 'total',
          type: 'events',
        },
      ],
      funnel_order_type: 'strict',
      funnel_window_interval: 30,
      funnel_window_interval_unit: 'minute',
      date_from: '-30d',
      insight: 'FUNNELS',
    },
    query: {
      kind: 'FunnelsQuery',
      series: [
        {
          event: '$pageview',
          name: '$pageview',
          math: 'total',
          properties: [
            {
              key: 'path',
              value: '/',
              operator: 'exact',
              type: 'event',
            },
          ],
        },
        {
          event: 'players.added',
          name: 'players.added',
          math: 'total',
        },
        {
          event: 'round.finalized',
          name: 'round.finalized',
          math: 'total',
        },
      ],
    },
  },
  {
    name: 'Rounds per Game (HogQL)',
    description: 'Daily aggregate of rounds per game using HogQL.',
    tags: ['automation', 'el-dorado'],
    kind: 'SQL',
    filters: {
      query: HOGQL_ROUNDS_PER_GAME_QUERY,
      insight: 'SQL',
    },
    query: {
      kind: 'HogQLQuery',
      query: HOGQL_ROUNDS_PER_GAME_QUERY,
    },
  },
]);
