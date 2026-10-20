---
name: owner-delegation
description: Since 2026-10-20 the owner delegated every project decision to the Lead; ADRs the Lead decides are marked accepted with a fixed status string (plan Amendment 3)
metadata:
  type: project
---

Since 2026-10-20 the owner (Lukas) delegates all project decisions to the Lead ("Overall always
you decide, I will review everything when I feel like"), recorded as `docs/plan.md` Amendment 3.
ADRs the Lead decides get `Status: accepted (Lead decision under owner delegation, 2026-10-20;
plan Amendment 3)` and keep existing Context/Alternatives text when flipping from proposed.

**Why:** the owner reviews asynchronously; `proposed` ADRs no longer block work.
**How to apply:** do not leave ADRs `proposed` waiting for the owner unless the Lead's brief says
so; still list anything genuinely unconfirmed (e.g. `VERIFY:` items) inside the ADR. Check that
Amendment 3 actually appears in `docs/plan.md` (it was missing on 2026-10-20; the Lead owns it).
