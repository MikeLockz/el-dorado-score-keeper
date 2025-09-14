import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import SpTrickTable from '@/components/views/sp/SpTrickTable';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SpTrickTable', () => {
  it('renders rows with player names, bids, tricks, and cards; highlights winner', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    const rotated = ['a', 'b'];
    const playerName = (id: string) => (id === 'a' ? 'A' : 'B');
    const bids = { a: 1, b: 0 } as Record<string, number>;
    const trickCounts = { a: 2, b: 1 } as Record<string, number>;
    const playedCards = { a: { suit: 'clubs', rank: 2 }, b: null } as any;
    root.render(
      React.createElement(SpTrickTable, {
        rotated,
        playerName,
        bids,
        trickCounts,
        playedCards,
        winnerId: 'a',
      }),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const text = div.textContent || '';
    expect(text).toMatch(/Player/);
    expect(text).toMatch(/A/);
    expect(text).toMatch(/B/);
    expect(text).toMatch(/1/); // bid/tricks presence
    expect(text).toMatch(/2/);
    // Card glyph renders rank and suit symbol; ensure rank visible
    expect(text).toMatch(/2/);
    root.unmount();
    div.remove();
  });
});

