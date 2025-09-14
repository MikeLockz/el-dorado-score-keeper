import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import SpHeaderBar from '@/components/views/sp/SpHeaderBar';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SpHeaderBar', () => {
  it('renders hand count, trump, dealer, and broken flag', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(
      React.createElement(SpHeaderBar, {
        handNow: 3,
        tricksThisRound: 10,
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 12 },
        dealerName: 'Alice',
        trumpBroken: true,
      }),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const text = div.textContent || '';
    expect(text).toMatch(/Hand:\s*3\/10/);
    expect(text).toMatch(/Trump:/);
    expect(text).toMatch(/Dealer:\s*Alice/);
    expect(text).toMatch(/Broken:\s*Yes/);
    root.unmount();
    div.remove();
  });
});

