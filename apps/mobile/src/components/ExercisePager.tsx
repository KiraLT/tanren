import { Array as Arr, Option } from "effect"
import { useRef } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import type { LogSetInput, TodayExercise } from "../hooks/useToday"
import { BigButton } from "./BigButton"
import { ExercisePage } from "./ExercisePage"
import { colors, sizes, space } from "./theme"

interface ExercisePagerProps {
  readonly exercises: ReadonlyArray<TodayExercise>
  readonly pending: boolean
  readonly logSet: (input: LogSetInput) => Promise<boolean>
  readonly onLogged: (restSeconds: number) => void
  /** Current page, owned by the parent so the wide layout's aside can follow it. */
  readonly index: number
  readonly onIndexChange: (index: number) => void
  /** Passed to each page; false when the wide layout's aside shows the sets. Default true. */
  readonly showSets?: boolean
}

/** Clamps a page index to the existing pages (the exercise list can shrink after a reload). */
export const clampPage = (index: number, count: number): number =>
  Math.min(Math.max(0, index), Math.max(0, count - 1))

/** Page index for a horizontal scroll offset, clamped to the existing pages. */
const pageIndex = (offsetX: number, width: number, count: number): number =>
  clampPage(Math.round(offsetX / width), count)

/**
 * One exercise per page, swipe horizontally (paging ScrollView: native on iOS, CSS scroll-snap on
 * web) or tap Prev / Next (mouse users on web).
 */
export function ExercisePager({
  exercises,
  pending,
  logSet,
  onLogged,
  index: rawIndex,
  onIndexChange,
  showSets = true,
}: ExercisePagerProps) {
  const scrollRef = useRef<ScrollViewInstance>(null)
  const { width: windowWidth } = useWindowDimensions()
  const width = Math.min(windowWidth, sizes.contentMaxWidth)
  const count = exercises.length
  const index = clampPage(rawIndex, count)

  const goTo = (target: number) => {
    scrollRef.current?.scrollTo({ x: target * width, animated: true })
    onIndexChange(target)
  }
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    onIndexChange(pageIndex(event.nativeEvent.contentOffset.x, width, count))
  const current = Arr.get(exercises, index)

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <BigButton
          label="‹ PREV"
          accessibilityLabel="Previous exercise"
          disabled={index <= 0}
          onPress={() => goTo(index - 1)}
        />
        <Text
          style={styles.position}
          accessibilityLabel={`Exercise ${index + 1} of ${count}${Option.match(current, {
            onNone: () => "",
            onSome: (item) => `: ${item.exercise.name}`,
          })}`}
        >
          {index + 1} / {count}
        </Text>
        <BigButton
          label="NEXT ›"
          accessibilityLabel="Next exercise"
          disabled={index >= count - 1}
          onPress={() => goTo(index + 1)}
        />
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.pages}
      >
        {exercises.map((item) => (
          <ExercisePage
            key={item.exercise.id}
            item={item}
            width={width}
            pending={pending}
            logSet={logSet}
            onLogged={onLogged}
            showSets={showSets}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  position: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pages: { flex: 1 },
})
