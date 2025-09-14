# Game Landing Page — Design Recommendations

A welcoming, mode-driven hub that lets players quickly choose how they want to play: Single Player, Multiplayer, or Score Card for in‑person score keeping.

---

## Objectives

- Clarity: Make the three core modes unmistakable and one tap/click away.
- Invitation: Use engaging icons/visuals and action-oriented copy to encourage exploration.
- Speed: Provide “Quick Actions” (resume last game, join by code) from the hero.
- Cohesion: Use existing color, type, iconography.
- Accessibility: AA contrast, keyboard-first navigability, screen reader clarity.

---

## Information Architecture

- Header: Logo/wordmark, `How To Play`, `Settings` (gear), optional theme toggle.
- Hero: Tagline, brief subcopy, prominent CTAs for top tasks.
- Modes Grid: Three feature cards — Single Player, Multiplayer, Score Card.
- Secondary: Recent sessions, Import/Export score files, Tips.
- Footer: Credits, version, privacy/help links.

Suggested routes:
- `/single` — Start or continue single player.
- `/multi/host` and `/multi/join` — Multiplayer paths.
- `/scorecard` — In‑person score keeping.
- `/how-to` — Rules and walkthroughs.
- `/settings` — Preferences, color theme, input options.

---

## Accessibility

- Color contrast: All text ≥ AA (4.5:1); large text ≥ 3:1.
- Keyboard nav: Logical tab order, `Skip to content` link, ESC to close overlays.
- Screen readers: Descriptive `aria-label` on each mode card, e.g., “Start single player mode; play solo vs AI”.
- Motion: Respect `prefers-reduced-motion: reduce` (disable parallax, animation).
- Hit targets: Minimum 44×44 px.

---

## Mode Cards

Each card contains: icon, title, 1–2 line description, primary CTA, and a lighter secondary link.

1) Single Player
- Description: “Play solo against adaptive AI. Practice strategies and unlock achievements.”
- Primary CTA: “Start Single Player” → `/single`
- Secondary: “Continue last run” (if available)

2) Multiplayer
- Description: “Host a room or join with a code. Cross‑device, real‑time play.”
- Primary CTA: “Host Game” → `/multi/host`
- Secondary: “Join by code” → `/multi/join`

3) Score Card
- Description: “Track scores for in‑person sessions. Share and export results.”
- Primary CTA: “Open Score Card” → `/scorecard`
- Secondary: “Import previous scores”

Secondary quick links (below grid): Recent Sessions, How to Play, Import/Export.

---

## Content & Copy (Examples)

- Hero Title: “Set Out for El Dorado”
- Subcopy: “Choose your path: practice solo, gather your party, or tally scores on the go.”
- CTAs: “Start Single Player” • “Host Game” • “Open Score Card”
- Empty recents: “No games.”

---

## Wireframes / Sketches

Use these ASCII wireframes as structure guides. They show layout, hierarchy, and content areas; spacing is indicative.

### Desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ LOGO                How To Play     Settings ⚙︎            Theme ◐        │
├────────────────────────────────────────────────────────────────────────────┤
│                         Set Out for El Dorado                              │
│        Choose your path: solo, together, or track scores in person.        │
│        [ Start Single Player ]   [ Host Game ]   [ Open Score Card ]       │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────┐ │
│  │        🧭               │  │         🔥              │  │      🧮     │ │
│  │  Single Player          │  │  Multiplayer            │  │  Score Card │ │
│  │  Practice vs AI and     │  │  Host or join to play   │  │  Keep scores│ │
│  │  unlock achievements.   │  │  together in real time. │  │  in person. │ │
│  │  [ Start ]  (Continue)  │  │  [ Host ]  (Join code)  │  │  [ Open ]   │ │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│  Recent Sessions    • 07/12 “River Run”  • 07/10 “Temple Dash”   [View All] │
│  Tips & Rules       • Learn the basics →  • Advanced scoring →              │
├────────────────────────────────────────────────────────────────────────────┤
│ © El Dorado Score Keeper · v1.0  ·  Privacy  ·  Help                        │
└────────────────────────────────────────────────────────────────────────────┘
```

Labels:
- Hero CTAs are the fastest routes to each mode.
- Modes Grid uses equal-height cards; primary action visually dominant.
- Secondary area lists recents and learning resources.

### Tablet (≈ 768–1023px)

```
┌──────────────────────────────────────────────┐
│ LOGO            How To Play    ⚙︎            │
├──────────────────────────────────────────────┤
│          Set Out for El Dorado              │
│  Choose your path: solo, together, or score │
│  [ Start Single ]  [ Host Game ]  [ Score ] │
├──────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────┐│
│  │ 🧭 Single Player     │  │ 🔥 Multiplayer  ││
│  │ Practice vs AI...   │  │ Host/Join room  ││
│  │ [ Start ] (Cont.)   │  │ [ Host ] (Join) ││
│  └─────────────────────┘  └─────────────────┘│
│  ┌──────────────────────────────────────────┐│
│  │ 🧮 Score Card                            ││
│  │ Keep scores in person.  [ Open ]         ││
│  └──────────────────────────────────────────┘│
├──────────────────────────────────────────────┤
│ Recent • River Run • Temple Dash   [View All]│
└──────────────────────────────────────────────┘
```

### Mobile (≤ 767px)

```
┌──────────────────────────────────────┐
│ LOGO                         ☰       │
├──────────────────────────────────────┤
│   Set Out for El Dorado             │
│   Solo, together, or track scores.  │
│   [ Start Single ]                  │
│   [ Host Game ]                     │
│   [ Open Score Card ]               │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ 🧭  Single Player                │ │
│ │ Practice vs AI...               │ │
│ │ [ Start ]   (Continue)          │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 🔥  Multiplayer                  │ │
│ │ Host or join a room.            │ │
│ │ [ Host ]   (Join code)          │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 🧮  Score Card                   │ │
│ │ Keep scores in person.           │ │
│ │ [ Open ]                         │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ Recent Sessions                      │
└──────────────────────────────────────┘
```

---

## Layout & Spacing

- Grid: 3 columns on desktop, 2 on tablet, 1 on mobile; 24–32px gutters.
- Card: 16–24px internal padding; 12–16px between icon, title, and text.
- Hero: 64–96px vertical padding; CTAs grouped with 12px gap.
- Visual rhythm: consistent 8px base unit; round corners 12–16px.

---

## Components (for implementation)

- `Header`: logo, top nav, theme toggle, responsive menu.
- `Hero`: title, subcopy, three quick CTAs.
- `ModeCard`: props: `icon`, `title`, `description`, `primaryCta` {label, to}, `secondary` {label, to}.
- `QuickLinks`: recent sessions (reads from storage/API), link to How To Play.
- `Footer`: version, links.

Example ModeCard anatomy:

```
┌────────────────────────────────────────┐
│  [Icon]  Title                         │
│  Short description over 1–2 lines.     │
│  [ Primary CTA ]    Secondary link →   │
└────────────────────────────────────────┘
```

---

## States & Edge Cases

- Empty State: Hide recents; show “Your games will appear here.”
- Offline: Multiplayer card explains limited functionality; disable Host/Join.
- Loading: Skeleton cards for recents; shimmer on buttons.
- Error: Toast near top (non-blocking) with retry affordance.
- Auth (if applicable): If signed in, show “Resume last game” on first card.

---

## Microcopy & Labels

- `aria-label` examples
  - Single Player card: “Start single player mode — play solo vs AI.”
  - Multiplayer card: “Open multiplayer — host a room or join by code.”
  - Score Card card: “Open score card for in‑person tallying.”

---

## Implementation Notes

- Keep navigation semantic (`<nav>`, `<main>`, `<section>`); use `<button>` for actions; links for navigation.
- Store recent sessions under `localStorage['eldorado.recents']` as an array of `{id, title, date, route}` for quick links.
- Analytics events: `hero_start_single_clicked`, `mode_multiplayer_host_clicked`, `mode_scorecard_open_clicked`.
- Respect user theme preference and store in `localStorage['eldorado.theme']`.

---

## Success Criteria Checklist

- Landing clearly shows three modes with strong CTAs.
- Fully responsive with accessible focus and contrast.
- Quick paths (resume/join) reduce friction.
- Empty, loading, and offline states feel intentional.

