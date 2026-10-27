---
name: em-batch-watchlist-2026-10-27t
description: EM batch 24 items 139–144 — "phone unchanged" needs one 390 per touched route (shared components render at every width), reused component = compare both surfaces' handlers, CLAUDE.md diets list deleted facts, serial design chain on one shared symbol (≈ 25 min), gate "known noise" (MaxListeners), demo seed has no nutrition rows; transcript location
metadata:
  type: project
---

Batch 24 (2026-10-27 21:07–21:30; DESK-D/0/1/2, DESK-R, GAL-7, SPK-ML, DESK fix round).

139. **Per-route 390 proof**: DESK-0 changed `FeedList`'s first-header margin (renders at every width) under a brief saying "390 untouched; one 390 Home control shot" → Activity phone header moved 8 px, caught only by DESK-R. Now: playbook Done-when checkbox, reviewer "per touched route", engineer 14, architect Done-when bullet. Watch: next "phone unchanged" brief lists routes; reviewer findings named "no phone capture for <route>" should be 0 because the report already has them.
140. **Reused component, two consumers**: Home `openFeedItem` routed an in-progress card to the detail page while the Activity tab sent it to the pager; DESK-R found it in 2 min by comparing consumers (the batch-23 "refresh rules have consumers" habit generalised). reviewer bullet + engineer rule 2. Watch: a second-surface render with its own handler = engineer leak; target 0.
141. **CLAUDE.md diet deletions**: DESK-0 dropped "Not built: a second user on one device" silently. engineer 15 (list deleted facts + reason), playbook Accepting (8) `budget cut: <fact>` in commits. Watch: next CLAUDE.md shrink report — every deleted fact named?
142. **Serial design chain**: DESK-D 4.5 → 0 9 → 1 7 → 2 3 → R 2 min on one engineer ≈ 25 min wall-clock; architect "after X → foundation task" rule (batch 23) is in place; playbook speed tactic 3 now tells the Lead to ask the architect to move the symbol before dispatch. Watch: next design sheet with siblings sharing a prop — are they parallel?
143. **Gate known noise**: `MaxListenersExceededWarning … [Socket]` = vitest 5.0.5 fork pool, exit 0 (SPK-ML 2.8 min). monorepo "Known noise" + engineer 7. Watch: any further spike or report line about it = the skill line was not read.
144. **Demo seed has no nutrition rows**: `apps/mobile/src/store/seed.ts` writes no `food_entry`/`daily_health`; nutrition captures need the seeded worker + magic-link sign-in (curl with `Origin`, fresh `--session`). ui-check Full stack recipe. Watch: a capture task that reports "module not visible" on a dev store.

Also: GAL gallery script reports 74 "missing" shots because `tanren-screens.html` (52) + `UI-PROG-rows.html` (39) reference flat `shots/UI-PROG-*` while the PNGs live in `docs/design/screens/v6b/`; the Lead maps them at publish time. Proposed GAL-8 (sonnet, 3 min): rewrite the src prefix to `shots/v6b/` and republish — no ignore list (it would hide real missing files). Watch: GAL-8 landed → `node docs/design/gallery.mjs` exits 0.

Transcript location (for hook counts): `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/<session>/tasks/*.output`, NOT `~/.claude/projects/...`. Hour three: 0 real denials in 7 non-EM transcripts; the grep string itself appears in EM briefs, so exclude `grep -l 'EM batch'` transcripts (or grep the hook's full sentence) before counting.
