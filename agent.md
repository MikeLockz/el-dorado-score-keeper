# Agent Guidelines (Repo‑Local)

This repository opts in to non‑interactive file creation and edits by the agent. Do not ask for permission before creating or modifying files inside the workspace.

Policy summary:

- Create new files and update existing files without prompting.
- Prefer `apply_patch` for all file changes; group related edits into a single patch when practical.
- Only pause for confirmation when an action is potentially destructive or out of scope:
  - Deleting files or renaming across directories.
  - Rewriting commit history or force‑pushing.
  - Writing outside the workspace or into protected OS paths.
  - Executing destructive shell commands (e.g., `rm -rf`, `git reset --hard`).
  - Networked actions that publish externally (e.g., pushing branches) unless explicitly requested.

Operational preferences:

- Keep messages concise and avoid “may I?” confirmations for routine edits.
- Use short preambles to explain upcoming grouped actions.
- For multi‑step tasks, maintain an up‑to‑date plan with exactly one step in progress.
- When adding tests, scaffolding, or docs, proceed directly if clearly aligned with the request.

Scope of “safe without asking”:

- Creating docs (e.g., `STATE.md`, `TEST_PLAN.md`, `agent.md`).
- Adding config, test files, and source modules within the repo.
- Updating `package.json`, config files, and CI scripts to support the requested work.

If ambiguity exists about intent or scope, ask one clarifying question, but default to making the smallest reasonable change without blocking on approval.

