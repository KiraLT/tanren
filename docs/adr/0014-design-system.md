# ADR-0014: Design system as tokens + StyleSheet primitives in `apps/mobile/src/ui`, no styling library

Date: 2026-10-21 · Status: **accepted** (Lead decision under owner delegation, 2026-10-21; plan Amendment 4) · v2 · Author: architect (recording `docs/design/design-system.md`)

## Context

Plan Amendment 4 asks for a "simple and modern design like Strava" and a responsive web (desktop,
tablet, mobile), built in parallel by three teams (design, catalog, programs) with the owner away.
The app has de-facto tokens only (`src/components/theme.ts`, dark scheme only) and ad-hoc
`StyleSheet`s per component; two-column layout at ≥ 900 px exists (`useLayoutMode`). **Verified
2026-10-21 against installed packages**: `expo-router@58.0.24` does not export the `Color`
semantic-colour API the Expo skills describe, and ships `NativeTabs` only under
`expo-router/unstable-native-tabs` (a `.web.js` view exists, unproven here);
`react-native-svg` 15.16.0 is the SDK-58 bundled version and is not yet installed;
`@expo/vector-icons` is not installed; `react-native-web@0.21.4` maps `useColorScheme()` to
`prefers-color-scheme`; `agent-browser` has `set media dark|light [reduced-motion]`.

## Decision

- **One theme, plain React.** Tokens (`space`, `radius`, `type`, `motion`, `sizes`,
  `breakpoints`) and ~16 primitives live in `apps/mobile/src/ui/` behind one barrel
  `src/ui/index.ts`; styling is `StyleSheet` + `useStyles(factory)` over a `ThemeProvider` keyed on
  `useColorScheme()`. No NativeWind, Tamagui, Unistyles, `@expo/ui` or reanimated. Effect stays out
  of components (`.claude/rules/react.md`).
- **Own light and dark palettes** (`ColorRoles`, design §2.1), following the system setting;
  no in-app toggle in v2. The platform `Color` API is not used (unavailable in 58.0.24, nothing on web).
- **Icons and the rest ring are `react-native-svg` paths** (`Icon`, 21 names; `TimerRing`);
  `react-native-svg` 15.16.0 is pinned in the catalog. The same package carries the catalog's
  exercise illustrations (style guide in design §7; loading mechanism is the catalog architect's
  call, `docs/design/v2-catalog.md`).
- **Navigation**: five JS `Tabs` in `app/(tabs)/_layout.tsx` — `today`, `plan`, `programs`,
  `library`, `progress`; Settings opens from a gear on Progress (`docs/design/v2-extras.md` §2).
  `NativeTabs` is deferred to a spike. Desktop (≥ 900) hides the tab bar and shows the same
  five links in the `AppBar`.
- **Responsive rules**: phone < 600, tablet 600–899, desktop ≥ 900 (the existing two-column
  rule, unchanged); content column 560, aside ≤ 480; touch targets ≥ 44.
- **Proof, not pictures**: UI is proven by agent-browser on the exported build at 390/768/1280 in
  both schemes; screenshots stay in the scratchpad, reports paste accessibility-snapshot lines.
  No PNGs in git.
- **Rollout**: team design's D1 (foundation) runs alone and freezes the barrel; restyles and the
  other teams build on it (`docs/tasks/v2-design.md`). New primitives land beside the old
  (`Page`/`Screen`, `Button`/`BigButton`) and the old files are deleted in D5. The D2/D4 overlap
  in `app/(tabs)/today.tsx` is the team-lead's call at dispatch.

## Consequences

- Any hex literal, font size or spacing outside `src/ui` is drift and is greppable
  (`grep -rn "#[0-9A-Fa-f]\{6\}" apps/mobile/src/components apps/mobile/app` must be empty).
- Other teams import only the frozen barrel; adding exports is allowed, renaming is not.
- Dark mode and reduced motion are proven in CI-like fashion with `agent-browser set media`.
- A later `NativeTabs` switch touches only `(tabs)/_layout.tsx`; a theme toggle touches only
  `ThemeProvider`.
- Hand-written icon paths cost one opus task once; no font download or FOUT on web.
- VERIFY left to engineers (design §2.2, §5): `boxShadow`/`borderCurve` in RN 0.88 style types,
  RNW `Pressable` `hovered`/`focused` in the style function, web `<body>` background.

## Alternatives considered

- **NativeWind** — Tailwind config plus babel/metro plugins for a one-person app; a second
  styling mental model beside `StyleSheet`; no gain for ~16 primitives.
- **Tamagui / Unistyles** — compiler or runtime layers with Expo Go friction and their own
  theming idiom; overkill at this size.
- **`@expo/ui` controls** — native SwiftUI/Compose, but no web parity; web is the proven surface.
- **`@expo/vector-icons`** — extra dependency and a web font download; a 21-glyph set is cheaper.
- **Platform `Color` API** — not exported in the installed expo-router; would give web nothing.
- **Committed screenshots for visual regression** — binary churn per pass; snapshot text is
  diffable and is what agent-browser already produces.
