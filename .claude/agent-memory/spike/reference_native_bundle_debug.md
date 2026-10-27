---
name: native-bundle-debug
description: Debugging an Expo Go / EAS Update red screen on this Mac - no Xcode (CommandLineTools only, no simctl), how to inspect and run the iOS bundle offline
metadata:
  type: reference
---

- This Mac has only `/Library/Developer/CommandLineTools`; `xcrun simctl` does not exist, so no local iOS simulator. EAS cloud simulator (`mcp__plugin_expo_expo__simulator_start`) is billed - Lead/owner decision, not a spike default.
- Readable iOS bundle: `npx expo export --platform ios --no-bytecode --no-minify --source-maps --output-dir <scratch>`; the map is sectioned (`m.sections[].map.sources`), parse with `JSON.parse(fs.readFileSync)` (not `require`, the `.map` extension loads as JS).
- Expo's `expo/build/errors/ExpoErrorManager.native.js` rewrites RN's invariant "`new NativeEventEmitter()` requires a non-null argument." (and "Native module cannot be null") into "Your JavaScript code tried to access a native module that doesn't exist." - the red screen then reads "Invariant Violation: Your JavaScript code tried to access...". A missing Expo module instead throws "Cannot find native module 'X'"; a missing TurboModule "TurboModuleRegistry.getEnforcing(...): 'X' could not be found".
- Node VM harness (EG-1, 2026-10-27): run the unminified bundle in `vm` with a universal callable Proxy for `__turboModuleProxy`, `nativeModuleProxy`, `nativeFabricUIManager`, `expo.modules`, plus `RN$Bridgeless`, `RN$registerCallableModule`, `RN$handleException`, web builtins (atob, URL, TextEncoder...), and null for `EXDevLauncher`/`ExponentKernel`; module load + `__r(<rn index id>).AppRegistry.runApplication('main', …)` completes. It proves module-load-time behaviour only; Fabric render is stubbed out.

- Expo Go simulator builds are free: the expo.dev/go page links `github.com/expo/expo-go-releases/releases/download/Expo-Go-<ver>/Expo-Go-<ver>.tar.gz` (older patch versions too, e.g. 58.0.5). The tarball is the .app contents; the main binary is `Expo Go`. Check RN ObjC modules with `otool -oV "Expo Go" | grep "name .* RCTFoo$"`. `strings` misses Swift strings of 15 bytes or fewer (stored inline), so "absent from strings" is not proof for short Expo module names. Expo Go 58.0.5/58.0.7 do NOT contain `RCTPushNotificationManager`.

Related: [[agent-browser-ui-check]]
