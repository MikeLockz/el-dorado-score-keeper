# Game Landing Page — Design Recommendations

A welcoming, mode-driven hub that lets players quickly choose how they want to play: Single Player, Multiplayer, or Score Card for in‑person score keeping. The look and feel riff on an “El Dorado expedition” vibe: warm golds, lush greens, parchment textures, and sturdy typography.

---

## Objectives

- Clarity: Make the three core modes unmistakable and one tap/click away.
- Invitation: Use engaging icons/visuals and action-oriented copy to encourage exploration.
- Speed: Provide “Quick Actions” (resume last game, join by code) from the hero.
- Cohesion: Unify color, type, iconography with an “adventure” theme.
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

## Visual Design

- Color Palette
  - Jungle Green: `#1F6F50` (primary)
  - Deep Emerald: `#2E8B57` (hover/active)
  - El Dorado Gold: `#D4A72C` (accents/CTAs)
  - Parchment: `#F5F0E6` (background surface)
  - Stone Gray: `#4B5563` (text, borders)
  - Charcoal: `#222831` (headlines, high-contrast text)
  - Optional Accent (Teal): `#2D7D9A` (links, focus states)

- Typography
  - Headings: a sturdy display with adventure tone (e.g., `Oswald`, `Cinzel`) with fallback: `Georgia, 'Times New Roman', serif` for classical gravitas or `Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif` for a rugged feel.
  - Body: modern, readable sans (e.g., `Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`).
  - Scale: H1 40–48, H2 28–32, body 16–18; line-height 1.4–1.6.

- Iconography & Imagery
  - Duotone line icons with gold highlights; rounded corners for friendliness.
  - Subtle parchment paper texture in hero; faint map grid/jungle leaves as a barely‑there background pattern (low contrast, 3–4% opacity).
  - Use gentle, short-distance parallax for background pattern on desktop; disable with `prefers-reduced-motion`.

---

## Interactions & Motion

- Cards elevate 2–4px and slightly tilt on hover; gold accent intensifies.
- Buttons use a quick 120–160ms ease-out scale to 1.02 on hover.
- Focus states are highly visible: 2px teal outline with 4px offset shadow.
- Mode card icons can have subtle ambient motion (e.g., torch flicker, compass sway) within reduced-motion rules.

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

1) Single Player — icon: 🧭/compass or explorer helm
- Description: “Play solo against adaptive AI. Practice strategies and unlock achievements.”
- Primary CTA: “Start Single Player” → `/single`
- Secondary: “Continue last run” (if available)

2) Multiplayer — icon: 🔥/campfire or linked tokens
- Description: “Host a room or join with a code. Cross‑device, real‑time play.”
- Primary CTA: “Host Game” → `/multi/host`
- Secondary: “Join by code” → `/multi/join`

3) Score Card — icon: 🧮/ledger or clipboard
- Description: “Track scores for in‑person sessions. Share and export results.”
- Primary CTA: “Open Score Card” → `/scorecard`
- Secondary: “Import previous scores”

Secondary quick links (below grid): Recent Sessions, How to Play, Import/Export.

---

## Content & Copy (Examples)

- Hero Title: “Set Out for El Dorado”
- Subcopy: “Choose your path: practice solo, gather your party, or tally scores on the go.”
- CTAs: “Start Single Player” • “Host Game” • “Open Score Card”
- Empty recents: “No expeditions yet — your adventures will appear here.”

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
│ │ Keep scores in person.          │ │
│ │ [ Open ]                        │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ Recent Sessions • River Run • Temple Dash   │
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

- Empty State: Hide recents; show “Your adventures will appear here.”
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

## Quick Style Tokens (suggested)

```
:root {
  --color-bg: #F5F0E6;
  --color-text: #222831;
  --color-muted: #4B5563;
  --color-primary: #1F6F50;
  --color-primary-strong: #2E8B57;
  --color-accent: #D4A72C;
  --color-focus: #2D7D9A;

  --radius: 14px;
  --elev-1: 0 2px 6px rgba(0,0,0,.08);
  --elev-2: 0 6px 18px rgba(0,0,0,.12);
}
```

---

## Icon Suggestions

- Single Player: compass (🧭), explorer hat, lone pawn/token.
- Multiplayer: campfire (🔥), two interlocking tokens, linked circles.
- Score Card: abacus (🧮), clipboard, ledger book.

Use a consistent line weight; apply gold accent for highlights and green for outlines.

---

## Success Criteria Checklist

- Landing clearly shows three modes with strong CTAs.
- Inviting visuals support the El Dorado theme.
- Fully responsive with accessible focus and contrast.
- Quick paths (resume/join) reduce friction.
- Empty, loading, and offline states feel intentional.

