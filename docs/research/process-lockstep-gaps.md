# Lockstep gaps 22:32–22:51 (2026-10-26): what caused them

**Question.** In the retro (2026-10-26-v4-evening), every live agent went idle at the same moment three times.
Was the main session blocking them, or was the provider throttling?

**Answer.** Neither. The Mac went to sleep. It was on battery, and the battery profile sleeps the system
after 1 minute idle (`sleep 1`, `displaysleep 2`). No process held a sleep assertion, so macOS
idle-slept with 11 agents mid-flight. Every agent and the Lead froze together, and they resumed on
the next DarkWake or Wake. Confidence: **observed** (power log and transcripts agree to within a second).

## Setup
- `python3 -I scan.py`: pull every record from 20:20 to 21:00 UTC out of the Lead transcript and the
  subagent `*.jsonl` files (31 files). Then compute gaps longer than 45 s across the union of all subagent events.
- `pmset -g log | grep '^2026-10-26 22:(2[5-9]|3|4|5)'` lists the power-state transitions. The machine is at
  `date +%z` = +0200, so local 22:xx is 20:xx UTC.
- `pmset -g custom` shows the sleep settings. `pmset -g assertions | grep -i 'claude|node'` returned nothing.

## Observation
| Gap (UTC) | Last event, all agents | Power log (local) | First event after |
|---|---|---|---|
| 1: 194 s | 20:32:55 | 22:32:54 `Entering Sleep state due to 'Idle Sleep' … Using Batt (Charge:32%)` | 20:36:08 = 22:36:09 `DarkWake` |
| 2: 182 s | 20:36:15 | 22:36:16 `Entering Sleep state due to 'Maintenance Sleep'` | 20:39:17. Wake 22:38:46 `RTP.keyboard/UserActivity` |
| 3: 553 s | 20:42:03 | 22:41:35 `Idle Sleep`, then two DarkWakes, then 22:42:02 `Maintenance Sleep … 554 secs` | 20:51:16 = 22:51:16 `DarkWake … rtc/Maintenance` |

- **Lockstep, not drift.** After gap 1, six agents produced their next record in the same second
  (20:36:08–09). After gap 2, six did at 20:39:17–18 (one at 20:39:33). The last record before each gap
  varied by agent (`api-request`, `assistant:thinking`, `tool_result`, `tool_use[Bash]`), so they were
  not all waiting on the same tool.
- **The Lead was not blocking anyone.** Before gap 1 it had just issued an `api-request` (20:32:43).
  Before gap 3 it was streaming two SendMessage calls (20:42:02). It was not running a foreground
  Bash, Artifact or Agent call. Its record on resume says so directly:
  `"error":"server_error","streamCutCause":"stream_suspended"` and `API Error: Your computer went to sleep mid-response.`
  (20:51:16). Gaps 1 and 2 end with `"subtype":"api_error" … "source":"connection_retry"`, which is a
  dropped connection, not a 429.
- **No throttling.** `overloaded` matched 0 times. The 7 `"429` hits and 2 `rate_limit` hits are hash
  substrings and quoted source code, not errors. `retryAttempt` appears twice, both `connection_retry` attempt 1.
- **Live agents at gap start** (any record in the 2 min before): gap 1: 11, gap 2: 7, gap 3: 8.
  The retro's estimate of about 12 was close.
- Gap 2 resumed 31 s after the user-activity wake. **Inferred:** the agents waited for Wi-Fi to
  re-associate and the TCP connections to re-establish.

## What would falsify this
A gap during which `pmset -g log` shows no Sleep entry, or agents that resume at scattered times
without `connection_retry` or `stream_suspended`. Neither happened.

## Rule for Tanren
**During any fan-out, keep the Mac awake.** At session start the Lead runs a background
`caffeinate -i -w <claude pid>`. `-i` prevents idle system sleep, also on battery, and `-w` ends it
when Claude Code exits. Alternatively, the owner keeps the Mac on AC power and the lid open.
`caffeinate` does not stop sleep when the lid is closed on battery.

Unattended runs also need the existing mtime watchdog (memory `unattended-watchdog`). A stall where every
agent is silent at the same time is the signature of a system sleep, not of one stuck agent.

Cost of the evening's gaps: 194 + 182 + 553 s, about 15.5 min of wall clock lost across 7–11 agents.
