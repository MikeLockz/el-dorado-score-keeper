# Game Landing Page — Design Recommendations

A welcoming landing page that introduces the El Dorado card game and provides quick access to recent games and learning resources.

---

## Objectives

- Clarity: Clearly introduce the El Dorado card game with concise messaging.
- Invitation: Use engaging visuals and action-oriented copy to encourage exploration.
- Speed: Provide "Quick Actions" to resume recent games and access key resources.
- Cohesion: Use existing color, type, iconography.
- Accessibility: AA contrast, keyboard-first navigability, screen reader clarity.

---

## Information Architecture

- Header: Logo/wordmark, `How To Play`, `Settings` (gear), optional theme toggle.
- Hero: Tagline, brief subcopy, prominent primary CTAs.
- Quick Links: Recent sessions, access to game modes and learning resources.
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
- Screen readers: Descriptive `aria-label` on interactive elements.
- Motion: Respect `prefers-reduced-motion: reduce` (disable parallax, animation).
- Hit targets: Minimum 44×44 px.

---

## Hero Section

Contains the game introduction and primary call-to-action buttons.

1. Hero Content

- Title: "Set Out for El Dorado"
- Description: "A card game from south western Michigan."
- Primary CTA: "Start Single Player" → `/single-player`

---

## Quick Links Section

Provides access to recent games and key resources.

1. Recent Games
   - Displays archived games with resume functionality
   - Shows game mode, player count, and progress
   - Empty state: "Your games will appear here."

2. Quick Access
   - "How to Play" link → `/rules`
   - Additional resources and settings access

---

## Content & Copy (Examples)

- Hero Title: "Set Out for El Dorado"
- Subcopy: "A card game from south western Michigan."
- Primary CTA: "Start Single Player"
- Empty recents: "Your games will appear here."

---

## Wireframes / Sketches

Use these ASCII wireframes as structure guides. They show layout, hierarchy, and content areas; spacing is indicative.

### Desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ LOGO                How To Play     Settings ⚙︎            Theme ◐        │
├────────────────────────────────────────────────────────────────────────────┤
│                         Set Out for El Dorado                              │
│              A card game from south western Michigan.                      │
│                       [ Start Single Player ]                              │
├────────────────────────────────────────────────────────────────────────────┤
│                           Quick Links                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Recent Games                                    │  │
│  │  • 07/12 "River Run" - Single Player    [ Resume ]                  │  │
│  │  • 07/10 "Temple Dash" - Score Card      [ Resume ]                  │  │
│  │  • 07/08 "Mountain Pass" - Single Player [ Resume ]                  │  │
│  │                                                                      │  │
│  │                    How to Play →                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│ © El Dorado Score Keeper · v1.0  ·  Privacy  ·  Help                        │
└────────────────────────────────────────────────────────────────────────────┘
```

Labels:

- Hero section introduces the game with primary CTA.
- Quick Links section shows recent games and learning resources.
- Clean, focused layout with clear hierarchy.

### Tablet (≈ 768–1023px)

```
┌──────────────────────────────────────────────┐
│ LOGO            How To Play    ⚙︎            │
├──────────────────────────────────────────────┤
│          Set Out for El Dorado              │
│      A card game from south western Michigan │
│           [ Start Single Player ]           │
├──────────────────────────────────────────────┤
│                Quick Links                   │
│  ┌────────────────────────────────────────┐ │
│  │ Recent Games                          │ │
│  │ • River Run - Single Player [ Resume ] │ │
│  │ • Temple Dash - Score Card [ Resume ] │ │
│  │                                        │ │
│  │ How to Play →                          │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Mobile (≤ 767px)

```
┌──────────────────────────────────────┐
│ LOGO                         ☰       │
├──────────────────────────────────────┤
│   Set Out for El Dorado             │
│ A card game from south western      │
│           Michigan                  │
│   [ Start Single Player ]           │
├──────────────────────────────────────┤
│              Quick Links             │
│ ┌──────────────────────────────────┐ │
│ │ Recent Games                    │ │
│ │ • River Run                     │ │
│ │   Single Player [ Resume ]      │ │
│ │ • Temple Dash                   │ │
│ │   Score Card [ Resume ]         │ │
│ │                                │ │
│ │ How to Play →                  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## Layout & Spacing

- Hero: 64–96px vertical padding; primary CTA centered.
- Quick Links: 24–32px gutters; 16–24px internal padding.
- Visual rhythm: consistent 8px base unit; round corners 12–16px.

---

## Components (for implementation)

- `Header`: logo, top nav, theme toggle, responsive menu.
- `HeroCtas`: title, subcopy, primary call-to-action buttons.
- `QuickLinks`: recent games (reads from storage/API), link to How To Play.
- `Footer`: version, links.

Example QuickLinks anatomy:

```
┌────────────────────────────────────────┐
│           Recent Games                │
│  • Game Title - Mode    [ Resume ]    │
│  • Game Title - Mode    [ Resume ]    │
│                                      │
│         How to Play →                │
└────────────────────────────────────────┘
```

---

## States & Edge Cases

- Empty State: Show "Your games will appear here." in Quick Links.
- Offline: Graceful handling with appropriate messaging.
- Loading: Skeleton states for recent games; shimmer on buttons.
- Error: Toast near top (non-blocking) with retry affordance.

---

## Microcopy & Labels

- `aria-label` examples
  - Primary CTA: "Start Single Player"
  - Resume button: "Resume [game title]"
  - How to Play: "Learn how to play El Dorado"

---

## Implementation Notes

- Keep navigation semantic (`<nav>`, `<main>`, `<section>`); use `<button>` for actions; links for navigation.
- Store recent sessions under `localStorage['eldorado.recents']` as an array of `{id, title, date, route}` for quick links.
- Analytics events: `hero_start_single_clicked`, `recent_game_resumed`, `how_to_play_clicked`.
- Respect user theme preference and store in `localStorage['eldorado.theme']`.

---

## Success Criteria Checklist

- Landing clearly introduces the game with strong primary CTA.
- Fully responsive with accessible focus and contrast.
- Quick paths to recent games reduce friction.
- Empty, loading, and error states feel intentional.
