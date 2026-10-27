import { type ProgramDay, ProgramId } from "@tanren/shared"
import { Array as Arr, Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect } from "react"
import { View } from "react-native"
import { DayForm } from "../../../../../src/components/programs/DayForm"
import {
  pickForParam,
  removeDay,
  updateDay,
} from "../../../../../src/components/programs/programEdit"
import { useGoBack, useNavGuard } from "../../../../../src/components/programs/useGoBack"
import {
  type ProgramDraft,
  useProgramUpdate,
} from "../../../../../src/components/programs/useProgramEditor"
import { useProgramDetail } from "../../../../../src/player/usePrograms"
import {
  AppBar,
  Banner,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
} from "../../../../../src/ui"

// Level 2: the AppBar owns the page's one `h1`.
const NOT_FOUND = (
  <EmptyState
    icon="warning"
    headingLevel={2}
    title="Day not found"
    body="It may have been removed."
  />
)

function DaySkeleton() {
  return (
    <View accessible accessibilityLabel="Loading day" style={{ gap: space.lg }}>
      <Skeleton width="100%" height={48} radius={radius.md} />
      <Skeleton width="100%" height={110} radius={radius.lg} />
      <Skeleton width="100%" height={176} radius={radius.lg} />
    </View>
  )
}

function DayPage({
  programId,
  dayNumber,
}: {
  readonly programId: ProgramId
  readonly dayNumber: number
}) {
  const router = useRouter()
  const back = useGoBack({ pathname: "/programs/edit/[programId]", params: { programId } })
  const { state } = useProgramDetail(programId)
  const { update, updateOnce, updateAndLeave, observe, busy, error } = useProgramUpdate()
  // A saved move/remove keeps the gate shut until this screen has rendered the reloaded version.
  const renderedVersion = state._tag === "Ready" ? state.summary.version : 0
  useEffect(() => observe(renderedVersion), [observe, renderedVersion])
  const once = useNavGuard()
  const editable =
    state._tag === "Ready" &&
    state.summary.source !== "builtin" &&
    Arr.some(state.program.days, (entry) => entry.dayNumber === dayNumber)
  const changeDay = (change: (day: ProgramDay) => ProgramDay) => (draft: ProgramDraft) => ({
    ...draft,
    days: updateDay(draft.days, dayNumber, change),
  })
  return (
    <Page
      scroll
      wide={editable}
      header={
        <AppBar
          title={`Day ${dayNumber}`}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <DaySkeleton />,
          Failed: ({ message }) => (
            <Banner tone="danger" title="Could not load this program" body={message} />
          ),
          NotFound: () => NOT_FOUND,
          Ready: ({ program, summary }) => {
            const day = Arr.findFirst(program.days, (entry) => entry.dayNumber === dayNumber)
            return summary.source === "builtin" || Option.isNone(day) ? (
              NOT_FOUND
            ) : (
              <DayForm
                day={day.value}
                onlyDay={program.days.length === 1}
                error={error}
                busy={busy}
                onChange={(change) => update(programId, changeDay(change))}
                onChangeOnce={(change) => updateOnce(programId, changeDay(change))}
                onAddExercise={() =>
                  once(() =>
                    // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                    router.push({
                      pathname: "/programs/pick",
                      params: { pickFor: pickForParam({ programId, dayNumber }) },
                    }),
                  )
                }
                onRemoveDay={() =>
                  updateAndLeave(programId, (draft) => ({
                    ...draft,
                    days: removeDay(draft.days, dayNumber - 1),
                  })).then((saved) => {
                    if (saved) {
                      back()
                    }
                  })
                }
                onDone={back}
              />
            )
          },
        }),
      )}
    </Page>
  )
}

export default function EditDayScreen() {
  const back = useGoBack("/train?view=programs")
  const { programId, n } = useLocalSearchParams<{ programId: string; n: string }>()
  const id = Schema.decodeUnknownOption(ProgramId)(programId)
  const dayNumber = Number(n)
  return Option.match(id, {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Day"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        {NOT_FOUND}
      </Page>
    ),
    onSome: (programIdValue) => <DayPage programId={programIdValue} dayNumber={dayNumber} />,
  })
}
