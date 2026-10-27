import { ProgramId } from "@tanren/shared"
import { Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect } from "react"
import { View } from "react-native"
import { ProgramForm } from "../../../src/components/programs/ProgramForm"
import { defaultSchedule } from "../../../src/components/programs/programEdit"
import { useGoBack, useNavGuard } from "../../../src/components/programs/useGoBack"
import { useProgramUpdate } from "../../../src/components/programs/useProgramEditor"
import { useProgramDetail } from "../../../src/player/usePrograms"
import {
  AppBar,
  Banner,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
} from "../../../src/ui"

// Level 2: the AppBar owns the page's one `h1`.
const NOT_FOUND = (
  <EmptyState
    icon="warning"
    headingLevel={2}
    title="Program not found"
    body="It may have been deleted on another device."
  />
)

function FormSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading program" style={{ gap: space.lg }}>
      <Skeleton width="100%" height={48} radius={radius.md} />
      <Skeleton width="100%" height={68} radius={radius.md} />
      <Skeleton width="100%" height={44} radius={radius.md} />
      <Skeleton width="100%" height={220} radius={radius.lg} />
    </View>
  )
}

function EditPage({ programId }: { readonly programId: ProgramId }) {
  const router = useRouter()
  const back = useGoBack("/programs")
  const { state } = useProgramDetail(programId)
  const { update, updateOnce, observe, busy, error } = useProgramUpdate()
  // A saved move/remove keeps the gate shut until this screen has rendered the reloaded version.
  const renderedVersion = state._tag === "Ready" ? state.summary.version : 0
  useEffect(() => observe(renderedVersion), [observe, renderedVersion])
  const once = useNavGuard()
  const editable = state._tag === "Ready" && state.summary.source !== "builtin"
  return (
    <Page
      scroll
      wide={editable}
      header={
        <AppBar
          title="Edit program"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <FormSkeleton />,
          Failed: ({ message }) => (
            <Banner tone="danger" title="Could not load this program" body={message} />
          ),
          NotFound: () => NOT_FOUND,
          Ready: ({ program, summary }) =>
            summary.source === "builtin" ? (
              <Banner
                title="Built-in programs cannot be edited"
                body="Duplicate it to get a copy of your own."
                action={{
                  label: "Duplicate to edit",
                  onPress: () =>
                    once(() =>
                      router.replace({ pathname: "/programs/new", params: { from: programId } }),
                    ),
                }}
              />
            ) : (
              <ProgramForm
                title={program.name}
                summary={program.tagline}
                schedule={Option.getOrElse(summary.schedule, () =>
                  defaultSchedule(program.days.length),
                )}
                days={program.days}
                error={error}
                busy={busy}
                onChange={(change) => update(programId, change)}
                onChangeOnce={(change) => updateOnce(programId, change)}
                onOpenDay={(dayNumber) =>
                  once(() =>
                    // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                    router.push({
                      pathname: "/programs/edit/[programId]/day/[n]",
                      params: { programId, n: String(dayNumber) },
                    }),
                  )
                }
                onSave={back}
              />
            ),
        }),
      )}
    </Page>
  )
}

export default function EditProgramScreen() {
  const back = useGoBack("/programs")
  const { programId } = useLocalSearchParams<{ programId: string }>()
  return Option.match(Schema.decodeUnknownOption(ProgramId)(programId), {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Edit program"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        {NOT_FOUND}
      </Page>
    ),
    onSome: (id) => <EditPage programId={id} />,
  })
}
