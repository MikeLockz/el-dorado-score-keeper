import React from 'react';

import type { ScoreCardRound } from './useSinglePlayerViewModel';

type Props = {
  rounds: ReadonlyArray<ScoreCardRound>;
  totals: Readonly<Record<string, number>>;
  players: ReadonlyArray<{ id: string; name: string }>;
};

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '0';
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatNullable(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

export default function SpScoreCard({ rounds, totals, players }: Props) {
  if (!rounds.length) return null;

  return (
    <section className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Previous Rounds
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-xs">
          <caption className="sr-only">Score card history</caption>
          <thead className="bg-muted/60">
            <tr>
              <th
                scope="col"
                className="border px-2 py-1 text-left align-bottom font-semibold"
                rowSpan={2}
              >
                Round
              </th>
              {players.map((player) => (
                <th
                  key={`player-${player.id}`}
                  scope="col"
                  className="border px-2 py-1 text-center font-semibold"
                  colSpan={3}
                >
                  {player.name}
                </th>
              ))}
            </tr>
            <tr>
              {players.flatMap((player) => [
                <th
                  key={`head-${player.id}-bid`}
                  scope="col"
                  className="border px-2 py-1 text-center text-[0.7rem] uppercase tracking-wide text-muted-foreground"
                >
                  Bid
                </th>,
                <th
                  key={`head-${player.id}-taken`}
                  scope="col"
                  className="border px-2 py-1 text-center text-[0.7rem] uppercase tracking-wide text-muted-foreground"
                >
                  Took
                </th>,
                <th
                  key={`head-${player.id}-score`}
                  scope="col"
                  className="border px-2 py-1 text-center text-[0.7rem] uppercase tracking-wide text-muted-foreground"
                >
                  Round
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={`round-row-${round.round}`} className="odd:bg-muted/10">
                <th scope="row" className="border px-2 py-1 text-left font-semibold">
                  {round.round}
                </th>
                {players.flatMap((player) => {
                  const entry = round.entries[player.id];
                  const bidCell = formatNullable(entry?.bid ?? null);
                  const takenCell = formatNullable(entry?.taken ?? null);
                  const scoreValue = entry?.score ?? 0;
                  const scoreClass =
                    scoreValue > 0
                      ? 'text-status-scored'
                      : scoreValue < 0
                        ? 'text-destructive'
                        : 'text-foreground';
                  return [
                    <td
                      key={`round-${round.round}-${player.id}-bid`}
                      className="border px-2 py-1 text-center"
                    >
                      {bidCell}
                    </td>,
                    <td
                      key={`round-${round.round}-${player.id}-taken`}
                      className="border px-2 py-1 text-center"
                    >
                      {takenCell}
                    </td>,
                    <td
                      key={`round-${round.round}-${player.id}-score`}
                      className={`border px-2 py-1 text-center font-semibold ${scoreClass}`}
                    >
                      {formatNumber(scoreValue)}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40">
            <tr>
              <th scope="row" className="border px-2 py-1 text-left font-semibold">
                Total
              </th>
              {players.flatMap((player) => {
                const totalScore = totals[player.id] ?? 0;
                const scoreClass =
                  totalScore > 0
                    ? 'text-status-scored'
                    : totalScore < 0
                      ? 'text-destructive'
                      : 'text-foreground';
                return [
                  <td
                    key={`total-${player.id}-bid`}
                    className="border px-2 py-1 text-center text-muted-foreground"
                  >
                    —
                  </td>,
                  <td
                    key={`total-${player.id}-taken`}
                    className="border px-2 py-1 text-center text-muted-foreground"
                  >
                    —
                  </td>,
                  <td
                    key={`total-${player.id}-score`}
                    className={`border px-2 py-1 text-center font-semibold ${scoreClass}`}
                  >
                    {formatNumber(totalScore)}
                  </td>,
                ];
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
