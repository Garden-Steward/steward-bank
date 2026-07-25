---
description: Run the full agent pipeline (architect → breakdown → implement → inspect) for a feature request
argument-hint: <feature description, or path to an existing .claude/specs/<slug>/ to resume>
---

Orchestrate the feature pipeline for: $ARGUMENTS

You (the main conversation) are the dispatcher — subagents cannot spawn
subagents, so every handoff below goes through you, and the spec files under
`.claude/specs/<slug>/` are the only shared memory between stages. If
$ARGUMENTS points at an existing spec directory, skip to the first incomplete
stage (design.md → tasks.md → implementation → inspection.md).

**Combo features** (spanning garden-vue + steward-bank): first confirm
`~/git/gardensteward/garden-vue` is accessible — if not, ask the user to
relaunch with `--add-dir ../garden-vue` before starting; a pipeline that can
only see half the feature produces a half-designed contract. The architect
will emit an API contract section; that contract, not either repo's code, is
what both lanes implement against.

## Stage 1 — Design
Launch the `systems-architect` agent with the feature request. It writes
`.claude/specs/<slug>/design.md`. Present the Intent and acceptance criteria
to the user for approval before proceeding — the design is the contract for
everything downstream, and it's cheap to change now.

## Stage 2 — Breakdown
Launch the `senior-engineer` agent, pointing it at the design.md path. It
writes `tasks.md`. If it reports a design conflict, stop and surface it to the
user (optionally re-running the architect) instead of pushing forward.

## Stage 3 — Implementation
Dispatch one agent per task — `implementer` for `[BE]` tasks,
`frontend-implementer` for `[FE]` tasks — giving each: the spec directory
path and its task number, nothing else — the brief must stand alone. Launch
parallel-safe tasks concurrently (FE and BE lanes can run side by side);
respect declared dependencies otherwise. When an implementer reports a
brief-vs-reality conflict, resolve it (re-read the code yourself or re-run
senior-engineer for that task) before re-dispatch. After all tasks: run the
full backend test suite (`yarn test`) once from the main thread, since
implementers only ran targeted tests; for combo features also run
`npx eslint` over the changed garden-vue files.

## Stage 4 — Inspection
Launch the `inspector` agent with the spec directory and the base git ref from
before Stage 3 (for combo features, base refs for BOTH repos). It writes
`inspection.md` and returns a verdict; for combo features it verifies both
sides against the API contract, including live browser verification when
feasible.
- PASS: summarize for the user, offer to commit. For combo features that's two
  branches/PRs — cross-link them, and note deploy order from the design's
  compatibility note (backend first, tolerating the old frontend).
- PASS WITH FINDINGS / FAIL: show the AC scorecard and findings; for each GAP
  or DRIFT the user wants fixed, have senior-engineer append a fix task to
  tasks.md and loop back to Stage 3 for those tasks only, then re-run the
  inspector scoped to the affected ACs.

Throughout: relay each agent's key findings to the user in plain language —
agent reports are not shown to them directly.
