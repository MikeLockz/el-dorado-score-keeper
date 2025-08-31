"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, X, Plus, Minus } from "lucide-react"
import { useAppState } from "@/components/state-provider"

// Round states
type RoundState = "locked" | "bidding" | "complete" | "scored"

// Player bid and score data
type PlayerRoundData = {
  bid: number | null
  madeBid: boolean | null
  score: number | null
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function ScoreTracker() {
  const { state, append } = useAppState()
  const [newName, setNewName] = useState("")
  const [players, setPlayers] = useState([
    { id: 1, name: "Player 1", abbr: "P1" },
    { id: 2, name: "Player 2", abbr: "P2" },
    { id: 3, name: "Player 3", abbr: "P3" },
    { id: 4, name: "Player 4", abbr: "P4" },
  ])

  // Generate rounds (10 down to 1 tricks)
  const rounds = Array.from({ length: 10 }, (_, i) => ({
    round: i + 1,
    tricks: 10 - i,
  }))

  // Initialize round states - only first round is active
  const [roundStates, setRoundStates] = useState<RoundState[]>(() => {
    const states = Array(10).fill("locked") as RoundState[]
    states[0] = "bidding" // First round starts active
    return states
  })

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

  return (
    <div className="p-2 max-w-md mx-auto">
      <h1 className="text-lg font-bold mb-2 text-center">
        El Dorado Score Keeper
      </h1>

      {/* Event-sourced players and scores */}
      <Card className="p-3 mb-3">
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder="Add player name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPlayer(state, append, newName, setNewName) }}
          />
          <Button size="sm" onClick={() => addPlayer(state, append, newName, setNewName)}>Add</Button>
        </div>
        <div className="space-y-2">
          {Object.keys(state.players).length === 0 && (
            <div className="text-sm text-muted-foreground">No players yet. Add one above.</div>
          )}
          {Object.entries(state.players).map(([id, name]) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">{name}</div>
                <div className="text-xs text-muted-foreground">score: {state.scores[id] ?? 0}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(append, id, -5)}><Minus className="h-3 w-3" /></Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(append, id, -1)}>-1</Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(append, id, +1)}>+1</Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addScore(append, id, +5)}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden shadow-lg">
        <div className="grid grid-cols-[3rem_repeat(4,1fr)] text-[0.65rem] sm:text-xs">
          {/* Header row */}
          <div className="bg-slate-700 text-white p-1 font-bold text-center border-b border-r">
            Rd
          </div>
          {players.map((player) => (
            <div
              key={player.id}
              className="bg-slate-700 text-white p-1 font-bold text-center border-b"
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
                    roundStates[round.round - 1] === "locked"
                      ? "cursor-not-allowed"
                      : "cursor-pointer hover:opacity-80"
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
                  className={`border-b grid grid-cols-1 grid-rows-2 transition-all duration-200 ${getPlayerCellBackgroundStyles(
                    roundStates[round.round - 1]
                  )}`}
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
                          disabled={
                            (playerData[round.round][player.id].bid || 0) <= 0
                          }
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
                          disabled={
                            (playerData[round.round][player.id].bid || 0) >=
                            round.tricks
                          }
                        >
                          <Plus className="h-2 w-2" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between px-1 py-0.5">
                        <span className="text-[0.6rem] text-sky-700 font-medium">
                          Total
                        </span>
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
                          variant={
                            playerData[round.round][player.id].madeBid === true
                              ? "default"
                              : "outline"
                          }
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() =>
                            handleMadeBidToggle(round.round, player.id, true)
                          }
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            playerData[round.round][player.id].madeBid === false
                              ? "destructive"
                              : "outline"
                          }
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() =>
                            handleMadeBidToggle(round.round, player.id, false)
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}

                  {roundStates[round.round - 1] === "scored" && (
                    <>
                      <div className="border-b flex items-center justify-between px-1 py-0.5">
                        <span className="text-[0.6rem] font-medium text-emerald-800">
                          {playerData[round.round][player.id].madeBid
                            ? "Made"
                            : "Missed"}
                        </span>
                        <span className="text-[0.6rem] text-emerald-700">
                          Bid: {playerData[round.round][player.id].bid ?? "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-1 py-0.5">
                        <span
                          className={`text-[0.6rem] font-semibold ${
                            playerData[round.round][player.id].score &&
                            playerData[round.round][player.id].score >= 0
                              ? "text-green-700"
                              : "text-red-700"
                          }`}
                        >
                          {playerData[round.round][player.id].score ?? "-"}
                        </span>
                        <span className="font-bold text-[0.65rem] text-emerald-900">
                          {getRunningTotal(player.id, round.round)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </>
          ))}
        </div>
      </Card>
    </div>
  );
}

function addPlayer(state: any, append: any, name: string, setName: (v: string) => void) {
  const trimmed = name.trim()
  if (!trimmed) return
  const id = uuid()
  append({ type: 'player/added', payload: { id, name: trimmed }, eventId: uuid(), ts: Date.now() })
  setName("")
}

function addScore(append: any, playerId: string, delta: number) {
  append({ type: 'score/added', payload: { playerId, delta }, eventId: uuid(), ts: Date.now() })
}
