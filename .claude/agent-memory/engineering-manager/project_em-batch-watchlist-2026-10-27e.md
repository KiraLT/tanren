---
name: em-batch-watchlist-2026-10-27e
description: EM batch 11 watchlist items 61-64 — optional design-system elements in briefs create serial follow-ups, reviewers requesting instead of running workerd, storage-shape grep, Amendment 23 (no legacy, migrate before deploy)
metadata:
  type: project
---
61. A brief that offers the design-system face/asset as "(b) if (a) does not fit the box" when a designer will judge the output guarantees a FIX + serial follow-up task (OAUTH-UI → OAUTH-FONT, ≈ 12 min). Watch for: options in briefs that a downstream verdict will reject. Fix: split the asset task and run it in parallel (P2, batch 11).
62. Reviewers (1.5-min opus) list "workerd project not run" as a should instead of running it (≈ 30 s). reviewer.md now says run; watch whether `should: … not run` lines disappear.
63. Storage-shape changes (hashed tokens, renamed columns) break tests that read the row directly; engineer.md 16 = grep readers incl. tests first. Watch for broken `*.workerd.test.ts` after storage tasks.
64. Owner Amendment 23 (2026-10-27 14:41): no legacy/compat leftovers; migrate live D1 before deploying breaking code. Rules landed in engineer.md 17, reviewer.md, cloudflare-workers "Deploy order". Watch: dead exports kept for their own test; deploys that bundle a non-servable migration.
**Why:** batch 11 evidence (transcripts 2026-10-27 12:00–12:31 UTC).
**How to apply:** check these four in the next batches' reports/reviews before looking for new patterns.
