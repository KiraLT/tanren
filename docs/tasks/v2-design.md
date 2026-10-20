# v2 — team design: design system, restyle, responsive web
Source: `docs/plan.md` Amendment 4 ("simple and modern design like Strava", responsive web) · Status: planning · Updated: 2026-10-21 · Baseline commit: 71adc34
Design: `docs/design/design-system.md` (normative: tokens, primitives, responsive rules, illustration guide) · ADR-0014 (proposed in the architect report; Lead records it) · Runs in parallel with teams catalog and programs after D1 reports.

## Team charter: design
Mission: one visual source of truth for `apps/mobile`: tokens + primitives in `src/ui/`, light and dark via the system setting, Today/Plan/Sign-in restyled on them, responsive at phone/tablet/desktop, proven with agent-browser on the exported build. Other teams build their screens on `src/ui` from D1 on.
Owned paths (exclusive): `apps/mobile/src/ui/**` (new), `apps/mobile/src/components/**` (restyle; `theme.ts`, `Screen.tsx`, `BigButton.tsx` are deleted in D5), `apps/mobile/app/{_layout,index,sign-in}.tsx`, `apps/mobile/app/(tabs)/{_layout,today,plan}.tsx`, `apps/mobile/src/hooks/{layoutMode,layoutMode.test,useLayoutMode}.ts`, `apps/mobile/package.json` dependency lines + catalog line `react-native-svg` in `pnpm-workspace.yaml` + lockfile (D1 only), `apps/mobile/CLAUDE.md` §Layout/§Expo facts lines about layout and theme, `.claude/skills/expo-mobile/SKILL.md` design paragraph (D5 engineer).
Adjacent, not ours: `src/services/**`, `src/store/**`, `src/hooks/{useSync,useLogSet,useToday,usePlanWeek,useRestTimer,useSignedIn,useSendMagicLink,restClock}.ts`, `src/services/runtime.ts` (another stream has them modified in the working tree: never edit, never revert); `app/(tabs)/library*`, `app/(tabs)/programs*` and their components (teams catalog/programs); `apps/worker/**`, `packages/**`.
Contracts (frozen at D1 done, announced to the Lead): `src/ui/index.ts` barrel = design §4 names and props, `src/ui/tokens.ts` §2.2 names, `ColorRoles` keys §2.1, `Breakpoint`/`breakpointFor`/`useBreakpoint` §5, `illustration` colours §2.1/§7. Adding is allowed after freeze; renaming or removing is not.
Provides: `@tanren/mobile` `src/ui` primitives and tokens for catalog and programs; `react-native-svg` installed; `ThemeProvider` mounted in `app/_layout.tsx`; the tab bar (`(tabs)/_layout.tsx`) with `Tabs.Screen` slots for `library`/`programs` added when the Lead confirms route names (design §8 Q2).
Assumes (cross-team):
- Two-column iff width ≥ 900 (`WIDE_BREAKPOINT`), main column fixed 560, aside ≤ 480, gap 24 — `apps/mobile/CLAUDE.md` §Expo facts, `expo-mobile` skill §Two columns; design §5 keeps it.
- Plan status order `done > today > missed > upcoming`, `weekStart` any weekday — ADR-0007, `apps/mobile/CLAUDE.md` §Expo facts; `statusTone` in design §2.1 maps exactly these four.
- Sign-in is web-only (`signInSupported(platform)`), magic link flow unchanged — `apps/mobile/CLAUDE.md` §Expo facts; D4 restyles the screen only.
- `useColorScheme()` follows `prefers-color-scheme` on web (RNW 0.21.4 `Appearance` uses `matchMedia`, verified by the architect) and `userInterfaceStyle: "automatic"` is already in `app.json`.
- `react-native-svg` 15.16.0 is the SDK-58 bundled version (`expo/bundledNativeModules.json`, verified) and is available in Expo Go.
- `Color` from `expo-router` is **not** exported in 58.0.24 (verified) — do not use it; palettes are ours (design §2.1).
- agent-browser proves dark mode with `agent-browser set media dark` / `set media light` (verified in `--help`); no URL override is needed.
- Catalog/programs teams import only from `src/ui/index.ts` and do not edit owned paths; their tab routes are a Lead decision (Q2).
Runtime proof (required in D5 and once before the team report): `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm web:export` → `pnpm web:serve` (:8790) → `ab() { agent-browser --session design "$@"; }` → for each width in `390 844`, `768 1024`, `1280 800`: `ab set viewport <w> <h>`, `ab set media light`, `ab open http://localhost:8790/today`, `ab snapshot -i`, `ab screenshot $S/design-today-<w>-light.png`, `ab set media dark`, `ab reload`, `ab screenshot $S/design-today-<w>-dark.png`; same for `/plan` (direct full-page load) and `/sign-in`; `ab errors` empty each time. The report pastes the snapshot lines that show the labelled controls (`Log set 1: …`, `Decrease Weight`, `Skip rest`, tab labels) and lists the 18 screenshot paths. Kill only the servers you started.
Docs: `apps/mobile/CLAUDE.md` (D5 engineer updates §Layout and the two-column facts to the breakpoint model) · `expo-mobile` skill design paragraph (D5) · `docs/design/design-system.md` corrections go through the team-lead with a one-line Log entry.
Budget: max 3 engineers in parallel · max 2 review rounds · time box 90 min (chain 20 + 15 + 20 + 10 + 10 = 75, + 15).
Forbidden: new UI libraries (NativeWind, Tamagui, Unistyles, `@expo/ui`, `@expo/vector-icons`, reanimated) — StyleSheet + tokens only (ADR-0014); Effect in components; editing adjacent paths; `expo install` without the catalog pin; committing PNGs; killing processes you did not start.
Permissions (owner away, no approvals — this line goes verbatim into every brief): never run a command under `permissions.ask`: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
Models: opus only for D1 (tokens/primitives/theme) and the one team reviewer; D2–D5 are sonnet engineers with `frontend-design:frontend-design` loaded, restyling from `docs/design/design-system.md` (the spec; briefs point at its sections, they do not restate it).
Report: team report format from `.claude/agents/team-lead.md`.

