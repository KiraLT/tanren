import { Array as Arr, Option } from "effect"
import { type ReactNode, useState } from "react"
import { ScrollView, View } from "react-native"
import { useLayoutMode } from "../hooks/useLayoutMode"
import { useLogSet } from "../hooks/useLogSet"
import { useProfileState } from "../hooks/useProfile"
import { useRestTimer } from "../hooks/useRestTimer"
import type { TodayExercise } from "../hooks/useToday"
import { segmentsFilled } from "../player/playerHeader"
import { useProgramDay } from "../player/useProgramDay"
import {
  AppBar,
  Banner,
  gutter,
  ListGroup,
  ListRow,
  Page,
  SegmentBar,
  space,
  Text,
  useBreakpoint,
} from "../ui"
import { clampPage, ExercisePager } from "./ExercisePager"
import { RestTimerBar } from "./RestTimerBar"
import { SetList } from "./SetList"
import { sessionRows } from "./sessionOverview"
import { TodaySetupCard } from "./TodaySetupCard"
import { todayEyebrowOf } from "./todayHeader"
import { needsEquipmentSetup } from "./todaySetup"

interface TodayReadyProps {
  /** The planned session's name: the AppBar title. */
  readonly title: string
  /** Extra AppBar control after the exercise counter (the sign-in entry; renders null when not needed). */
  readonly accessory?: ReactNode
  readonly exercises: ReadonlyArray<TodayExercise>
  /** End of the session view, under the pager (the Finish workout slot). */
  readonly footer?: ReactNode
}

interface ExerciseCounterProps {
  readonly index: number
  readonly count: number
  readonly name: Option.Option<string>
}

/** App-bar right slot (§5): "Exercise 1 of 6" over one segment per exercise. */
function ExerciseCounter({ index, count, name }: ExerciseCounterProps) {
  const position = `Exercise ${index + 1} of ${count}`
  return (
    <View style={{ alignItems: "flex-end", gap: space.xs }}>
      <Text
        variant="subhead"
        tone="muted"
        accessibilityLabel={`${position}${Option.match(name, {
          onNone: () => "",
          onSome: (value) => `: ${value}`,
        })}`}
      >
        Exercise{" "}
        <Text variant="subhead" style={{ fontVariant: ["tabular-nums"] }}>
          {String(index + 1)}
        </Text>{" "}
        of {count}
      </Text>
      <SegmentBar
        total={count}
        filled={segmentsFilled(index + 1, count)}
        accessibilityLabel={position}
      />
    </View>
  )
}

interface TodayAsideProps {
  readonly exercises: ReadonlyArray<TodayExercise>
  readonly index: number
  readonly onSelect: (index: number) => void
  readonly current: Option.Option<TodayExercise>
  readonly rest: ReactNode
}

/**
 * Wide layout only: the session's exercises (press opens one in the pager), then the current
 * exercise's sets and the rest ring. Read-only, no log button.
 */
function TodayAside({ exercises, index, onSelect, current, rest }: TodayAsideProps) {
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
        {exercises.length === 0 ? null : (
          <View style={{ gap: space.sm }}>
            <Text variant="subhead" tone="muted">
              Session
            </Text>
            <ListGroup>
              {Arr.map(sessionRows(exercises, index), (row) => (
                <ListRow
                  key={row.index}
                  title={row.title}
                  titleVariant="body"
                  accessibilityLabel={`${row.title}, ${row.trailing}${row.state === "now" ? ", current" : ""}`}
                  disc={{ state: row.state, index: row.number }}
                  trailing={
                    <Text variant="subhead" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                      {row.trailing}
                    </Text>
                  }
                  onPress={() => onSelect(row.index)}
                />
              ))}
            </ListGroup>
          </View>
        )}
        {Option.match(current, {
          onNone: () => null,
          onSome: (item) => (
            <>
              <View style={{ gap: space.xs }}>
                <Text variant="subhead" tone="muted">
                  Sets
                </Text>
                <Text variant="title2" accessibilityRole="header">
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
 * Today's session: the AppBar (program eyebrow, session title, exercise counter), the exercise
 * pager, store errors, and the rest timer. In the two-column layout the rest timer becomes a
 * ring in the aside, next to the current exercise's sets.
 */
export function TodayReady({ title, accessory, exercises, footer }: TodayReadyProps) {
  const { logSet, pending, error } = useLogSet()
  const { remaining, start, stop } = useRestTimer()
  const [page, setPage] = useState(0)
  const [restTotal, setRestTotal] = useState(0)
  const wide = useLayoutMode() === "two-column"
  const breakpoint = useBreakpoint()
  const index = clampPage(page, exercises.length)
  const current = Arr.get(exercises, index)
  const eyebrow = todayEyebrowOf(useProgramDay().state)
  const setup = needsEquipmentSetup(useProfileState())
  const onLogged = (seconds: number) => {
    setRestTotal(seconds)
    start(seconds)
  }
  const rest = (layout: "bar" | "ring") => (
    <RestTimerBar remaining={remaining} total={restTotal} layout={layout} onSkip={stop} />
  )
  const header = (
    <AppBar
      title={title}
      {...Option.match(eyebrow, { onNone: () => ({}), onSome: (value) => ({ eyebrow: value }) })}
      trailing={
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {exercises.length === 0 ? null : (
            <ExerciseCounter
              index={index}
              count={exercises.length}
              name={Option.map(current, (item) => item.exercise.name)}
            />
          )}
          {accessory}
        </View>
      }
    />
  )
  return (
    <Page
      padded={false}
      header={header}
      aside={
        <TodayAside
          exercises={exercises}
          index={index}
          onSelect={setPage}
          current={current}
          rest={rest("ring")}
        />
      }
    >
      <View style={{ flex: 1 }}>
        {setup ? (
          <View style={{ marginHorizontal: gutter[breakpoint], marginTop: space.lg }}>
            <TodaySetupCard />
          </View>
        ) : null}
        <ExercisePager
          exercises={exercises}
          pending={pending}
          logSet={logSet}
          onLogged={onLogged}
          index={page}
          onIndexChange={setPage}
          showSets={!wide}
        />
        {footer}
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
