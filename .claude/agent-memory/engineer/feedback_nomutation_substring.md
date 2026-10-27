---
name: nomutation-substring
description: The noMutation GritQL regex is unanchored — any method name CONTAINING push/pop/shift/sort/reverse/fill/splice (prefill, unshiftX, resort) is flagged at the call site
metadata:
  type: feedback
---

`.biome/noMutation.grit` matches `$method <: r"push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin"` without anchors, so `repo.prefill(ids)` fails lint even though the design named it `prefill` (PROG-3, 2026-10-27; renamed to `lastLoads`).

**Why:** the rule is syntactic and substring-based; suppressing is reserved for third-party calls.
**How to apply:** before adopting a design-given service method name, check it for those substrings; if it hits, rename and report a `CONFLICT:` line (rule wins over the design).