## Decisions
- DS-1 StyleSheet + tokens + one `ThemeProvider`, no styling library: a one-person app with ~15 primitives does not amortise NativeWind/Tamagui build config, and plain `StyleSheet` keeps web and native on one proven path — accepted (Lead delegation); ADR-0014.
- DS-2 Own light/dark palettes behind `useColorScheme()`; `Color` from `expo-router` is not exported in 58.0.24 and would give web nothing — accepted (Lead delegation).
- DS-3 Icons are hand-written `react-native-svg` paths (`Icon`, 21 names) instead of `@expo/vector-icons` (font download + FOUT on web, extra dependency) — accepted (Lead delegation).
- DS-4 Keep JS `Tabs`; `NativeTabs` is deferred to a spike (design §4 "Not built") — accepted (Lead delegation).
- DS-5 No committed screenshots: PNGs go to the scratchpad, the report lists their paths and pastes the accessibility-snapshot lines (text diffable, no binary churn). Visual regression = re-running the proof recipe — accepted (Lead delegation).
- DS-6 New primitives land beside the old ones (`Page` vs `Screen`, `Button` vs `BigButton`); D2–D4 switch screens, D5 deletes the old files — keeps D2 ∥ D3 ∥ D4 disjoint — accepted (Lead delegation).

## Tasks
Every brief carries: the Permissions line above · "Spec: `docs/design/design-system.md` §<n>" · `Time box` · the proof command from its done-criteria.

