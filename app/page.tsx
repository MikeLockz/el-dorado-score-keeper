"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, X, Plus, Minus, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppState } from "@/components/state-provider"
import Leaderboard from "@/components/leaderboard"

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Track which player cells are in details view
type PlayerCellView = {
  [roundNumber: number]: {
    [playerId: number]: "default" | "details"
  }
}

export default function ScoreTracker() {
  const { state, append } = useAppState()
  const [name, setName] = useState("")

  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }))
  const scoreOf = (id: string) => state.scores[id] ?? 0

  // Initialize round states - only first round is active
  const [roundStates, setRoundStates] = useState<RoundState[]>(() => {
    const states = Array(10).fill("locked") as RoundState[]
    states[0] = "bidding" // First round starts active
    return states
  })

  // Track which cells are in details view
  const [playerCellViews, setPlayerCellViews] = useState<PlayerCellView>({})

  // Initialize player data for each round
  const [playerData, setPlayerData] = useState<Record<number, Record<number, PlayerRoundData>>>(
    rounds.reduce(
      (acc, round) => {
        acc[round.round] = players.reduce(
          (playerAcc, player) => {
            playerAcc[player.id] = { bid: 0, madeBid: null, score: null }
            return playerAcc
          },
          {} as Record<number, PlayerRoundData>,
        )
        return acc
      },
      {} as Record<number, Record<number, PlayerRoundData>>,
    ),
  )

  // Modal state for editing players
  const [editingPlayer, setEditingPlayer] = useState<{ id: number; name: string; abbr: string } | null>(null)
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false)
  const [tempPlayerName, setTempPlayerName] = useState("")

  // Add a new player
  const addPlayer = () => {
    if (players.length >= 10) return // Max 10 players

    const newPlayerId = Math.max(...players.map((p) => p.id)) + 1
    const newPlayer = {
      id: newPlayerId,
      name: `Player ${newPlayerId}`,
      abbr: `P${newPlayerId}`,
    }

    setPlayers((prev) => [...prev, newPlayer])

    // Initialize player data for all rounds for the new player
    setPlayerData((prev) => {
      const newData = { ...prev }
      rounds.forEach((round) => {
        newData[round.round] = {
          ...newData[round.round],
          [newPlayerId]: { bid: 0, madeBid: null, score: null },
        }
      })
      return newData
    })
  }

  // Reset all player cell views to default when active round changes
  useEffect(() => {
    setPlayerCellViews({})
  }, [roundStates])

  // Calculate running total for a player up to a specific round
  const getRunningTotal = (playerId: number, upToRound: number) => {
    let total = 0
    for (let i = 1; i <= upToRound; i++) {
      const roundScore = playerData[i][playerId].score
      if (roundScore !== null) {
        total += roundScore
      }
    }
    return total
  }

  // Handle round state cycling
  const cycleRoundState = (roundNumber: number) => {
    const currentState = roundStates[roundNumber - 1]

    // Don't allow interaction with locked rounds
    if (currentState === "locked") {
      return
    }

    setRoundStates((prev) => {
      const newStates = [...prev]

      if (currentState === "bidding") {
        newStates[roundNumber - 1] = "complete"
      } else if (currentState === "complete") {
        // Check if all players have madeBid set
        const allPlayersMarked = players.every((player) => playerData[roundNumber][player.id].madeBid !== null)

        if (allPlayersMarked) {
          // Calculate scores
          const newPlayerData = { ...playerData }

          players.forEach((player) => {
            const playerRoundData = newPlayerData[roundNumber][player.id]
            const bid = playerRoundData.bid || 0
            const madeBid = playerRoundData.madeBid

            // Calculate score based on bid success/failure
            if (madeBid) {
              playerRoundData.score = 5 + bid
            } else {
              playerRoundData.score = -(5 + bid)
            }
          })

          setPlayerData(newPlayerData)
          newStates[roundNumber - 1] = "scored"

          // Activate the next round if it exists
          if (roundNumber < rounds.length && newStates[roundNumber] === "locked") {
            newStates[roundNumber] = "bidding"
          }
        }
      } else if (currentState === "scored") {
        newStates[roundNumber - 1] = "bidding"
      }

      return newStates
    })
  }

  // Handle bid increment
  const incrementBid = (roundNumber: number, playerId: number) => {
    const maxTricks = rounds.find((r) => r.round === roundNumber)?.tricks || 0
    setPlayerData((prev) => {
      const currentBid = prev[roundNumber][playerId].bid || 0
      if (currentBid < maxTricks) {
        return {
          ...prev,
          [roundNumber]: {
            ...prev[roundNumber],
            [playerId]: {
              ...prev[roundNumber][playerId],
              bid: currentBid + 1,
            },
          },
        }
      }
      return prev
    })
  }

  // Handle bid decrement
  const decrementBid = (roundNumber: number, playerId: number) => {
    setPlayerData((prev) => {
      const currentBid = prev[roundNumber][playerId].bid || 0
      if (currentBid > 0) {
        return {
          ...prev,
          [roundNumber]: {
            ...prev[roundNumber],
            [playerId]: {
              ...prev[roundNumber][playerId],
              bid: currentBid - 1,
            },
          },
        }
      }
      return prev
    })
  }

  // Handle made bid toggle
  const handleMadeBidToggle = (roundNumber: number, playerId: number, madeBid: boolean) => {
    setPlayerData((prev) => ({
      ...prev,
      [roundNumber]: {
        ...prev[roundNumber],
        [playerId]: {
          ...prev[roundNumber][playerId],
          madeBid,
        },
      },
    }))
  }

  // Toggle player cell view between default and details
  const togglePlayerCellView = (roundNumber: number, playerId: number) => {
    setPlayerCellViews((prev) => {
      const currentView = prev[roundNumber]?.[playerId] || "default"
      const newView = currentView === "default" ? "details" : "default"

      return {
        ...prev,
        [roundNumber]: {
          ...prev[roundNumber],
          [playerId]: newView,
        },
      }
    })
  }

  // Get current view for a player cell
  const getPlayerCellView = (roundNumber: number, playerId: number) => {
    return playerCellViews[roundNumber]?.[playerId] || "default"
  }

  // Get background and text color for round state
  const getRoundStateStyles = (state: RoundState) => {
    switch (state) {
      case "locked":
        return "bg-gray-900 text-gray-400"
      case "bidding":
        return "bg-sky-300 text-sky-900 shadow-sm"
      case "complete":
        return "bg-orange-300 text-orange-900"
      case "scored":
        return "bg-emerald-300 text-emerald-900"
    }
  }

  // Get consistent row background color for player cells
  const getPlayerCellBackgroundStyles = (state: RoundState) => {
    switch (state) {
      case "locked":
        return "bg-gray-900" // Dark background for inactive cells
      case "bidding":
        return "bg-sky-50"
      case "complete":
        return "bg-orange-50"
      case "scored":
        return "bg-emerald-50"
    }
  }

  // Open player edit modal
  const openPlayerModal = (player: (typeof players)[0]) => {
    setEditingPlayer(player)
    setTempPlayerName(player.name)
    setIsPlayerModalOpen(true)
  }

  // Save player changes
  const savePlayerChanges = () => {
    if (!editingPlayer || !tempPlayerName.trim()) return

    const newAbbr = tempPlayerName.length <= 3 ? tempPlayerName : tempPlayerName.slice(0, 3).toUpperCase()

    setPlayers((prev) =>
      prev.map((player) =>
        player.id === editingPlayer.id ? { ...player, name: tempPlayerName.trim(), abbr: newAbbr } : player,
      ),
    )

    closePlayerModal()
  }

  // Delete player
  const deletePlayer = () => {
    if (!editingPlayer || players.length <= 2) return // Minimum 2 players

    setPlayers((prev) => prev.filter((player) => player.id !== editingPlayer.id))

    // Remove player data from all rounds
    setPlayerData((prev) => {
      const newData = { ...prev }
      rounds.forEach((round) => {
        const { [editingPlayer.id]: removed, ...rest } = newData[round.round]
        newData[round.round] = rest
      })
      return newData
    })

    closePlayerModal()
  }

  // Close player modal
  const closePlayerModal = () => {
    setIsPlayerModalOpen(false)
    setEditingPlayer(null)
    setTempPlayerName("")
  }

  return (
    <div className="p-2 max-w-full mx-auto">
      <h1 className="text-lg font-bold mb-2 text-center">El Dorado Score Keeper</h1>
      <Leaderboard />

      {/* Add Player Button */}
      <div className="mb-2 flex justify-center">
        <Button onClick={addPlayer} disabled={players.length >= 10} size="sm" className="text-xs">
          <Plus className="h-3 w-3 mr-1" />
          Player ({players.length}/10)
        </Button>
      </div>

      <Card className="overflow-hidden shadow-lg overflow-x-auto">
        <div
          className="grid text-[0.65rem] sm:text-xs min-w-fit"
          style={{
            gridTemplateColumns: `3rem repeat(${players.length}, 1fr)`,
            minWidth: `${3 + players.length * 4}rem`,
          }}
        >
          {/* Header row */}
          <div className="bg-slate-700 text-white p-1 font-bold text-center border-b border-r">Rd</div>
          {players.map((player) => (
            <div
              key={player.id}
              className="bg-slate-700 text-white p-1 font-bold text-center border-b cursor-pointer hover:bg-slate-600 transition-colors"
              onClick={() => openPlayerModal(player)}
            >
              {player.abbr}
            </div>
          ))}

          {/* Score rows */}
          {rounds.map((round) => (
            <>
              {/* Round number and tricks */}
              <div
                key={`round-${round.round}`}
                className={`p-1 text-center border-b border-r flex flex-col justify-center transition-all duration-200
                  ${
                    roundStates[round.round - 1] === "locked" ? "cursor-not-allowed" : "cursor-pointer hover:opacity-80"
                  }
                  ${getRoundStateStyles(roundStates[round.round - 1])}`}
                onClick={() => cycleRoundState(round.round)}
              >
                <div className="font-bold text-sm">{round.tricks}</div>
                <div className="text-[0.6rem] opacity-80">↓</div>
                <div className="text-[0.55rem] mt-0.5 font-semibold">
                  {roundStates[round.round - 1] === "locked"
                    ? "Locked"
                    : roundStates[round.round - 1] === "bidding"
                      ? "Active"
                      : roundStates[round.round - 1] === "complete"
                        ? "Complete"
                        : "Scored"}
                </div>
              </div>

              {/* Player bid/score cells */}
              {players.map((player) => (
                <div
                  key={`${round.round}-${player.id}`}
                  className={`border-b grid grid-cols-1 transition-all duration-200 ${getPlayerCellBackgroundStyles(
                    roundStates[round.round - 1],
                  )} ${
                    roundStates[round.round - 1] === "scored" && getPlayerCellView(round.round, player.id) === "details"
                      ? "grid-rows-2"
                      : roundStates[round.round - 1] === "scored" &&
                          getPlayerCellView(round.round, player.id) === "default"
                        ? "grid-rows-1"
                        : "grid-rows-2"
                  }`}
                >
                  {roundStates[round.round - 1] === "locked" && (
                    <>
                      <div className="border-b flex items-center justify-center px-1 py-0.5">
                        <span className="text-[0.6rem] text-gray-500">-</span>
                      </div>
                      <div className="flex items-center justify-center px-1 py-0.5">
                        <span className="text-[0.6rem] text-gray-500">-</span>
                      </div>
                    </>
                  )}

                  {roundStates[round.round - 1] === "bidding" && (
                    <>
                      <div className="border-b flex items-center justify-between px-1 py-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700"
                          onClick={() => decrementBid(round.round, player.id)}
                          disabled={(playerData[round.round][player.id].bid || 0) <= 0}
                        >
                          <Minus className="h-2 w-2" />
                        </Button>
                        <span className="text-[0.7rem] font-bold min-w-[1rem] text-center text-sky-900 bg-white/60 px-1 rounded">
                          {playerData[round.round][player.id].bid || 0}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-4 w-4 p-0 bg-white/80 hover:bg-white border-sky-300 text-sky-700"
                          onClick={() => incrementBid(round.round, player.id)}
                          disabled={(playerData[round.round][player.id].bid || 0) >= round.tricks}
                        >
                          <Plus className="h-2 w-2" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between px-1 py-0.5">
                        <span className="text-[0.6rem] text-sky-700 font-medium">Total</span>
                        <span className="w-8 h-5 text-center text-[0.65rem] font-semibold text-sky-900">
                          {getRunningTotal(player.id, round.round - 1)}
                        </span>
                      </div>
                    </>
                  )}

                  {roundStates[round.round - 1] === "complete" && (
                    <>
                      <div className="border-b flex items-center justify-between px-1 py-0.5">
                        <span className="text-[0.6rem] text-orange-800 font-medium">
                          Bid: {playerData[round.round][player.id].bid ?? "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-1 py-0.5">
                        <Button
                          size="sm"
                          variant={playerData[round.round][player.id].madeBid === true ? "default" : "outline"}
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() => handleMadeBidToggle(round.round, player.id, true)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant={playerData[round.round][player.id].madeBid === false ? "destructive" : "outline"}
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() => handleMadeBidToggle(round.round, player.id, false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}

                  {roundStates[round.round - 1] === "scored" && (
                    <>
                      {getPlayerCellView(round.round, player.id) === "default" && (
                        <div
                          className="flex items-center justify-between px-2 py-2 cursor-pointer hover:bg-emerald-100/50 h-full"
                          onClick={() => togglePlayerCellView(round.round, player.id)}
                        >
                          <div className="flex-1 text-center">
                            <span className="text-lg font-bold text-emerald-900">
                              {playerData[round.round][player.id].bid ?? "-"}
                            </span>
                          </div>
                          <div className="flex-1 text-center">
                            <span className="text-lg font-bold text-emerald-900">
                              {getRunningTotal(player.id, round.round)}
                            </span>
                          </div>
                        </div>
                      )}

                      {getPlayerCellView(round.round, player.id) === "details" && (
                        <>
                          <div
                            className="border-b flex items-center justify-between px-1 py-0.5 cursor-pointer hover:bg-emerald-100/50"
                            onClick={() => togglePlayerCellView(round.round, player.id)}
                          >
                            <span className="text-[0.6rem] font-medium text-emerald-800">
                              {playerData[round.round][player.id].madeBid ? "Made" : "Missed"}
                            </span>
                            <span className="text-[0.6rem] text-emerald-700">
                              Bid: {playerData[round.round][player.id].bid ?? "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between px-1 py-0.5">
                            <span className="text-[0.6rem] text-emerald-700">
                              Round:{" "}
                              <span
                                className={`font-semibold ${
                                  playerData[round.round][player.id].score &&
                                  playerData[round.round][player.id].score >= 0
                                    ? "text-green-700"
                                    : "text-red-700"
                                }`}
                              >
                                {playerData[round.round][player.id].score ?? "-"}
                              </span>
                            </span>
                            <span className="text-[0.6rem] text-emerald-700">
                              Total:{" "}
                              <span className="font-bold text-emerald-900">
                                {getRunningTotal(player.id, round.round)}
                              </span>
                            </span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          ))}
        </div>
      </Card>

      {/* Player Edit Modal */}
      <Dialog open={isPlayerModalOpen} onOpenChange={setIsPlayerModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Player</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playerName">Player Name</Label>
              <Input
                id="playerName"
                value={tempPlayerName}
                onChange={(e) => setTempPlayerName(e.target.value)}
                placeholder="Enter player name"
                maxLength={20}
              />
            </div>
            <div className="flex justify-between gap-2">
              <Button
                variant="destructive"
                onClick={deletePlayer}
                disabled={players.length <= 2}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Player
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closePlayerModal}>
                  Cancel
                </Button>
                <Button onClick={savePlayerChanges} disabled={!tempPlayerName.trim()}>
                  Save
                </Button>
              </div>
            </div>
            {players.length <= 2 && <p className="text-sm text-muted-foreground">Minimum 2 players required</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
