---
name: task-sheet-conventions
description: How the Lead wants architect task sheets written in company mode (charter fields, decision status wording, cross-team Assumes, no hardening-type side sheets unless asked)
metadata:
  type: feedback
---

Write team sheets with the full charter fields (Mission, Owned paths, Read-only, Contracts, Provides, Runtime proof, Assumes (cross-team), Docs, Budget, Forbidden, Report) plus Decisions / Tasks table / Done-criteria / Log; new decisions are `accepted (Lead delegation)`, never "awaiting owner"; plan deviations get a future ADR number, not a `proposed` ADR written by me when another architect owns the ADR range.

**Why:** Lead brief 2026-10-20 (steps 4 and 7): the Lead dispatches team-leads straight from the sheets and reconciles the `Assumes` lists across charters; "awaiting owner" stalls dispatch. Mid-task the Lead also pulled a hardening charter back (it had dispatched one itself) — check `docs/tasks/` for sheets that already exist before writing a sibling.

**How to apply:** per-team sheet under `docs/tasks/step-N.md`; put cross-package contracts in `docs/design/<topic>.md` and only link them; name shared files (`wrangler.jsonc`, `src/index.ts`, `Config.ts`) with exactly one owning team per line; give each team its own dev-server ports; mark unverified library facts `VERIFY:` and name at most one `spike` task when a runtime question blocks the plan.
