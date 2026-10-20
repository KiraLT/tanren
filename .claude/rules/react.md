---
paths:
  - "apps/mobile/**/*.tsx"
---

# React / Expo rules (apps/mobile)

- Function components only, typed props as `readonly` interfaces, no classes.
- **No Effect inside components.** Components call hooks from `src/hooks/`;
  hooks are the only place that runs Effects (through a single `runtime`
  built once in `src/services/runtime.ts`).
- All data shapes come from `@tanren/shared`; never redeclare a type locally.
- State: local `useState`/`useReducer` for UI state; persisted data lives in
  the local store service, never in component state.
- Offline first: every Today-screen interaction must succeed with no
  network; sync is a background concern.
- Styling via a small set of layout primitives that are responsive from the
  start (two-column on wide viewports at step 7).
- Accessibility: large tap targets for ± steppers and "Log set"; labels on
  every pressable.
