---
name: nomutation-substring
description: GritQL `r"…"` matches are SUBSTRING searches on the node text; noMutation's method regexes were anchored with ^…$ in PROG-F1 (2026-10-27), so only exact mutator names are flagged now
metadata:
  type: feedback
---

A GritQL `$x <: r"push|sort"` matches any node whose text CONTAINS the pattern (proved in PROG-F1: before anchoring, `loads.prefill()`, `.backfill()`, `.pushed()`, `.sorted()`, `.unshiftLater()` were 5 plugin errors in the negative fixture). `.biome/noMutation.grit` now uses `r"^(?:push|…|copyWithin)$"` (and the quoted twin `^["']…["']$`), so `prefill` is legal again; exact names (`push`, `sort`, `fill`, …) are still flagged.

**Why:** PROG-3 had to rename a design's `prefill` to `lastLoads` because of the unanchored regex.
**How to apply:** when writing or reviewing any `.grit` regex, anchor it with `^…$` unless a substring match is intended; still never name an own method exactly after an Array mutator.
