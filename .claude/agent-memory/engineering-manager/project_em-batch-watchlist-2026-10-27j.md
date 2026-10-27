---
name: em-batch-watchlist-2026-10-27j
description: EM batch 16 (health module HM-D→r3 chain 55 min, STLS-F5 skew finding, G-F1, INT-N-a, stale ui-check grep ×3, 17:02 commit abort) — items 86–90: spec-vs-rule/spec-vs-self conflicts, post-revoke truth table + ledger skew, skill recipe defects fixed in-task + forwarded, UI-row brief pointers by grep, Committable-now lines
metadata:
  type: project
---

Items 86–90 (2026-10-27, batch 16; transcript metrics: HM-D 6.6 min, HM-1 8.5, HM-2 9.3, HM-3+r2+r3 22.2 active / 26.8 span (101 turns), HM-DR 3.2, HM-4 QA 12.4, STLS-F5+r2+r3 27.8 active / 31.7 span (106 turns, 181 tools), REV STLS/G-F1 3.4 active / 16.3 span, G-F1 4.6, INT-N-a 10.5, INT-N 6.8, HOTFIX-1/2 13.5, REV-HOTFIX-1 1.3; all opus tasks under half their boxes).

86. **Spec conflicts cost the only HM rounds**: uppercase labels vs react.md (HM-1 overrode), §3 464 vs 431 (aside padding assumed), §8 criteria wrong for Today, §4 heading "route order unchanged" vs body "right column" (HM-3 kept old order as an unflagged Decision → designer F1). Fixed where: architect.md UI-spec checks; engineer.md `CONFLICT:` first Decision line. Watch: the next UI spec cites layout constants file:line; the next engineer report with a spec departure starts Decisions with CONFLICT.
87. **Fast pattern confirmed**: spec with width arithmetic + state matrix + frozen exports + pure math modules → three opus tasks at 8–10 min each, gate green, zero code rounds. Owner rejection → accepted in 55 min. Keep: HM-D shape (2 directions + merge + spec + briefs in 6 min) is the template for owner-rejected surfaces.
88. **Ledger retention vs skew** (STLS-F5, caught by review — positive): purge at exp ignored CLOCK_SKEW. Fixed where: architect.md auth checklist (post-revoke truth table, retention = exp + skew), reviewer.md auth pass (6)(7). Also the brief's "old access token is 401" contradicted ADR-0022 → briefs copy the truth table (P-item playbook). Watch: next token/nonce ledger design names the retention number.
89. **Skill recipe defect hit 3×** before fix + no forward: engineer.md Kaizen now says fix the skill line in-task and name it first; forwarding to live agents is the Lead's (P1). Watch: zero repeat hits of a reported recipe defect; Lead forwards skill fixes by SendMessage.
90. **Commit sets**: team-lead.md interims carry `Committable now:` / `Hold:` with dependencies. Watch: the Lead's next path-filtered commit uses those lines instead of guessing (17:02 abort).

**Why:** every HM round and the INT-N-a stumble came from a text that disagreed with another text (spec vs rule, heading vs body, brief vs ADR, brief vs code). Checks that compare texts before dispatch are cheaper than any review.
**How to apply:** when a round's cause is "the spec/brief said X", ask which other text already said not-X and put a read-before-write check at the author's role.