| id | title | spec | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Foundation: `react-native-svg` dep, `src/ui/{tokens,colors,ThemeProvider,Text,Page,AppBar,Card,Button,IconButton,Icon,Stepper,StatusPill,ListRow,SegmentedControl,TimerRing,EmptyState,Banner,Skeleton,index}.tsx`, `layoutMode.ts` breakpoints, `ThemeProvider` in `app/_layout.tsx`, contrast table | §2–§5 | engineer / opus (20 min, **alone**; freeze barrel on done) | — | `src/ui/**`, `src/hooks/{layoutMode,layoutMode.test,useLayoutMode}.ts`, `app/_layout.tsx`, `apps/mobile/package.json`, `pnpm-workspace.yaml` (one catalog line), lockfile | todo |
| D2 | Restyle Today: `TodayReady`, `ExercisePager`, `ExercisePage`, `SetList`, `RestTimerBar` (→ `TimerRing` in aside, bar on phone), `Stepper` → `ui/Stepper`, `(tabs)/today.tsx` states (Skeleton, EmptyState) | §1, §4, §6 | engineer / sonnet + `frontend-design` (15 min) | D1 | `src/components/{TodayReady,ExercisePager,ExercisePage,SetList,RestTimerBar,Stepper}.tsx`, `app/(tabs)/today.tsx` | todo |
| D3 | Restyle Plan: `PlanWeek`, `PlanDayRow`, `PlannedSessionCard` (`Card` + `StatusPill` via `statusTone`), `(tabs)/plan.tsx` states and aside | §1, §2.1 status, §4 | engineer / sonnet + `frontend-design` (15 min) | D1 | `src/components/{PlanWeek,PlanDayRow,PlannedSessionCard}.tsx`, `app/(tabs)/plan.tsx` | todo |
| D4 | Sign-in + chrome: `sign-in.tsx` on `Page`/`Button`/`Banner`, `AppBar` on both tabs' phone layout, themed `Tabs` (`tabBarActiveTintColor` etc. from tokens, `Icon` `timer`/`calendar`), `SignInEntry` → `IconButton`/`Button ghost`, EmptyStates copy | §1, §4 AppBar/Button/Banner | engineer / sonnet + `frontend-design` (15 min) | D1 | `app/sign-in.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`; shares `today.tsx` with D2 → D4 edits only the `SignInEntry` block and D2 the `renderState` block, or D4 waits for D2 (team-lead decides at dispatch) | todo |
| D5 | Responsive pass + cleanup: tablet gutters/widths, desktop `AppBar nav` + hidden tab bar, hover/focus states on web, delete `components/{theme,Screen,BigButton}.tsx`, CLAUDE.md + skill lines, full runtime proof | §5, §6 | engineer / sonnet + `frontend-design` (20 min) | D2, D3, D4 | all owned paths | todo |
| REV | One team reviewer with `frontend-design:frontend-design` + `expo:expo-design-system` loaded; runs `pnpm -F @tanren/mobile check`; audits drift (`grep -rn "#[0-9A-Fa-f]\{6\}" apps/mobile/src/components apps/mobile/app` must be empty) | all | reviewer / opus (10 min) | D5 | owned paths | todo |
| QA | Only if `git diff 71adc34 --stat -- apps/mobile` > 800 lines: `layoutMode`/`breakpointFor` tests, `statusTone` exhaustiveness, `Text` variant table, contrast assertions on the palettes | §2, §5 | qa / sonnet (10 min) | REV | `*.test.ts` under owned paths | todo |

Parallel groups: A = {D1} · B = {D2, D3, D4} · C = {D5} · D = {REV, fixes, QA}. Catalog and programs teams start their UI after group A reports (they may scaffold data layers earlier).

