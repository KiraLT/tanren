# ADR-0027: The styling stack stays the Forge design system (no Tailwind/NativeWind, no shadcn/ui)

Status: accepted (Lead decision under plan Amendment 3; owner words in plan Amendment 28, 2026-10-27 17:55: "do you use
tailwind for css? Or https://ui.shadcn.com? Both of these can help to have more consistent UI with some customizations",
then "Decide yourself if its worth").

## Context
The app is Expo / React Native, rendered on the web through `react-native-web` (`apps/mobile/package.json`: `expo`,
`react-native`, `react-native-web`, `react-native-svg`). Styling is one layer in `apps/mobile/src/ui`: `tokens.ts`
(`space`, `rhythm`, type), `colors.ts` + `theme.ts` (light/dark palettes, one accent), `ThemeProvider.tsx`
(`useTheme`, `useStyles(factory)` = `StyleSheet.create(factory(theme))` memoised per theme) and 23 primitives
(`Button`, `Card`, `ListRow`, `Page`, `Stepper`, `SegmentedControl`, ...), with tests next to them. Five modules outside `src/ui` use `useStyles`.
Rules: `.claude/rules/react.md` makes `docs/design/design-system.md` normative (sentence case, no `textTransform` /
`letterSpacing`, one accent, 44 px `sizes.tap`); the reviewer checks it. The Biome GritQL plugins in `.biome/`
(`noClass`, `noLet`, `noLoop`, `noMutation`, `noSwitch`, `noThrow`) enforce the functional rules only: no lint rule
bans a raw hex in a screen, so token discipline is held by review and `docs/design/ui-audit.md` measurements, not by
tooling. The owner asked whether Tailwind or shadcn/ui would make the UI more consistent.

## Decision
Keep the Forge design system in `apps/mobile/src/ui` as the single styling layer. Do not adopt Tailwind (NativeWind) or
shadcn/ui. Consistency keeps coming from the token table (the only place colours and spacing are defined), the
primitives, the measured design reviews and the designer loop.

## Consequences
- Keep investing in `src/ui` primitives; the next one is a `ConfirmDialog` / `useConfirm` (CONFIRM-D,
  `docs/design/confirm-dialogs.md`).
- A new screen composes primitives and `useStyles`; a repeated local style becomes a primitive or a token, never a
  second styling mechanism.
- Not decided here: a lint rule against raw hex / magic spacing numbers outside `src/ui` (would turn the review check
  into a gate; candidate for the Engineering Manager).
- Revisit only if the app drops native (web-only would make shadcn/ui + Tailwind a real option).

## Alternatives considered
- **shadcn/ui**: React DOM + Radix + Tailwind; it does not run on React Native, so web and iPhone would become two UIs
  with two component sets, against the one-codebase premise of the plan.
- **NativeWind (Tailwind on RN) + a shadcn-style port (react-native-reusables)**: a Babel/Metro transform and a
  runtime, plus a class-string language beside the token table; it would re-platform 23 primitives and every screen
  for no gain in consistency (the tokens already are the single source) and adds Expo/Metro upgrade risk.
- **Tamagui**: a compiler, its own token and component system; same re-platforming cost, heavier tooling.
- **Unistyles**: a typed theme API close to what `useStyles` already gives; migrating buys little; VERIFY: whether current
  Unistyles needs a native module (Expo Go is a supported iPhone path), not checked.
- **Keep Forge** (chosen): zero migration, already tested and designed, and the owner judges the UI on screenshots at
  390/1280, not on the CSS tool.
