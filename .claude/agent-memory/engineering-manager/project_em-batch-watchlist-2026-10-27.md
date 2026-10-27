---
name: em-batch-watchlist-2026-10-27
description: Batch 7 watchlist (items 41–45): wrangler deploy --dry-run in briefs, EM-delta lag to live team-leads, shared capture stacks, Lead colour rulings without token hex, zsh scalar splitting
metadata:
  type: project
---

Open watchlist after EM batch 7 (2026-10-27 11:05). Check each at the next batch; drop when clean twice.

41. **Prompt-gated or non-existent proofs in briefs.** WD-1's brief asked for `wrangler deploy --dry-run` lines that
    the command never prints; one Bash call ran 22.7 min. Rule now in engineer.md 9(c); the brief-side rule is P2
    (lead-playbook). Watch: any engineer transcript containing `wrangler deploy`.
42. **EM-delta lag.** Batch 6 edits reached the r5 team-lead 2 min after its children were briefed → round-1 reports
    lacked box proofs. If it recurs, propose: team-lead re-reads engineer.md/reviewer.md mtime before each round's
    briefs (cheap: `stat -f %m`).
43. **Shared capture stacks.** r5 children reused the shooter's 8911/8912 servers; they vanished mid-run. Fixed in
    team-lead.md + ui-check; verify the next pair's transcripts show per-task pid files.
44. **Colour rulings.** Lead ruled `surfaceRaised` for a light disc; light `surfaceRaised` = `bg`. P3 proposed.
    Watch escalation rulings for token names without hex.
45. **Lead zsh splitting** (2 incidents 2026-10-27). P1 proposed (`setopt shwordsplit` / arrays). Watch the Lead's
    Log for "File name too long" / curl usage errors.

**Why:** these are the only wastes in batch 7 with wall-clock cost; everything else (SF-1, LOGO-4, BRAND-2b,
DEPLOY-5) ran inside its box.
**How to apply:** at batch 8 read this list first, measure each against the new transcripts, then update or drop.
Related: [[em-batch-watchlist-2026-10-26]]
