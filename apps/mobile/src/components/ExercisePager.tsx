import { Array as Arr, Option } from "effect"
import { useRef, useState } from "react"
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
}

/** Page index for a horizontal scroll offset, clamped to the existing pages. */
const pageIndex = (offsetX: number, width: number, count: number): number =>
  Math.min(Math.max(0, Math.round(offsetX / width)), Math.max(0, count - 1))

/**
 * One exercise per page, swipe horizontally (paging ScrollView: native on iOS, CSS scroll-snap on
 * web) or tap Prev / Next (mouse users on web).
 */
export function ExercisePager({ exercises, pending, logSet, onLogged }: ExercisePagerProps) {
  const scrollRef = useRef<ScrollViewInstance>(null)
  const { width: windowWidth } = useWindowDimensions()
  const width = Math.min(windowWidth, sizes.contentMaxWidth)
  const [rawIndex, setRawIndex] = useState(0)
  const count = exercises.length
  const index = Math.min(rawIndex, Math.max(0, count - 1))

  const goTo = (target: number) => {
    scrollRef.current?.scrollTo({ x: target * width, animated: true })
    setRawIndex(target)
  }
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setRawIndex(pageIndex(event.nativeEvent.contentOffset.x, width, count))
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
