import { ProgramId } from "@tanren/shared"
import { Match, Option, Schema } from "effect"
import { type Href, useLocalSearchParams, useRouter } from "expo-router"
import type { ReactNode } from "react"
import { View } from "react-native"
import { DayPreview } from "../../../../src/components/programs/DayPreview"
import {
  dayParam,
  previewDay,
  startable,
} from "../../../../src/components/programs/dayPreviewLines"
import { useGoBack, useNavGuard } from "../../../../src/components/programs/useGoBack"
import { useProgramDetail } from "../../../../src/player/usePrograms"
import {
  AppBar,
  Banner,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
} from "../../../../src/ui"

// Level 2: the AppBar owns the page's one `h1`.
const NOT_FOUND = (
  <EmptyState
    icon="warning"
    headingLevel={2}
    title="Day not found"
    body="The program may have been deleted, or it has no such day."
  />
)

function Frame({
  title,
  back,
  wide,
  children,
}: {
  readonly title: string
  readonly back: () => void
  readonly wide: boolean
  readonly children: ReactNode
}) {
  return (
    <Page
      scroll
      wide={wide}
      header={
        <AppBar
          title={title}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {children}
    </Page>
  )
}

/** Reads the program and its running enrollment; never enrols and never starts the day. */
function DayPage({
  programId,
  dayNumber,
  back,
}: {
  readonly programId: ProgramId
  readonly dayNumber: number
  readonly back: () => void
}) {
  const router = useRouter()
  const navOnce = useNavGuard()
  const { state } = useProgramDetail(programId)
  const title = `Day ${dayNumber}`
  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Frame title={title} back={back} wide={false}>
          <View accessible accessibilityLabel="Loading day" style={{ gap: space.lg }}>
            <Skeleton width="100%" height={132} radius={radius.lg} />
            <Skeleton width="100%" height={280} radius={radius.lg} />
          </View>
        </Frame>
      ),
      Failed: ({ message }) => (
        <Frame title={title} back={back} wide={false}>
          <Banner tone="danger" title="Could not load this day" body={message} />
        </Frame>
      ),
      NotFound: () => (
        <Frame title={title} back={back} wide={false}>
          {NOT_FOUND}
        </Frame>
      ),
      Ready: ({ program, running }) => {
        const enrollment = Option.map(running, (entry) => entry.enrollment)
        return Option.match(previewDay(program, dayNumber, enrollment), {
          onNone: () => (
            <Frame title={title} back={back} wide={false}>
              {NOT_FOUND}
            </Frame>
          ),
          onSome: (day) => (
            <Frame title={title} back={back} wide>
              <DayPreview
                program={program}
                day={day}
                canStart={startable(enrollment, dayNumber)}
                onStart={() =>
                  Option.match(enrollment, {
                    onNone: () => undefined,
                    onSome: ({ id }) =>
                      navOnce(() =>
                        // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                        router.push({ pathname: "/programs/play", params: { enrollmentId: id } }),
                      ),
                  })
                }
              />
            </Frame>
          ),
        })
      },
    }),
  )
}

export default function ProgramDayScreen() {
  const { programId, n } = useLocalSearchParams<{ programId: string; n: string }>()
  const id = Schema.decodeUnknownOption(ProgramId)(programId)
  const dayNumber = dayParam(n)
  // Once per focus; a direct load has no history: fall back to the program's detail.
  const back = useGoBack(
    Option.match(id, {
      onNone: (): Href => "/programs",
      onSome: (value): Href => ({
        pathname: "/programs/[programId]",
        params: { programId: value },
      }),
    }),
  )
  if (Option.isSome(id) && Option.isSome(dayNumber)) {
    return <DayPage programId={id.value} dayNumber={dayNumber.value} back={back} />
  }
  return (
    <Frame title="Day" back={back} wide={false}>
      {NOT_FOUND}
    </Frame>
  )
}