## Done-criteria
### D1 Foundation
- [ ] `react-native-svg: 15.16.0` in the catalog and `apps/mobile/package.json`; `pnpm install` clean; `pnpm -F @tanren/mobile typecheck` green.
- [ ] `src/ui/index.ts` exports exactly the design §4 components and §2–3 tokens/hooks; every component has the props/defaults of §4; no hex literal outside `src/ui/colors.ts` (`grep -rn "#[0-9A-Fa-f]\{6\}" apps/mobile/src/ui --include=*.tsx` empty).
- [ ] `ThemeProvider` wraps the root `Stack` in `app/_layout.tsx`; `StatusBar` follows the scheme; `useTheme()` without a provider returns the light theme (unit test).
- [ ] `layoutMode.ts`: `breakpointFor(599) === "phone"`, `(600) === "tablet"`, `(899) === "tablet"`, `(900) === "desktop"`, `layoutModeFor` unchanged (tests extended).
- [ ] Contrast table in the report (text roles on `bg`/`surface`, `onAccent` on `accent`, both schemes, all ≥ 4.5:1; computed, not eyeballed).
- [ ] `pnpm -F @tanren/mobile check` green, output pasted; barrel announced as FROZEN to the team-lead.
### D2 Today
- [ ] No import of `components/theme.ts` or `BigButton` remains in the D2 files; all colours via `useTheme`/`useStyles`; sentence-case copy ("Log set 2", "Rest", "Skip"), no `letterSpacing`/`textTransform`.
- [ ] Phone: rest shown as a bar (`numeral` clock + `Button secondary` "Skip"); desktop aside: `TimerRing` with the clock inside; `accessibilityLabel`s unchanged (`Log set N: … kilograms, … reps`, `Decrease Weight`, `Skip rest`).
- [ ] Loading = `Skeleton` layout, Empty/Failed = `EmptyState`; `pnpm -F @tanren/mobile check` green; ui-check on `expo start --web` at 390 and 1280: log a set, rest appears, snapshot lines pasted.
### D3 Plan
- [ ] Day rows are `ListRow`-like groups (no card-per-row); session = `Card` (+ `selected`) with `StatusPill tone={statusTone[status]}`; today's row uses `accentSoft`; status label text unchanged (`planFormat`).
- [ ] Loading/Empty/Failed via `Skeleton`/`EmptyState`; `pnpm -F @tanren/mobile check` green; ui-check `/plan` at 390 and 1280 (aside shows the selected session), snapshot lines pasted.
### D4 Sign-in + chrome
- [ ] `sign-in.tsx` on `Page` + `Text` + `Button primary/ghost` + `Banner` for Sent/Failed; input themed (`surface`, `border`, `text`); labels unchanged (`Email address`, `Send magic link`, `Back to Today`).
- [ ] `Tabs` themed from tokens in both schemes with `Icon` tabs; `headerShown: false` kept; `AppBar` title row on Today/Plan at phone/tablet; `SignInEntry` is an `IconButton`/ghost `Button` in the AppBar `trailing` slot (label `Sign in` kept).
- [ ] `pnpm -F @tanren/mobile check` green; ui-check `/sign-in` 390 light + dark, snapshot lines pasted.
### D5 Responsive + cleanup
- [ ] Tablet (768): single centred column 560, gutter 24; desktop: tab bar hidden, `AppBar nav` (Today, Plan) with `active` state, two columns as before; hover tint and focus ring on web pressables (or VERIFY note with the fallback used).
- [ ] `src/components/{theme,Screen,BigButton}.tsx` deleted; `grep -rn "components/theme\|BigButton\|components/Screen" apps/mobile` empty; CLAUDE.md and skill updated.
- [ ] Full runtime proof per the charter (3 widths × 2 schemes × 3 routes), `ab errors` empty, direct `/plan` load works; `pnpm -F @tanren/mobile check` green, output pasted.
### REV
- [ ] `git diff 71adc34 -- <owned paths>` against `docs/design/design-system.md`; drift greps empty; both skills' checklists applied (no all-caps labels, one accent per screen, flat cards, four states per screen); package gate green; blocking findings routed within the team.

## Frozen contracts
- `src/ui/index.ts` barrel + `tokens.ts` + `ColorRoles` + `breakpointFor` — FROZEN when D1 reports (fill time).

## Integration (Lead, after design + catalog + programs report)
- Root `pnpm check` green; export + serve; agent-browser at 390/768/1280 light+dark across Today, Plan, Sign-in and the new tabs; cross-team reviewer on `git diff 71adc34 -- apps/mobile`; one `qa` if combined diff > 800 lines. Add `Tabs.Screen` lines for the catalog/programs routes if D4 did not (Q2).

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`

## Escalations
