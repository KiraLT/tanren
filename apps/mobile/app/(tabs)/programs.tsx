import { Match, Option } from "effect"
import { useRouter } from "expo-router"
import { ScrollView, View } from "react-native"
import {
  DayCard,
  DayItems,
  DayList,
  EnrolCard,
  ProgramFinished,
  ProgramInside,
} from "../../src/player/components/ProgramHome"
import { useProgramDay } from "../../src/player/useProgramDay"
import { AppBar, Banner, gutter, Page, Skeleton, space, useBreakpoint } from "../../src/ui"

const PROGRAMS_BAR = <AppBar title="Programs" />

export default function ProgramsScreen() {
  const router = useRouter()
  const { state, enroll, enrolling } = useProgramDay()
  const breakpoint = useBreakpoint()
  const wide = breakpoint === "desktop"
  const phone = breakpoint === "phone"
  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
  const play = () => router.push("/programs/play")

  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Page header={PROGRAMS_BAR}>
          <View accessible accessibilityLabel="Loading program" style={{ gap: space.lg }}>
            <Skeleton width="100%" height={136} />
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
          {phone ? <ProgramInside program={program} /> : null}
        </Page>
      ),
      Ready: ({ program, enrollment, day }) => (
        <Page
          header={PROGRAMS_BAR}
          scroll
          aside={
            <ScrollView contentContainerStyle={{ padding: gutter.desktop, paddingTop: space.lg }}>
              <DayList program={program} currentDay={enrollment.currentDay} />
            </ScrollView>
          }
        >
          {Option.match(day, {
            onNone: () => <ProgramFinished program={program} />,
            onSome: (today) => (
              <>
                <DayCard program={program} day={today} onStart={play} />
                <DayItems day={today} />
              </>
            ),
          })}
          {wide ? null : <DayList program={program} currentDay={enrollment.currentDay} />}
        </Page>
      ),
    }),
  )
}
