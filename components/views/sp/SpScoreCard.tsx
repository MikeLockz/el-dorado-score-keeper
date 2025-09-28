import React from 'react';
import clsx from 'clsx';

import type { ScoreCardRound } from './useSinglePlayerViewModel';

import styles from './sp-score-card.module.scss';

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
    <section className={styles.root}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <caption className={styles.visuallyHidden}>Score card history</caption>
          <thead className={styles.tableHead}>
            <tr className={styles.tableRow}>
              <th scope="col" className={styles.tableHeadCell} rowSpan={2}>
                Round
              </th>
              {players.map((player) => (
                <th
                  key={`player-${player.id}`}
                  scope="col"
                  className={clsx(styles.tableHeadCell, styles.tableHeadCellNumeric)}
                  colSpan={3}
                >
                  {player.name}
                </th>
              ))}
            </tr>
            <tr className={styles.tableRow}>
              {players.flatMap((player) => [
                <th
                  key={`head-${player.id}-bid`}
                  scope="col"
                  className={clsx(styles.tableHeadCell, styles.tableHeadCellNumeric)}
                >
                  <span className={styles.tableHeadSubLabel}>Bid</span>
                </th>,
                <th
                  key={`head-${player.id}-taken`}
                  scope="col"
                  className={clsx(styles.tableHeadCell, styles.tableHeadCellNumeric)}
                >
                  <span className={styles.tableHeadSubLabel}>Took</span>
                </th>,
                <th
                  key={`head-${player.id}-score`}
                  scope="col"
                  className={clsx(styles.tableHeadCell, styles.tableHeadCellNumeric)}
                >
                  <span className={styles.tableHeadSubLabel}>Round</span>
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={`round-row-${round.round}`} className={styles.tableRow}>
                <th scope="row" className={styles.tableHeadCell}>
                  {round.round}
                </th>
                {players.flatMap((player) => {
                  const entry = round.entries[player.id];
                  const bidCell = formatNullable(entry?.bid ?? null);
                  const takenCell = formatNullable(entry?.taken ?? null);
                  const scoreValue = entry?.score ?? 0;
                  const scoreClass =
                    scoreValue > 0
                      ? styles.scorePositive
                      : scoreValue < 0
                        ? styles.scoreNegative
                        : styles.scoreNeutral;
                  return [
                    <td
                      key={`round-${round.round}-${player.id}-bid`}
                      className={clsx(styles.tableCell, styles.tableCellNumeric)}
                    >
                      {bidCell}
                    </td>,
                    <td
                      key={`round-${round.round}-${player.id}-taken`}
                      className={clsx(styles.tableCell, styles.tableCellNumeric)}
                    >
                      {takenCell}
                    </td>,
                    <td
                      key={`round-${round.round}-${player.id}-score`}
                      className={clsx(styles.tableCell, styles.tableCellNumeric, scoreClass)}
                    >
                      {formatNumber(scoreValue)}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className={styles.tableFooter}>
            <tr className={styles.tableRow}>
              <th scope="row" className={styles.tableHeadCell}>
                Total
              </th>
              {players.flatMap((player) => {
                const totalScore = totals[player.id] ?? 0;
                const scoreClass =
                  totalScore > 0
                    ? styles.scorePositive
                    : totalScore < 0
                      ? styles.scoreNegative
                      : styles.scoreNeutral;
                return [
                  <td
                    key={`total-${player.id}-bid`}
                    className={clsx(
                      styles.tableCell,
                      styles.tableCellNumeric,
                      styles.playerTotalLabel,
                    )}
                  >
                    —
                  </td>,
                  <td
                    key={`total-${player.id}-taken`}
                    className={clsx(
                      styles.tableCell,
                      styles.tableCellNumeric,
                      styles.playerTotalLabel,
                    )}
                  >
                    —
                  </td>,
                  <td
                    key={`total-${player.id}-score`}
                    className={clsx(styles.tableCell, styles.tableCellNumeric, scoreClass)}
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
