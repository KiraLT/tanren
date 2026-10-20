# ADR-0012: Rest/phase alerts behind a `PhaseAlerts` port — Expo Go fallback now, Live Activities via `expo-widgets` in a development build

Date: 2026-10-21 · Status: **accepted** (Lead decision under owner delegation, 2026-10-21; plan Amendment 4) for the port, the Expo Go fallback and the `expo-widgets` adapter · **owner decision pending**: moving the owner's phone from Expo Go to a development build · v2 · Author: architect (design: `docs/design/v2-programs.md` §4, §7; facts: `docs/research/2026-10-21-live-activities-spike.md`)

## Context

Amendment 4 asks for Dynamic Island and Lock Screen display while a program exercise or rest is
running, "like a proper training app". iOS Live Activities need a widget extension target; Expo Go
cannot load one, and this machine has no Xcode (verified), so no agent can produce or prove a native
build. The spike found Expo's own `expo-widgets` (~58.0.21, SDK 58 bundled) with
`createLiveActivity(name, component).start(props)` → `update`/`end`, a config plugin that sets
`NSSupportsLiveActivities`, the app group and the extension target (iOS 16.4+), and system-side
countdown rendering (`Text`/`ProgressView` with `timerInterval` + `countsDown`), so one `start` per
phase suffices. A development build requires a paid Apple Developer account, `eas device:create`,
`eas build --profile development --platform ios` (Free plan queue 90+ min) and a device install —
all owner actions. In Expo Go, `expo-notifications` local scheduling, `expo-keep-awake`,
`expo-haptics` and `expo-audio` work (only Android push left Expo Go in SDK 53); JS timers do not
run in the background.

## Decision

1. The workout player talks to one port, `PhaseAlerts` (`schedule(at, text)` / `cancelAll()`,
   v2-programs.md §4), and computes remaining time as `endsAt − now` on every tick and on
   `AppState` → `active`; it never counts ticks.
2. **Ships now, in Expo Go**: `PhaseAlerts.notifications` schedules one local notification per
   phase (`TIME_INTERVAL` at `endsAt`, cancelled on next/pause/finish; permission asked once),
   plus `useKeepAwake`, haptic and audio cues in the foreground; web gets a no-op alerts adapter.
3. **Ships as code, proven by the owner**: `src/native/RestActivity.ts` implements the same port
   with `expo-widgets` (`'widget'` component on `@expo/ui/swift-ui`, one `start({ title, endsAt })`
   per phase, `end()` on finish), `app.json` `expo-widgets` plugin with `ios.bundleIdentifier`,
   `eas.json` `development` profile. The adapter is selected by execution environment at runtime
   build; in Expo Go and on web the notifications adapter is used. Agents never run `eas *`.
4. Owner actions to turn 3 on: paid Apple Developer account → `eas login` → `eas device:create`
   → `eas build --profile development --platform ios` → install → `expo start --dev-client`. Until
   the owner does this, Expo Go stays the owner's runtime and nothing in the app depends on 3.

## Consequences

- Two runtime paths for one port; the Expo Go path is the default and is covered by tests and the
  ui-check proof; the Live Activity path is typechecked and reviewed only (no native proof here).
- Rest tracking with the phone locked works today through notifications (banner + default sound),
  without a live countdown on the Lock Screen until the owner builds the dev client.
- `expo-widgets`, `expo-notifications`, `expo-haptics`, `expo-audio` join the mobile dependencies
  (SDK 58 bundled versions, pinned in the catalog); `expo-av` is not used (absent from SDK 58).
- Deviations from the plan's "iPhone via Expo Go" are confined to decision 4 and wait for the owner.

## Alternatives considered

- `expo-live-activity` (deprecated), `react-native-live-activity` (unmaintained since 2023),
  `@bacons/apple-targets` with hand-written SwiftUI (native code agents cannot build or test here):
  rejected by the spike.
- Per-second `update()` calls from JS: throttled by Apple and dead in the background; the
  system-side timer rendering makes them unnecessary.
- Waiting for the dev build before shipping rest tracking: contradicts "work on your own" — the
  notifications fallback ships first.

Not decided here: Android Live Activity equivalents; remote (push) Live Activity updates; whether
the production app ever ships outside Expo Go (owner).
