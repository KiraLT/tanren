---
name: ui-probe-overflow-gotcha
description: RNW vertical ScrollView sets overflowX hidden, so document scrollWidth checks miss horizontal overflow inside Page columns; also wide/aside pages leak into Loading/Empty states
metadata:
  type: feedback
---

When a QA probe or done-criterion uses `document.documentElement.scrollWidth === innerWidth` to prove "no horizontal overflow", flag it: react-native-web 0.21 vertical ScrollView is `overflowX: hidden`, so overflow inside a `Page` column is clipped and never reaches the document.

**Why:** UI-DR (2026-10-26) found the Library inline hero meta column shrinks to 96 px at 900 while the probe would still pass.

**How to apply:** ask for a per-element check (`scrollWidth > clientWidth` under `[role=main]`/`[role=complementary]`) instead. In the same review, `Page wide` / `aside` set unconditionally on a route made its Loading/NotFound states 1136 wide, against the "states stay single 600 column" rule; check route-level layout props are gated on the Ready/Found branch.
