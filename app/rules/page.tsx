import { Card } from "@/components/ui/card"

export default function RulesPage() {
  return (
    <div className="p-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold mb-2 text-center">Rules</h1>
      <Card className="p-3 text-sm leading-relaxed">
        <p className="mb-2">This is a simple reference for the scoring used by this app.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Bidding phase: each player bids the number of tricks.</li>
          <li>Complete phase: mark whether each player made or missed.</li>
          <li>Scoring: + (5 + bid) if made; − (5 + bid) if missed.</li>
          <li>Rounds progress from 10 tricks down to 1.</li>
        </ul>
      </Card>
    </div>
  )
}

