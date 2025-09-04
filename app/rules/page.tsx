import { Card } from '@/components/ui';

export default function RulesPage() {
  return (
    <div className="p-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold mb-3 text-center">Rules</h1>
      <div className="space-y-3 text-sm leading-relaxed">
        <Card className="p-3">
          <h2 className="font-semibold mb-2">Overview</h2>
          <p>
            The app tracks a 10‑round session. Each round has a target number of tricks that
            decreases from 10 to 1. Players bid during the bidding phase, then you mark whether they
            made or missed during completion. Finalizing a round applies points based on the bid and
            outcome.
          </p>
        </Card>
        <Card className="p-3">
          <h2 className="font-semibold mb-2">Round Flow</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">Bidding</span>: Each player sets a bid from 0 up to the
              round’s trick count.
            </li>
            <li>
              <span className="font-medium">Complete</span>: After play, mark for each player
              whether they made or missed.
            </li>
            <li>
              <span className="font-medium">Finalize</span>: When all players are marked, click the
              round tile to finalize.
            </li>
            <li>
              <span className="font-medium">Next Round</span>: The next locked round automatically
              unlocks into bidding.
            </li>
          </ol>
        </Card>
        <Card className="p-3">
          <h2 className="font-semibold mb-2">Scoring</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Made: + (5 + bid) points</li>
            <li>Missed: − (5 + bid) points</li>
            <li>Totals update immediately on finalization and appear on the scoreboard.</li>
          </ul>
        </Card>
        <Card className="p-3">
          <h2 className="font-semibold mb-2">Examples</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Bid 3 and made: +8 points</li>
            <li>Bid 0 and missed: −5 points</li>
            <li>Bid 7 and missed: −12 points</li>
          </ul>
        </Card>
        <Card className="p-3">
          <h2 className="font-semibold mb-2">Notes</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Round states: locked → bidding → complete → scored → bidding (cycle).</li>
            <li>Locked rounds cannot be advanced until earlier rounds are scored.</li>
            <li>Data is stored locally and syncs across open tabs.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
