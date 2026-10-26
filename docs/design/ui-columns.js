// UI-D column geometry probe (docs/design/ui-desktop.md §4). Prints left / width / top / height
// (rounded px) for the page columns and the in-content `Columns`.
//
// Usage (agent-browser, same as ui-measure.js; set the viewport first, e.g. `ab set viewport 1280 800`):
//   ab eval "$(cat docs/design/ui-columns.js)"
// Expected at 1280 (+-1 px for a scrollbar): main.left = (innerWidth - 1136) / 2 = 72, widths per
// the screen's row in ui-desktop §3, side.left = main.left + main.width + 24, same top for both.
// A selector that matches nothing visible (width > 0) prints null.
(() => {
  const rect = (sel) => {
    // first VISIBLE match: the root Stack keeps screens mounted at 0x0 under a pushed route
    const e = [...document.querySelectorAll(sel)].find((n) => n.getBoundingClientRect().width > 0)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return {
      left: Math.round(r.left),
      width: Math.round(r.width),
      top: Math.round(r.top),
      height: Math.round(r.height),
    }
  }
  // elements inside a column wider than their box: react-native-web's ScrollView hides overflow-x,
  // so document scrollWidth cannot see it (criterion 6 passes only when this is 0)
  const overflow = [...document.querySelectorAll("[role=main] *, [role=complementary] *")].filter(
    (n) => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 1,
  ).length
  return JSON.stringify({
    innerWidth: window.innerWidth,
    overflow,
    nav: rect("[role=navigation]"),
    scrollWidth: document.documentElement.scrollWidth,
    main: rect("[role=main]"),
    side: rect("[role=complementary]"),
    colsMain: rect("[data-testid=columns-main]"),
    colsSide: rect("[data-testid=columns-side]"),
  })
})()
