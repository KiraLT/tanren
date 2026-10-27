---
name: resume-nonblocking
description: In a nested team-lead, SendMessage resumes return immediately (Agent calls block) — use resumes for parallel fix rounds and pair them with a fresh blocking Agent call
metadata:
  type: feedback
---

Inside a nested team-lead, an `Agent` call blocks until the child hands back, but `SendMessage` to a finished child resumes it and returns at once. STLS (2026-10-27) ran 4b + two review fixes + STLS-5 r2 concurrently by sending resumes, then one blocking `Agent` (reviewer or new engineer) in the same message; all reports arrived as queued messages. Wave of resumes → wait with a Bash until-loop on `tasks/<id>.output` (grep SubagentHandback, mtime newer than dispatch).

**Why:** a blocking Agent call alone serialises; resumes give overlap across what would otherwise be separate waves (STLS finished in 54 of 110 min).

**How to apply:** route review fixes and follow-up parts by resume in the same message as the next blocking dispatch (reviewer/QA). Run read-only QA on its own port in parallel with the final review when the fix round cannot touch the e2e path. Related: [[background-dispatch]].
