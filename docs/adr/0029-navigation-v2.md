# ADR-0029: Navigation v2 — Home · Train · Feed · You

Status: accepted (Lead decision under plan Amendment 3, 2026-10-27 19:00; owner asked at 18:50 for a pick of A / B / Merge and did not answer within the playbook's 10 min; the owner can still override by message, in which case this ADR is superseded)

## Context

`APP_NAV` has five flat tabs: Feed, Today, Plan, Programs, Library. The bar is full, so FREE-D's Start, a weekly review and running have no slot. Settings and Progress sit behind `IconButton`s in the Feed AppBar only; Health opens from Today's health card; Integrations and nutrition goals are two levels under Settings. Plan, Programs and Library answer one question ("what do I train?") on three tabs. Nothing is about the user. Desktop `AppBar` mirrors the same five links. The owner asked (Amendment 30, 18:30) for smarter navigation that scales with new functionality. Evidence: `docs/research/2026-10-27-navigation-ia.md`; mockups and route tables: `docs/design/navigation-v2.md`.

## Decision

1. **Four tabs: Home · Train · Feed · You** (icons `home`, `dumbbell`, `flame`, `user`). `(tabs)/today.tsx` becomes `home.tsx`; `plan`, `programs`, `library` tab files are deleted.
2. **Start** is the single primary pill on Home's Up-next card and on Train's AppBar; it never becomes a tab icon. Desktop `AppBar` shows the same four links plus a primary "Start" button, hidden on `/train` (one Start per screen).
3. **Train** = `SegmentedControl` Plan · Programs · Library, deep-linked by `/train?view=plan|programs|library`; default `plan` when a plan week has days, else `programs`. Bodies are the existing components.
4. **You** = profile header, week stat tiles, rows: Progress, Health, Settings, Integrations, Account (nutrition goals, equipment and locations, privacy, terms, sign out). Feed's AppBar loses the gear and chart buttons.
5. **The fifth slot is reserved.** Growth rules: a new feature is a card on Home, a row on You or a segment on Train, never a tab; a fifth tab only for a mode the owner uses most days (Running if he records runs in Tanren, not merely imports them); the AppBar trailing slot holds at most one action; desktop uses the same `APP_NAV`, no desktop-only destinations; hub state lives in query params so links stay stable.
6. **No redirect shims** (Amendment 23). The only app paths the Worker emits are `/settings`, `/settings/integrations`, `/privacy`, `/terms`; these keep their routes. `/plan`, `/programs`, `/library`, `/today` have no external links and resolve to NotFound after the move; in-app pushes are rewritten in the same change.

Not decided: the name "Feed" (kept unless the owner renames it, e.g. "Activity"); whether the weekly review page ships in this step (NAV-4 is optional, and the You row is omitted until it exists, per the no-placeholders rule); tablet-specific layouts beyond the existing 600 + 480 desktop split.

## Consequences

- Migration order is NAV-2 (Train) before NAV-1 (You): Programs and Library have no in-app link outside their tabs, so they must not leave `APP_NAV` before Train exists. NAV-1 and NAV-2 both edit `appNav.ts`, so they run sequentially.
- NAV-3 (Home rename, Up-next card, desktop Start button) starts after FREE-1 has reported and `docs/design/free-workout.md` is final (file condition).
- Every `router.push` to `/plan`, `/programs`, `/library`, `/today` is rewritten (`grep -rn` in `apps/mobile/app` and `src`); `expo-types.d.ts` is regenerated per step; `apps/mobile/CLAUDE.md` Layout is updated.
- Programs and Library gain one tap of depth from the tab bar (segment inside Train); Settings, Progress and Health become one tap from anywhere.
- Review (NAV-R) and a 390/1280 light/dark matrix (NAV-Q) close the step.

## Alternatives considered

- **A, Strava shape (Home · Feed · centre Start · Train · You):** a permanent Record button duplicates Home's Up-next card, which already shows the planned thing, and spends the fifth slot forever.
- **B, Garmin shape (Today · Feed · Health · More):** More is a junk drawer by design and pushes Plan, Programs and Library, the owner's training content, two taps deep.
- **Keep five tabs and add rows:** the bar stays full, "You" stays missing, and each new feature costs a tab or a hidden page.
