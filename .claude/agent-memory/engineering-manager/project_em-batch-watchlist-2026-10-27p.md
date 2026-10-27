---
name: em-batch-watchlist-2026-10-27p
description: EM batch 20 items 115–120 — retyped numbers in dispatch messages, decoding-default fixture ripple, shared-with markers missing, safety-check denial on $VAR paths, reviewer actuals ≈ 2 min, overlap into unreviewed files worked
metadata:
  type: project
---

Batch 20 (2026-10-27 19:10–19:53; PROG-5, PROG-F1, NAV-1, NAV-3/3b, NAV-4 fix, NAV-F1, 4 reviews).

115. **Dispatch-message numbers drift from the design** (PROG-5 "12 → 10 → 8" vs §7.4 10 → 8 → 6). Rule now in the playbook Read-first block; watch whether the next dispatch messages carry the grep for numbers.
116. **Decoding defaults on stored shapes ripple into every round-trip fixture** (3 fixtures, 2 packages). Rule in tests.md; watch for briefs that name the fixtures.
117. **`shared with` and `Committable now` were absent from all six engineer reports** even where files were shared; engineer.md Report now requires both. Watch the next batch's reports; if still missing, the brief template needs the line too.
118. **Built-in safety check denies compound commands with `$VAR/` targets** (not the ask list; NAV-F1's mktemp fixture). Engineers now spell literal `$S/<task>-…` paths. If it recurs, propose a settings allow for `mkdir -p`/`: >` under the scratchpad.
119. **Reviewer actuals 1–2.5 min on 6–10 boxes** for the fourth batch running → boxes 5 (6 for two tasks). Do not lower further: NAV-R3's REQUEST CHANGES took 1.5 min and was correct.
120. **Overlapping follow-ons into unreviewed files worked** (3 commits for 6 tasks, zero collisions) with disjoint regions + Edit-only + ownership-grouped commits; trade-off now in the playbook commit block. Watch for the failure case: an earlier task's reviewer requesting a rewrite of a shared file.

Measurement note: my first per-transcript loop used `set -- $p` and reported every file "missing" — zsh does not word-split unquoted variables (same trap as watchlist item 45). Use `printf | while read n id`.
