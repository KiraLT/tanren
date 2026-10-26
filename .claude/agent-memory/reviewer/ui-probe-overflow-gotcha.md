---
name: ui-probe-overflow-gotcha
description: RNW ScrollView clips overflowX and swallows docH/--full screenshots (set a tall viewport); hidden gated Stack pollutes histograms; gate wide/aside on Ready states
metadata:
  type: feedback
---

When a QA probe or done-criterion uses `document.documentElement.scrollWidth === innerWidth` to prove "no horizontal overflow", flag it: react-native-web 0.21 vertical ScrollView is `overflowX: hidden`, so overflow inside a `Page` column is clipped and never reaches the document.

**Why:** UI-DR (2026-10-26) found the Library inline hero meta column shrinks to 96 px at 900 while the probe would still pass.

**How to apply:** ask for a per-element check (`scrollWidth > clientWidth` under `[role=main]`/`[role=complementary]`) instead. In the same review, `Page wide` / `aside` set unconditionally on a route made its Loading/NotFound states 1136 wide, against the "states stay single 600 column" rule; check route-level layout props are gated on the Ready/Found branch.

**Vertical capture (LAND-R, 2026-10-26):** on an RNW `Page scroll` the page scrolls inside the ScrollView, so `document.documentElement.scrollHeight` and `agent-browser screenshot --full` both equal the viewport; the engineer's `UI-*.png` were above-the-fold only and a "docH" number is really the ScrollView's `scrollHeight`. To see or measure the whole page: `set viewport <w> <contentH+50>` then a plain screenshot. The gated `Stack` stays mounted under `display:none`, so text-size and button histograms include Today's 72/96 px numerals and 0-high buttons unless elements with `getBoundingClientRect().width === 0` are dropped, and `[data-testid=page-frame]` / `[role=navigation]` queries must pick the visible one.
