import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import SpHandDock from '@/components/views/sp/SpHandDock';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('SpHandDock', () => {
  beforeEach(() => {
    // Ensure clean DOM
    document.body.innerHTML = '';
  });

  it('renders cards grouped by suit and invokes callbacks', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    const suitOrder = ['spades', 'hearts'] as const;
    const humanBySuit = {
      spades: [{ suit: 'spades', rank: 14 }],
      hearts: [{ suit: 'hearts', rank: 2 }],
    } as any;
    const isSelected = vi.fn(() => false);
    const canPlayCard = vi.fn(() => true);
    const onToggleSelect = vi.fn();
    const onPlayCard = vi.fn();

    root.render(
      React.createElement(SpHandDock, {
        suitOrder,
        humanBySuit,
        isPlaying: true,
        isSelected,
        canPlayCard,
        onToggleSelect,
        onPlayCard,
      }),
    );

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const buttons = Array.from(div.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    // Click first card -> toggle select
    buttons[0]!.click();
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    // Double-click triggers play
    const dbl = new MouseEvent('dblclick', { bubbles: true });
    buttons[0]!.dispatchEvent(dbl);
    expect(onPlayCard).toHaveBeenCalledTimes(1);

    root.unmount();
    div.remove();
  });
});
