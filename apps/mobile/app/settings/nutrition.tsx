import {
  formatInt,
  type NutritionGoal,
  type NutritionProfile,
  nutritionTargets,
  type Sex,
} from "@tanren/shared"
import { Option, Result } from "effect"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { Switch, View } from "react-native"
import { localDateOf } from "../../src/components/planFormat"
import {
  ACTIVITY_LABELS,
  ACTIVITY_ORDER,
  ageLabel,
  EAT_BACK_SUBTITLE,
  EAT_BACK_TITLE,
  GOAL_LABELS,
  GOAL_ORDER,
  NUTRITION_TITLE,
  SEX_LABELS,
  showTargetsHint,
  TARGETS_HINT,
} from "../../src/components/settings/nutritionCopy"
import {
  ADD_DEFAULTS,
  canSave,
  draftOf,
  type NutritionDraft,
  stepValue,
  validateDraft,
} from "../../src/components/settings/nutritionSettings"
import { SettingsSection } from "../../src/components/settings/SettingsSection"
import { useNutritionSettings } from "../../src/components/settings/useNutritionSettings"
import { useGarminConnected } from "../../src/hooks/useIntegrations"
import { useProfileState } from "../../src/hooks/useProfile"
import {
  AppBar,
  Banner,
  Button,
  Card,
  Columns,
  Icon,
  IconButton,
  ListRow,
  Page,
  rhythm,
  SegmentedControl,
  StatRow,
  Stepper,
  sizes,
  space,
  Text,
  useTheme,
} from "../../src/ui"

const SEX_OPTIONS = (["male", "female", "skip"] as const).map((value) => ({
  value,
  label: SEX_LABELS[value],
}))

const isSex = (value: string): value is Sex => value === "male" || value === "female"

const isGoal = (value: string): value is NutritionGoal => GOAL_ORDER.some((goal) => goal === value)

/** A titled block (headline over content), the Settings rhythm without a ListGroup. */
function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

interface OptionalStepperProps {
  readonly label: string
  /** The caption's unit for the current value ("cm", or "age 36" for a birth year). */
  readonly unit: (value: number) => string
  readonly value: Option.Option<number>
  readonly format: (value: number) => string
  readonly onChange: (next: Option.Option<number>) => void
  readonly onStep: (value: number, direction: 1 | -1) => number
  readonly addValue: number
}

/** An optional number: "Not set" + "Add" while unset, then a stepper with "Clear". */
function OptionalStepper({
  label,
  unit,
  value,
  format,
  onChange,
  onStep,
  addValue,
}: OptionalStepperProps) {
  return Option.match(value, {
    onNone: () => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: sizes.controlLg,
        }}
      >
        <View>
          <Text variant="headline">{label}</Text>
          <Text variant="subhead" tone="muted">
            Not set
          </Text>
        </View>
        <Button
          label="Add"
          accessibilityLabel={`Add ${label.toLowerCase()}`}
          variant="secondary"
          size="md"
          icon="plus"
          onPress={() => onChange(Option.some(addValue))}
        />
      </View>
    ),
    onSome: (current) => (
      <View style={{ gap: space.xs }}>
        <Stepper
          label={label}
          valueText={format(current)}
          unit={unit(current)}
          size="lg"
          onDecrement={() => onChange(Option.some(onStep(current, -1)))}
          onIncrement={() => onChange(Option.some(onStep(current, 1)))}
        />
        <Button
          label="Clear"
          accessibilityLabel={`Clear ${label.toLowerCase()}`}
          variant="text"
          size="md"
          onPress={() => onChange(Option.none())}
          style={{ alignSelf: "flex-end" }}
        />
      </View>
    ),
  })
}

interface FormProps {
  readonly saved: Option.Option<NutritionProfile>
  readonly garminConnected: boolean
}

