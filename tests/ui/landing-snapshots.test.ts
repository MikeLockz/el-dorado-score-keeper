import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Compass, Flame, Calculator } from 'lucide-react';
import ModeCard from '@/components/landing/ModeCard';

function sanitize(html: string): string {
  // Remove class and data-* attributes for stability; collapse whitespace; simplify SVGs
  return html
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\sdata-[a-zA-Z-]+="[^"]*"/g, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/g, '<svg></svg>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

describe('ModeCard snapshots (structure only)', () => {
  it('renders Single Player, Multiplayer, and Score Card cards', () => {
    const tree = React.createElement(
      'div',
      null,
      React.createElement(ModeCard as any, {
        icon: React.createElement(Compass as any, { className: 'h-5 w-5' }),
        title: 'Single Player',
        description: 'Play solo against adaptive AI. Practice strategies and unlock achievements.',
        primary: { label: 'Start', href: '/single-player', ariaLabel: 'Start Single Player' },
        secondary: { label: 'Continue last run', href: '/single-player' },
        ariaLabel: 'Start single player mode — play solo vs AI.',
      }),
      React.createElement(ModeCard as any, {
        icon: React.createElement(Flame as any, { className: 'h-5 w-5' }),
        title: 'Multiplayer',
        description: 'Host a room or join with a code. Cross‑device, real‑time play.',
        primary: { label: 'Host', href: '/rules', ariaLabel: 'Host Game (coming soon)' },
        primaryEvent: 'mode_multiplayer_host_clicked',
        secondary: { label: 'Join by code', href: '/rules' },
        ariaLabel: 'Open multiplayer — host a room or join by code.',
      }),
      React.createElement(ModeCard as any, {
        icon: React.createElement(Calculator as any, { className: 'h-5 w-5' }),
        title: 'Score Card',
        description: 'Track scores for in‑person sessions. Share and export results.',
        primary: { label: 'Open', href: '/scorecard', ariaLabel: 'Open Score Card' },
        primaryEvent: 'mode_scorecard_open_clicked',
        secondary: null,
        ariaLabel: 'Open score card for in‑person tallying.',
      }),
    );

    const html = renderToStaticMarkup(tree);
    expect(sanitize(html)).toMatchInlineSnapshot(
      '"<div><div><section aria-label=\"Start single player mode — play solo vs AI.\"><div><div><svg></svg></div><h3>Single Player</h3></div><p>Play solo against adaptive AI. Practice strategies and unlock achievements.</p><div><a aria-label=\"Start Single Player\" href=\"/single-player\">Start</a><a href=\"/single-player\">Continue last run</a></div></section></div><div><section aria-label=\"Open multiplayer — host a room or join by code.\"><div><div><svg></svg></div><h3>Multiplayer</h3></div><p>Host a room or join with a code. Cross‑device, real‑time play.</p><div><a aria-label=\"Host Game (coming soon)\" href=\"/rules\">Host</a><a href=\"/rules\">Join by code</a></div></section></div><div><section aria-label=\"Open score card for in‑person tallying.\"><div><div><svg></svg></div><h3>Score Card</h3></div><p>Track scores for in‑person sessions. Share and export results.</p><div><a aria-label=\"Open Score Card\" href=\"/scorecard\">Open</a></div></section></div></div>"',
    );
  });
});
