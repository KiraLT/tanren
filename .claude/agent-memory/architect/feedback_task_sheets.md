---
name: task-sheet-conventions
description: How the Lead wants architect task sheets written in company mode (charter fields, decision status wording, cross-team Assumes, forbidden-commands line, lean model mix, no hardening-type side sheets unless asked)
metadata:
  type: feedback
---

Write team sheets with the full charter fields (Mission, Owned paths, Adjacent with owners / Read-only, Contracts, Provides, Runtime proof, Assumes (cross-team, each cited), Docs, Budget, Forbidden, Report) plus Decisions / Tasks table / Done-criteria / Log; new decisions are `accepted (Lead delegation)`, never "awaiting owner"; plan deviations get a future ADR number, not a `proposed` ADR written by me when another architect owns the ADR range.

**Why:** Lead brief 2026-10-20 (steps 4 and 7): the Lead dispatches team-leads straight from the sheets and reconciles the `Assumes` lists across charters; "awaiting owner" stalls dispatch. Mid-task the Lead also pulled a hardening charter back (it had dispatched one itself) — check `docs/tasks/` for sheets that already exist before writing a sibling. 2026-10-21 (v2-extras, owner away, no approvals, token budget matters): charter and every task carry the "never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine" line; opus only for the hardest service + its tests, sonnet for UI/config/docs; one reviewer per team; ≤ 2 engineers in parallel; keep it lean.

**How to apply:** per-team sheet under `docs/tasks/`; put cross-package contracts in `docs/design/<topic>.md` and only link them; name shared files with exactly one owning team per line and turn needs on others' files into numbered one-line requests (R1…) for the Lead; give each team its own dev-server ports and a scratch export dir; mark unverified library facts `VERIFY:`; Time box = chain-sum + 15 when asked.