function NutritionForm({ saved, garminConnected }: FormProps) {
  const { colors } = useTheme()
  // Seeded once: a sync pull that lands mid-edit is overwritten by Save (accepted limit, REV-1 #6).
  const [draft, setDraft] = useState<NutritionDraft>(() => draftOf(saved))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const { save, error, dismiss } = useNutritionSettings()
  const patch = (fields: Partial<NutritionDraft>) =>
    setDraft((current) => ({ ...current, ...fields }))
  const today = localDateOf(new Date())
  const derived = nutritionTargets(
    { ...draft, kcalTarget: Option.none(), proteinTargetG: Option.none() },
    today,
  )
  const targets = nutritionTargets(draft, today)
  const customKcal = Option.isSome(draft.kcalTarget)
  const customProtein = Option.isSome(draft.proteinTargetG)
  const submit = (next: Option.Option<NutritionProfile>) => {
    setBusy(true)
    save(next).then(() => setBusy(false))
  }
  const onSave = () =>
    Result.match(validateDraft(draft), {
      onFailure: () => undefined,
      onSuccess: (profile) => submit(Option.some(profile)),
    })

  const main = (
    <View style={{ gap: rhythm.groupToLabel }}>
      <Group title="Goal">
        <SegmentedControl
          accessibilityLabel="Goal"
          options={GOAL_ORDER.map((goal) => ({ value: goal, label: GOAL_LABELS[goal] }))}
          value={draft.goal}
          onChange={(value) => {
            if (isGoal(value)) patch({ goal: value })
          }}
        />
      </Group>
      <Group title="Body">
        <Card>
          <View style={{ gap: space.lg }}>
            <Stepper
              label="Weight"
              valueText={draft.bodyWeightKg.toFixed(1)}
              unit="kg"
              size="lg"
              onDecrement={() =>
                patch({ bodyWeightKg: stepValue("bodyWeightKg", draft.bodyWeightKg, -1) })
              }
              onIncrement={() =>
                patch({ bodyWeightKg: stepValue("bodyWeightKg", draft.bodyWeightKg, 1) })
              }
            />
            <OptionalStepper
              label="Height"
              unit={() => "cm"}
              value={draft.heightCm}
              format={(value) => String(value)}
              addValue={ADD_DEFAULTS.heightCm}
              onStep={(value, direction) => stepValue("heightCm", value, direction)}
              onChange={(heightCm) => patch({ heightCm })}
            />
            <OptionalStepper
              label="Birth year"
              unit={(year) => ageLabel(year, today)}
              value={draft.birthYear}
              format={(value) => String(value)}
              addValue={ADD_DEFAULTS.birthYear}
              onStep={(value, direction) => stepValue("birthYear", value, direction)}
              onChange={(birthYear) => patch({ birthYear })}
            />
            <View style={{ gap: space.sm }}>
              <Text variant="headline">Sex</Text>
              <SegmentedControl
                accessibilityLabel="Sex"
                options={SEX_OPTIONS}
                value={Option.getOrElse(draft.sex, (): string => "skip")}
                onChange={(value) =>
                  patch({ sex: isSex(value) ? Option.some(value) : Option.none() })
                }
              />
            </View>
          </View>
        </Card>
      </Group>
    </View>
  )

  // Desktop: Activity heads the side column so both columns fill; below desktop `Columns` stacks
  // main then side, so the phone order (Goal, Body, Activity, Targets) is unchanged.
  const side = (
    <View style={{ gap: rhythm.groupToLabel }}>
      <SettingsSection title="Activity">
        {ACTIVITY_ORDER.map((level) => {
          const selected = draft.activityLevel === level
          return (
            <ListRow
              key={level}
              title={ACTIVITY_LABELS[level].title}
              subtitle={ACTIVITY_LABELS[level].subtitle}
              selected={selected}
              accessibilityLabel={`${ACTIVITY_LABELS[level].title}${selected ? ", selected" : ""}`}
              onPress={() => patch({ activityLevel: level })}
              trailing={
                selected ? <Icon name="check" size={sizes.iconSm} color={colors.accent} /> : null
              }
            />
          )
        })}
      </SettingsSection>
      <Group title="Daily targets">
        <StatRow
          variant="tile"
          items={[
            {
              label: customKcal ? "Calories · Custom" : "Calories",
              value: `${formatInt(targets.kcal)} kcal`,
            },
            {
              label: customProtein ? "Protein · Custom" : "Protein",
              value: `${formatInt(targets.proteinG)} g`,
            },
          ]}
        />
        {showTargetsHint(draft) ? (
          <Text variant="caption" tone="muted">
            {TARGETS_HINT}
          </Text>
        ) : null}
        {editing ? (
          <Card>
            <View style={{ gap: space.lg }}>
              <Stepper
                label="Calories"
                valueText={formatInt(targets.kcal)}
                unit="kcal"
                size="lg"
                onDecrement={() =>
                  patch({ kcalTarget: Option.some(stepValue("kcalTarget", targets.kcal, -1)) })
                }
                onIncrement={() =>
                  patch({ kcalTarget: Option.some(stepValue("kcalTarget", targets.kcal, 1)) })
                }
              />
              <Stepper
                label="Protein"
                valueText={formatInt(targets.proteinG)}
                unit="g"
                size="lg"
                onDecrement={() =>
                  patch({
                    proteinTargetG: Option.some(stepValue("proteinTargetG", targets.proteinG, -1)),
                  })
                }
                onIncrement={() =>
                  patch({
                    proteinTargetG: Option.some(stepValue("proteinTargetG", targets.proteinG, 1)),
                  })
                }
              />
              <Button
                label={`Use derived (${formatInt(derived.kcal)} kcal · ${formatInt(derived.proteinG)} g)`}
                accessibilityLabel="Use derived targets"
                variant="secondary"
                size="md"
                disabled={!customKcal && !customProtein}
                onPress={() => patch({ kcalTarget: Option.none(), proteinTargetG: Option.none() })}
              />
            </View>
          </Card>
        ) : null}
        <Button
          label={editing ? "Done editing" : "Edit targets"}
          variant="text"
          size="md"
          icon={editing ? "check" : "target"}
          onPress={() => setEditing(!editing)}
          style={{ alignSelf: "flex-start" }}
        />
      </Group>
      {garminConnected ? (
        <SettingsSection title="Garmin">
          <ListRow
            title={EAT_BACK_TITLE}
            subtitle={EAT_BACK_SUBTITLE}
            // The whole row is the tap target (the web Switch alone is 40 x 20); the Switch only
            // shows the state, so it ignores pointer events and one press never toggles twice.
            accessibilityLabel={EAT_BACK_TITLE}
            checked={draft.eatBackActive}
            onPress={() => patch({ eatBackActive: !draft.eatBackActive })}
            trailing={
              // The row announces as a switch with its state, so the Switch is hidden from assistive tech
              // and focus: the a11y props on native, `aria-hidden` + `inert` on web (RNW forwards
              // `inert`, which takes the checkbox out of the tab order; not in RN's types, hence
              // the spread). Keyboard and screen-reader users toggle through the row.
              <View
                style={{ minHeight: sizes.tap, justifyContent: "center", pointerEvents: "none" }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
                {...{ inert: true }}
              >
                <Switch
                  accessibilityLabel={EAT_BACK_TITLE}
                  value={draft.eatBackActive}
                  onValueChange={(eatBackActive) => patch({ eatBackActive })}
                  // `textMuted`: the `border` track vanished on the `surface` row in both schemes.
                  trackColor={{ false: colors.textMuted, true: colors.accent }}
                  // RNW's default "on" thumb is teal (#009688), off-palette; web reads the on-state
                  // thumb from `activeThumbColor` (RNW-only, not in RN's types, hence the spread).
                  thumbColor={colors.onAccent}
                  {...{ activeThumbColor: colors.onAccent }}
                />
              </View>
            }
          />
        </SettingsSection>
      ) : null}
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not save" body={message} onDismiss={dismiss} />
        ),
      })}
      <View style={{ gap: space.lg }}>
        <Button
          label="Save"
          variant="primary"
          size="lg"
          loading={busy}
          disabled={busy || !canSave(draft, saved)}
          onPress={onSave}
        />
        {Option.isSome(saved) ? (
          <Button
            label="Turn off"
            accessibilityLabel="Turn off nutrition tracking"
            variant="text"
            size="md"
            disabled={busy}
            onPress={() => submit(Option.none())}
            style={{ alignSelf: "center" }}
          />
        ) : null}
      </View>
    </View>
  )

  return <Columns split="7/5" main={main} side={side} />
}

/** Root-Stack route: Settings > Nutrition & goals (nutrition.md §6). */
export default function NutritionScreen() {
  const router = useRouter()
  const state = useProfileState()
  const garminConnected = useGarminConnected()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"))
  return (
    <Page
      scroll
      wide={state._tag === "Loaded"}
      header={
        <AppBar
          title={NUTRITION_TITLE}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {state._tag === "Loaded" ? (
        <NutritionForm
          saved={Option.flatMap(state.profile, (profile) => profile.nutrition)}
          garminConnected={garminConnected}
        />
      ) : null}
    </Page>
  )
}
