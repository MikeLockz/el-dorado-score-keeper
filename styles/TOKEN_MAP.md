# Tailwind Color Tokens

Phase 2 introduces semantic color tokens backed by CSS variables so status badges, muted surfaces, and cross-theme accents share the same naming. Tailwind resolves these via `bg-*`, `text-*`, and `border-*` shorthands that read from the new variables.

## Surface Tokens

| Token                                                  | Purpose                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `bg-surface-subtle` / `text-surface-subtle-foreground` | Secondary backgrounds such as table headers or muted cards.                                 |
| `bg-surface-muted` / `text-surface-muted-foreground`   | Placeholder content, skeletons, or quiet separators.                                        |
| `bg-surface-accent` / `text-surface-accent-foreground` | Hover/active states that need a little more emphasis without clashing with primary buttons. |

## Status Tokens

| Token               | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `*-status-locked`   | Neutral state for locked rounds.                       |
| `*-status-bidding`  | Brand-aligned blue for bidding or in-progress actions. |
| `*-status-playing`  | Indigo treatment for active play.                      |
| `*-status-complete` | Warm amber tones for completed rounds.                 |
| `*-status-scored`   | Success/confirmation state.                            |

Each status exposes base, foreground, and surface variants (`bg-status-bidding`, `text-status-bidding-foreground`, `bg-status-bidding-surface`) so badges, inline pills, and grid backgrounds stay in sync.

## Migration Notes

- Prefer semantic tokens over raw Tailwind color scales (`bg-sky-100`, `text-slate-500`, etc.).
- When introducing a new badge or subtle block, start with `surface-*` tokens and only reach for bespoke colors if a token is missing.
- Tokens are defined in `styles/global.scss`; updating light/dark variants there automatically updates every consumer.
- If you need a new semantic color, add the CSS variables for light/dark themes and mirror the `@theme inline` mapping so Tailwind exposes it.
