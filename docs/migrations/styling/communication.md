# Styling Migration Communication Cadence

## Stakeholders

- **Design:** Product design team (primary contact: design-lead@eldorado.example)
- **Quality Assurance:** QA guild (primary contact: qa-lead@eldorado.example)
- **Engineering:** Styling refactor pod (rotation lead: Staff Engineer on sass migration)

## Weekly Rhythm

- **Tuesday – Design touchpoint (30 min):** Review migrated components, share before/after screenshots, confirm token usage, and collect feedback on edge cases (dark mode, high contrast, responsive behavior).
- **Thursday – QA sync (30 min):** Demo the latest deployed branch, walk through manual QA checklist, and assign regression scenarios for weekend verification.
- **Friday – Async summary:** Post a written update before 4pm PT summarizing completed work, open risks, and next week’s target components. Distribute via `#styling-migration` Slack channel and copy to the engineering journal entry.

## Ad-hoc Communication

- Critical blockers or design-breaking findings trigger an immediate Slack update and, if necessary, a same-day huddle with affected teams.
- All snapshot diffs and Playwright findings are shared in the migration channel, tagged with the owning designer/QA for quick triage.

## Documentation & Tracking

- Meeting notes are appended to the corresponding `docs/migrations/styling/phase-logs/phase-*.md` entry.
- Decisions that impact token naming or theme structure are recorded in `docs/migrations/styling/decisions.md` (created on demand) to maintain an audit trail for Phase 3+ work.
