"use client";
import React from 'react';

export default function SinglePlayerPage() {
  return (
    <main className="p-4 space-y-3">
      <h1 className="text-xl font-bold">El Dorado — Single Player</h1>
      <p className="text-sm text-muted-foreground">
        This is the placeholder entry point for the single-player mode. Next steps:
      </p>
      <ol className="list-decimal list-inside text-sm">
        <li>Configure players (2–10) and difficulty.</li>
        <li>Start a game with dealer rotation and trump flip.</li>
        <li>Record bids and results into the existing scorekeeper.</li>
      </ol>
    </main>
  );
}

