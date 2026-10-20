import { Match, Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import {
  DayCard,
  DayList,
  EnrolCard,
  ProgramFinished,
} from "../../src/player/components/ProgramHome"
import { useProgramDay } from "../../src/player/useProgramDay"
import { AppBar, Banner, Page, Skeleton, space, useBreakpoint } from "../../src/ui"

const PROGRAMS_BAR = <AppBar title="Programs" />

export default function ProgramsScreen() {
  const router = useRouter()
  const { state, enroll, enrolling } = useProgramDay()
  const wide = useBreakpoint() === "desktop"
  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
  const play = () => router.push("/programs/play")

  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Page header={PROGRAMS_BAR}>
          <View accessible accessibilityLabel="Loading program" style={{ gap: space.lg }}>
            <Skeleton width="60%" height={32} />
            <Skeleton width="100%" height={220} />
          </View>
        </Page>
      ),
      Failed: ({ message }) => (
        <Page header={PROGRAMS_BAR}>
          <Banner tone="danger" title="Could not load programs" body={message} />
        </Page>
      ),
      NotEnrolled: ({ program }) => (
        <Page header={PROGRAMS_BAR} scroll>
          <EnrolCard program={program} enrolling={enrolling} onEnrol={() => enroll(program)} />
        </Page>
      ),
      Ready: ({ program, enrollment, day }) => (
        <Page
          header={PROGRAMS_BAR}
          scroll
          aside={<DayList program={program} currentDay={enrollment.currentDay} />}
        >
          {Option.match(day, {
            onNone: () => <ProgramFinished program={program} />,
            onSome: (today) => (
              <DayCard program={program} day={today} showItems={!wide} onStart={play} />
            ),
          })}
        </Page>
      ),
    }),
  )
}
