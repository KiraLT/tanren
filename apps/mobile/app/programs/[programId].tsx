import { ProgramId } from "@tanren/shared"
import { Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { ProgramActions } from "../../src/player/components/ProgramActions"
import {
  DayCard,
  DayItems,
  DayList,
  DayStats,
  EnrolCard,
  ProgramFinished,
  ProgramInside,
} from "../../src/player/components/ProgramHome"
import { enrolLabel, summarySubtitle, userProgramIdOf } from "../../src/player/programList"
import { useProgramDetail } from "../../src/player/usePrograms"
import type { SettableStatus } from "../../src/services/ProgramRepo"
import {
  AppBar,
  Banner,
  Columns,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
  useBreakpoint,
} from "../../src/ui"

// A `Banner`, not `EmptyState`: the empty state's title is an `h1`, and the AppBar owns the page's.
const NOT_FOUND = (
  <Banner
    tone="danger"
    title="Program not found"
    body="It may have been deleted on another device."
  />
)

function DetailSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading program" style={{ gap: space.lg }}>
      <Skeleton width="100%" height={176} radius={radius.lg} />
      <Skeleton width="100%" height={220} radius={radius.lg} />
    </View>
  )
}

function ProgramPage({
  programId,
  back,
}: {
  readonly programId: ProgramId
  readonly back: () => void
}) {
  const router = useRouter()
  const desktop = useBreakpoint() === "desktop"
  const { state, enroll, setStatus, remove, busy, error } = useProgramDetail(programId)
  const ready = state._tag === "Ready"
  return (
    <Page
      scroll
      wide={ready}
      header={
        <AppBar
          title="Program"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <DetailSkeleton />,
          Failed: ({ message }) => (
            <Banner tone="danger" title="Could not load this program" body={message} />
          ),
          NotFound: () => NOT_FOUND,
          Ready: ({ program, summary, running, othersActive }) => {
            const currentDay = Option.match(running, {
              onNone: () => 1,
              onSome: ({ enrollment }) => enrollment.currentDay,
            })
            const hero = Option.match(running, {
              onNone: () => (
                <EnrolCard
                  program={program}
                  enrolling={busy}
                  startLabel={enrolLabel(othersActive)}
                  meta={summarySubtitle(summary)}
                  onEnrol={enroll}
                />
              ),
              onSome: ({ enrollment, day }) =>
                Option.match(day, {
                  onNone: () => <ProgramFinished program={program} />,
                  onSome: (today) => (
                    <>
                      <DayCard
                        program={program}
                        day={today}
                        paused={enrollment.status === "paused"}
                        onStart={() =>
                          // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                          router.push({
                            pathname: "/programs/play",
                            params: { enrollmentId: enrollment.id },
                          })
                        }
                        onResume={() => setStatus(enrollment.id, "active")}
                      />
                      {desktop ? <DayStats program={program} day={today} /> : null}
                      <DayItems day={today} />
                    </>
                  ),
                }),
            })
            const runningStatus = (status: SettableStatus) => {
              if (Option.isSome(running)) {
                setStatus(running.value.enrollment.id, status)
              }
            }
            const actions = (
              <ProgramActions
                title={program.name}
                running={running}
                builtin={summary.source === "builtin"}
                busy={busy}
                error={error}
                onPause={() => runningStatus("paused")}
                onLeave={() => runningStatus("abandoned")}
                onEdit={() =>
                  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                  router.push({
                    pathname: "/programs/edit/[programId]",
                    params: { programId: summary.programId },
                  })
                }
                onDuplicate={() =>
                  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                  router.push({ pathname: "/programs/new", params: { from: summary.programId } })
                }
                onDelete={() => {
                  const id = userProgramIdOf(summary)
                  if (Option.isSome(id)) {
                    remove(id.value).then((deleted) => {
                      if (deleted) {
                        router.replace("/programs")
                      }
                    })
                  }
                }}
              />
            )
            const days = <DayList program={program} currentDay={currentDay} />
            return (
              <Columns
                split="6/6"
                main={
                  <View style={{ gap: space.lg }}>
                    {hero}
                    {Option.isNone(running) && !desktop ? (
                      <ProgramInside program={program} />
                    ) : null}
                    {actions}
                  </View>
                }
                side={desktop ? days : null}
              />
            )
          },
        }),
      )}
    </Page>
  )
}

export default function ProgramScreen() {
  const router = useRouter()
  const { programId } = useLocalSearchParams<{ programId: string }>()
  // A direct load has no history to go back to: fall back to the Programs tab.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/programs"))
  return Option.match(Schema.decodeUnknownOption(ProgramId)(programId), {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Program"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        {NOT_FOUND}
      </Page>
    ),
    onSome: (id) => <ProgramPage programId={id} back={back} />,
  })
}
