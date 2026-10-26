The Forge pill button: `headline` label in a `radius-full` capsule; one accent pill per screen.

**Use** `primary` (`accent` fill, `on-accent` label; in dark it carries `shadow-glow`) for the single most important action on the screen: Log set, Start, Send link. `secondary` (`surface` fill, `text`) for the rest. `destructive` (`danger-soft` fill, `danger` text) only inside a confirm or a settings group. `text` (no fill, `accent` label) for inline actions such as Skip or Change.

**Sizes** `md` 48 (`size-control`), `lg` 56 (`size-control-lg`, the primary elsewhere), `xl` 64 (`size-stepper-button`, Log set only). Minimum width 44; horizontal padding `space-xl` 24; an optional leading 24 px glyph (`check` on Log set, `plus` on Add, `zap` on Start) 8 before the label.

**Props (as docs)** `label`, `onPress`, `variant = "secondary"`, `size = "md"`, `icon?: IconName`, `loading?` (spinner replaces the label; the label stays the accessible name), `disabled?` (opacity 0.4), `accessibilityLabel?`.

**Do** keep the label a verb of one or two words ("Log set", "Check your email" is a title, not a button). Keep the pill full width only on the Today exercise page and the sign-in form. **Don't** put two primary pills on one screen, add a border to any variant, or shrink the capsule below 44.
