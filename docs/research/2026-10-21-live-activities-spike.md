# Spike: Live Activities and rest-timer fallback for Expo SDK 58 (checked 2026-10-21)

Tags: [npm] = `npm view` / `npm i` in scratch, 2026-10-21; [pkg] = installed `.d.ts`/plugin in scratch;
[doc] = official doc fetched 2026-10-21. No Xcode or simulator on this machine, so nothing ran on iOS.
Markers: `observed` = read in a primary source; `inferred` = reasoned, not seen; `unknown`.

## Question
(a) Which Live Activities approach works on SDK 58, and what is its API and what are its limits? (b) Expo Go fallback: local
notifications, keep-awake, timers while backgrounded. (c) Haptics and audio cues. (d) EAS free-plan limits; does a dev build
need a paid Apple account?

## Evidence
| item | finding | marker | source |
|---|---|---|---|
| pick | `expo-widgets@58.0.21` (2026-10-19), Expo's own; SDK 58 pins `"expo-widgets": "~58.0.21"`, `"@expo/ui": "~58.0.21"` | observed | [npm] expo@58.0.16 `bundledNativeModules.json` |
| rejected | `expo-live-activity@0.4.2`: npm says "deprecated: Package no longer supported"; `react-native-live-activity@0.1.0` last published 2023-03-20; `@bacons/apple-targets@5.0.0` (2026-07-17) is maintained but needs hand-written Swift | observed | [npm] |
| Expo Go | "This library is not available in the Expo Go app — use development builds" | observed | [doc] docs.expo.dev/versions/latest/sdk/widgets |
| config plugin | `app.plugin.js`; sets `NSSupportsLiveActivities`, an app group (`group.<bundleId>`) and a widget extension target; extension deployment target defaults to `'16.4'`; options `enablePushNotifications`, `frequentUpdates` | observed | [pkg] plugin/build/ios/withAppInfoPlist.js:20, withIosWidgets.js:37 |
| JS API | `createLiveActivity<T>(name, component)` returns a factory; `factory.start(props, url?, staleDate?)` returns `LiveActivity<T>`; then `update(props, staleDate?)`, `end('default'\|'immediate'\|after(date), props?, contentDate?)`, `factory.getInstances()` | observed | [pkg] build/Widgets.d.ts:41-125 |
| layout | returns `{ banner, bannerSmall?, compactLeading?, compactTrailing?, minimal?, expandedCenter/Leading/Trailing/Bottom? }`; component marked `'widget'`, `@expo/ui/swift-ui` only, no hooks/imports/async/module-scope consts | observed | [pkg] Widgets.types.d.ts:172-214; [doc] |
| countdown | `@expo/ui` `Text` has `timerInterval?: ClosedRangeDate`, `countsDown?: boolean`, `dateStyle: 'timer'` (same on `ProgressView`); the system ticks it, so no per-second updates | observed (props); inferred (system ticking, from SwiftUI `Text(timerInterval:)`) | [pkg] @expo/ui build/swift-ui/Text/index.d.ts:6-37 |
| lifetime | "active for up to eight hours"; removed "four hours after it ended" | observed | [doc] Apple ActivityKit "Displaying live data with Live Activities" (JSON) |
| size | static and dynamic data "can't exceed a combined size of 4 KB" | observed | same |
| update rate | updates from the app are throttled by the system; frequent push updates need `frequentUpdates` | inferred | [doc] widgets plugin table |
| min iOS | Live Activities iOS 16.1+ (inferred); plugin targets 16.4 (observed); push-to-start 17.2+ (observed, [doc] widgets) | mixed | |
| notifications | "Push … unavailable in Expo Go on **Android** from SDK 53 … Local notifications remain available in Expo Go." (iOS Expo Go is not named) | observed | [doc] sdk/notifications |
| custom sound | needs the config plugin's `sounds` option, so Expo Go plays only the default sound | inferred | [doc] sdk/notifications |
| keep-awake | `expo-keep-awake@~58.0.3`: "Included in Expo Go" | observed | [doc] sdk/keep-awake |
| bg timer | once iOS suspends the app, JS stops: no setTimeout, in-app sound or haptics. Store `restEndsAt`, schedule a local notification for it, recompute on `AppState` 'active' | inferred | standard iOS behaviour |
| audio | `expo-audio@~58.0.9`: "Included in Expo Go"; `playsInSilentMode`. `expo-av` is not in SDK 58 `bundledNativeModules`; latest release 16.0.8 (2025-12-05) | observed | [doc] sdk/audio; [npm] |
| haptics | `expo-haptics@~58.0.7` is in SDK 58; its docs page has no "Included in Expo Go" line | inferred (works in Expo Go) | [doc] sdk/haptics |
| EAS free | "Up to 15 Android and 15 iOS builds" per month, "Low priority" (waits of "90+ minutes"), "45-minute build timeout" | observed | [doc] expo.dev/pricing |
| Apple acct | ad hoc "requires a paid Apple Developer account", max 100 iPhones per year | observed | [doc] docs.expo.dev/build/internal-distribution |
| free team | a local Xcode build with a free Personal Team is not possible here (no Xcode); whether it allows the App Group the extension needs is unknown | unknown | |

## Consequences for Tanren
- Ship rest tracking in Expo Go now: local notification at `restEndsAt`, `useKeepAwake` on Today, haptics and `expo-audio`
  cues in the foreground. Derive the remaining time from timestamps, never from ticks.
- Live Activities is a separate dev-build task (`expo-widgets` with `Text timerInterval`). It moves the iPhone off
  Expo Go, so it is an architectural change: ADR plus owner confirmation.
- Widget code is isolated (no imports), so pass everything as props (`restEndsAt`, exercise name, set index); stay < 4 KB.

## Owner steps (only if Live Activities is approved)
1. Join the Apple Developer Program (paid; $99/yr is inferred). 2. `eas device:create` and register the iPhone (Apple may take 24–72 h).
3. Set `ios.bundleIdentifier` (needed for the app group), then `eas build --profile development --platform ios`.
4. Enable Developer Mode on the iPhone, install, run `expo start --dev-client`.

## Scratch
`/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/la`
(expo-widgets@58.0.21, expo-live-activity@0.4.2, @expo/ui@58.0.21; `expo-58.0.16.tgz` extracted).
