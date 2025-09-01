import RoundsView from "@/components/views/RoundsView"
import ScoreboardView from "@/components/views/ScoreboardView"

export default function Page() {
  return (
    <div className="space-y-3">
      <ScoreboardView />
      <RoundsView />
    </div>
  )
}
