import RoundsView from "@/components/views/RoundsView"
import PlayerManagement from "@/components/players/PlayerManagement"

export default function Page() {
  return (
    <div className="space-y-3">
      <PlayerManagement />
      <RoundsView />
    </div>
  )
}
