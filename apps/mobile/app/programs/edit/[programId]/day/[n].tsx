import { ProgramId } from "@tanren/shared"
import { Array as Arr, Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { DayForm } from "../../../../../src/components/programs/DayForm"
import {
  pickForParam,
  removeDay,
  updateDay,
} from "../../../../../src/components/programs/programEdit"
import { useGoBack } from "../../../../../src/components/programs/useGoBack"
import { useProgramUpdate } from "../../../../../src/components/programs/useProgramEditor"
import { useProgramDetail } from "../../../../../src/player/usePrograms"
import { AppBar, Banner, IconButton, Page, radius, Skeleton, space } from "../../../../../src/ui"

const NOT_FOUND = <Banner tone="danger" title="Day not found" body="It may have been removed." />

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
  const { update, error } = useProgramUpdate()
  return (
    <Page
      scroll
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
                onChange={(change) =>
                  update(programId, (draft) => ({
                    ...draft,
                    days: updateDay(draft.days, dayNumber, change),
                  }))
                }
                onAddExercise={() =>
                  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                  router.push({
                    pathname: "/programs/pick",
                    params: { pickFor: pickForParam({ programId, dayNumber }) },
                  })
                }
                onRemoveDay={() =>
                  update(programId, (draft) => ({
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
  const back = useGoBack("/programs")
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
