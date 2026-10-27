---
paths:
  - "apps/mobile/**/*.tsx"
---

# React / Expo rules (apps/mobile)

- Function components only, typed props as `readonly` interfaces, no classes.
- **No Effect inside components.** Components call hooks; hooks are the only
  place that runs Effects (through a single `runtime` built once in
  `src/services/runtime.ts`). A hook used by two or more features lives in
  `src/hooks/`; a hook used by one feature may live in that feature's folder
  (`src/player/useProgramDay.ts`), next to the pure module it drives.
- All data shapes come from `@tanren/shared`; never redeclare a type locally.
- A hook that subscribes to `StoreEvents.changes` (or any store stream) and
  runs a fallible effect per event (`repo.get`, `repo.byId`) catches INSIDE
  the per-event effect (`Effect.catch` → a neutral value such as
  `Option.none()`, or `Effect.match` → a `Failed` state) so one `StoreError`
  does not end the stream for the component's lifetime (WT-R: `useStep`
  died on the first failure, 2026-10-27; `useImportedActivity` is the
  pattern). `Effect.sync(setVersion)` per event needs no catch.
- Authenticated reads: every API call that needs a session (sync rounds,
  `useGarminConnected`, any new hook on a mounted screen) runs through
  `whenSignedIn` (`src/services/CurrentUser.ts`), so a signed-out device
  makes no authenticated request; the gate's `get-session` probe is the only
  call out (NAV-F2, 2026-10-27). The reviewer greps for the wrapper.
- State: local `useState`/`useReducer` for UI state; persisted data lives in
  the local store service, never in component state.
- Offline first: every Today-screen interaction must succeed with no
  network; sync is a background concern.
- Styling via a small set of layout primitives that are responsive from the
  start (two-column on wide viewports at step 7).
- Accessibility: large tap targets for ± steppers and "Log set"; labels on
  every pressable.
- `ListRow` with `onPress` wraps its whole body, `trailing` included, in a
  `Pressable`: never render a `Button`, `IconButton` or `Pressable` in
  `trailing` of a pressable row (a nested button on web, invalid DOM, two
  hit targets). Put the action as a sibling of the row (PROG-1's `DueRow`,
  2026-10-27) or make the row itself the only target.
- Design system is normative: `docs/design/design-system.md` §1 (sentence
  case, no all-caps labels, no `letterSpacing`/`textTransform`, one accent)
  and §4 (`IconButton` 44 px minimum hit area, `sizes.tap`). Read those two
  sections before writing a screen; the reviewer checks against them and the
  design team's only second round (2026-10-21) came from an all-caps heading
  and an undersized hit area.
- Tab screens stay mounted (`(tabs)/_layout.tsx` sets no `unmountOnBlur`), so
  screen-local failure state, an `AppBarNotice` or an in-flight flag survives
  navigating away and back. Any such state resets in a `useFocusEffect`
  cleanup and when its target changes, and a late async result is dropped
  through a `live` ref (`src/components/today/StartButton.tsx`,
  `FinishWorkout.tsx`); NAV-1bR found a stale "could not start" caption on the
  Home tab after a round trip (2026-10-27).
