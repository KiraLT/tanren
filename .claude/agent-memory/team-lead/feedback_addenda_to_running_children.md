---
name: addenda-to-running-children
description: Route late review findings to a child that is still running by SendMessage (queued to its next tool round) instead of a new dispatch; split capture from UI build when the endpoint lands in the same wave
metadata:
  type: feedback
---

A review finding that lands while the owning engineer is still in its fix round goes to that engineer by `SendMessage` as an "addendum" (+ a few minutes of box); the message queues to its next tool round, or resumes it if it just finished. Garmin team 2026-10-27: GM-R's S2/S3/S4 reached GM-4, GM-2 and the capture child mid-round; all three folded them in and the team finished in ≈ 58 of 110 min with 3 review delta passes and no extra dispatch.

**Why:** a fresh engineer re-reads the context (≥ 2 min) and would collide on the same files; the live child already holds them.

**How to apply:** name the files the addendum grants and the files it must NOT touch (another child's), and send the reviewer a delta pass listing every landed round with the engineers' Verification lines verbatim. When a UI task's screenshots need a server endpoint built in the same wave, give the UI engineer code + tests only and resume it later as the capture task (GM-6S), owning the port pair alone. Related: [[resume-nonblocking]], [[background-dispatch]].
