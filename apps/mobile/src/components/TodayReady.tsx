import { Array as Arr, Option } from "effect"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { ScrollView, View } from "react-native"
import { useLayoutMode } from "../hooks/useLayoutMode"
import { useLogSet } from "../hooks/useLogSet"
import { useRestTimer } from "../hooks/useRestTimer"
import type { TodayExercise } from "../hooks/useToday"
import { programBannerOf } from "../player/programBanner"
import { useProgramDay } from "../player/useProgramDay"
import { Banner, gutter, ListRow, Page, space, Text, useBreakpoint } from "../ui"
import { clampPage, ExercisePager } from "./ExercisePager"
import { RestTimerBar } from "./RestTimerBar"
import { SetList } from "./SetList"

interface TodayReadyProps {
  readonly exercises: ReadonlyArray<TodayExercise>
  /** The screen's `AppBar`, rendered above both columns. */
  readonly header: ReactNode
}

interface TodayAsideProps {
  readonly current: Option.Option<TodayExercise>
  readonly rest: ReactNode
}

/** Wide layout only: the current exercise's sets and the rest ring. Read-only, no log button. */
function TodayAside({ current, rest }: TodayAsideProps) {
  const breakpoint = useBreakpoint()
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: gutter[breakpoint],
          paddingTop: space.xl,
          gap: space.md,
        }}
      >
        {Option.match(current, {
          onNone: () => null,
          onSome: (item) => (
            <>
              <View style={{ gap: space.xs }}>
                <Text variant="subhead" tone="muted">
                  Sets
                </Text>
                <Text variant="headline" accessibilityRole="header">
                  {item.exercise.name}
                </Text>
              </View>
              <SetList plannedSets={item.plannedSets} loggedSets={item.loggedSets} />
            </>
          ),
        })}
      </ScrollView>
      {rest}
    </View>
  )
}

/**
 * Today's session: the exercise pager, store errors, and the rest timer. In the two-column
 * layout the rest timer becomes a ring in the aside, next to the current exercise's sets.
 */
export function TodayReady({ exercises, header }: TodayReadyProps) {
  const { logSet, pending, error } = useLogSet()
  const { remaining, start, stop } = useRestTimer()
  const [page, setPage] = useState(0)
  const [restTotal, setRestTotal] = useState(0)
  const wide = useLayoutMode() === "two-column"
  const breakpoint = useBreakpoint()
  const current = Arr.get(exercises, clampPage(page, exercises.length))
  const program = programBannerOf(useProgramDay().state)
  const router = useRouter()
  const onLogged = (seconds: number) => {
    setRestTotal(seconds)
    start(seconds)
  }
  const rest = (layout: "bar" | "ring") => (
    <RestTimerBar remaining={remaining} total={restTotal} layout={layout} onSkip={stop} />
  )
  return (
    <Page
      padded={false}
      header={header}
      aside={<TodayAside current={current} rest={rest("ring")} />}
    >
      <View style={{ flex: 1 }}>
        {Option.match(program, {
          onNone: () => null,
          onSome: (banner) => (
            <ListRow
              title={banner.title}
              subtitle={banner.subtitle}
              accessibilityLabel={banner.accessibilityLabel}
              // biome-ignore lint/plugin/noMutation: expo-router API
              onPress={() => router.push("/programs")}
              style={{ marginHorizontal: gutter[breakpoint], marginTop: space.md }}
            />
          ),
        })}
        <ExercisePager
          exercises={exercises}
          pending={pending}
          logSet={logSet}
          onLogged={onLogged}
          index={page}
          onIndexChange={setPage}
          showSets={!wide}
        />
        {Option.match(error, {
          onNone: () => null,
          onSome: (message) => (
            <Banner
              tone="danger"
              title="Could not log the set"
              body={message}
              style={{ marginHorizontal: gutter[breakpoint], marginBottom: space.md }}
            />
          ),
        })}
        {wide ? null : rest("bar")}
      </View>
    </Page>
  )
}
