import { Option } from "effect"
import { useRouter } from "expo-router"
import { useProfileState } from "../../hooks/useProfile"
import { ListRow } from "../../ui"
import { localDateOf } from "../planFormat"
import { NUTRITION_TITLE, nutritionSubtitle } from "./nutritionCopy"
import { SettingsSection } from "./SettingsSection"

/** Settings > Nutrition & goals (nutrition.md §6): one row, goal · targets or "Off", opens the editor. */
export function NutritionSection() {
  const router = useRouter()
  const state = useProfileState()
  const subtitle =
    state._tag === "Loaded"
      ? nutritionSubtitle(
          Option.flatMap(state.profile, (profile) => profile.nutrition),
          localDateOf(new Date()),
        )
      : " "
  return (
    <SettingsSection title="Nutrition">
      <ListRow
        icon="target"
        title={NUTRITION_TITLE}
        subtitle={subtitle}
        accessibilityLabel={`${NUTRITION_TITLE}, ${subtitle}`}
        // biome-ignore lint/plugin/noMutation: expo-router push
        onPress={() => router.push("/settings/nutrition")}
        chevron
      />
    </SettingsSection>
  )
}
