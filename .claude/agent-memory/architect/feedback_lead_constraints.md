---
name: lead-constraints-v2
description: Standing Lead constraints for team sheets while the owner is away (permissions line in every brief, opus only for foundation + reviewer, sonnet restyles from the spec)
metadata:
  type: feedback
---

Every team sheet and brief carries verbatim: "never run a command under `permissions.ask`: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine". Model policy: opus only for the foundation task and the one team reviewer; sonnet (+ `frontend-design` skill for UI) for everything built from a written spec; ≤ 3 engineers in parallel. Keep sheets lean: the design doc is the spec, task rows point at its sections.

**Why:** Lead message during v2 planning (2026-10-21): owner away 8 h, no approvals possible, token budget matters.
**How to apply:** Default for any sheet/brief I write until the Lead says otherwise; add a `spec` column to task tables instead of restating the design.
