import { Array as Arr, Option, pipe } from "effect"

/** Pure geometry for the two Progress charts (design v2-extras §1.3); drawing is in the components. */
export interface ChartSize {
  readonly width: number
  readonly height: number
}

export interface BarRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface SparklineShape {
  /** SVG `points` strings, one per run of consecutive weeks with sets (at least two points each). */
  readonly segments: ReadonlyArray<string>
  /** Every week with a set, so an isolated week still shows. */
  readonly dots: ReadonlyArray<Point>
}

/** Height (px) of an empty bar: a flat baseline stub, so zero weeks stay visible. */
export const BASELINE = 2

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * One bar per value, bottom aligned and scaled to the peak. Zero (or negative) values and an
 * all-zero series draw the `BASELINE` stub; positive values are never shorter than it.
 */
export const barRects = (
  values: ReadonlyArray<number>,
  size: ChartSize,
  gap: number,
  maxWidth: number = Number.POSITIVE_INFINITY,
): ReadonlyArray<BarRect> => {
  const count = values.length
  const slotWidth = Math.max(0, (size.width - gap * (count - 1)) / count)
  const barWidth = Math.min(slotWidth, maxWidth)
  const peak = Arr.reduce(values, 0, (max, value) => Math.max(max, value))
  return Arr.map(values, (value, index) => {
    const height =
      peak <= 0 || value <= 0 ? BASELINE : Math.max(BASELINE, (value / peak) * size.height)
    return {
      // a capped bar sits in the middle of its slot; the slot pitch stays `slotWidth + gap`
      x: index * (slotWidth + gap) + (slotWidth - barWidth) / 2,
      y: size.height - height,
      width: barWidth,
      height,
    }
  })
}

/** SVG path of a bar with a rounded data end (top) and a square baseline end (design: 4 px). */
export const roundedTopBarPath = (rect: BarRect, radius: number): string => {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height))
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return [
    `M${rect.x},${bottom}`,
    `L${rect.x},${rect.y + r}`,
    `A${r},${r} 0 0 1 ${rect.x + r},${rect.y}`,
    `L${right - r},${rect.y}`,
    `A${r},${r} 0 0 1 ${right},${rect.y + r}`,
    `L${right},${bottom}`,
    "Z",
  ].join(" ")
}

/** x of `count` marks spread evenly between `pad` and `width - pad` (a lone mark is centred). */
export const columnCenters = (count: number, width: number, pad: number): ReadonlyArray<number> =>
  Arr.makeBy(count, (index) =>
    count <= 1 ? width / 2 : pad + (index * (width - 2 * pad)) / (count - 1),
  )

/** Left edge of a tooltip centred on `center`, kept inside `[0, chartWidth]`. */
export const tooltipLeft = (center: number, tooltipWidth: number, chartWidth: number): number =>
  Math.max(0, Math.min(center - tooltipWidth / 2, chartWidth - tooltipWidth))

/**
 * Hover band of the mark at `centers[index]`: from the midpoint to its left neighbour (or 0) to
 * the midpoint to its right neighbour (or `chartWidth`). The bands tile the plot, so a hit target
 * is always larger than the mark.
 */
export const hoverBand = (
  centers: ReadonlyArray<number>,
  index: number,
  chartWidth: number,
): { readonly x: number; readonly width: number } => {
  const center = centers[index] ?? 0
  const left = centers[index - 1]
  const right = centers[index + 1]
  const start = left === undefined ? 0 : (left + center) / 2
  const end = right === undefined ? chartWidth : (center + right) / 2
  return { x: start, width: end - start }
}

interface RunState {
  readonly runs: ReadonlyArray<ReadonlyArray<Point>>
  /** The previous week had no set. */
  readonly gap: boolean
}

const noRuns: RunState = { runs: [], gap: false }

/** Appends a point to the open run, or starts a new run after a gap. */
const extendRuns = (
  runs: ReadonlyArray<ReadonlyArray<Point>>,
  point: Option.Option<Point>,
  previousWasGap: boolean,
): ReadonlyArray<ReadonlyArray<Point>> =>
  Option.match(point, {
    onNone: () => runs,
    onSome: (next) => {
      const last = Arr.last(runs)
      return previousWasGap || Option.isNone(last)
        ? [...runs, [next]]
        : [...Arr.dropRight(runs, 1), [...last.value, next]]
    },
  })

/**
 * The trend line: x spread evenly over the weeks, y scaled between the series min and max (a flat
 * series sits on the middle line). `None` weeks break the line instead of being interpolated.
 */
export const sparklineShape = (
  values: ReadonlyArray<Option.Option<number>>,
  size: ChartSize,
  pad: number,
): SparklineShape => {
  const defined = Arr.getSomes(values)
  const min = Arr.reduce(defined, Number.POSITIVE_INFINITY, (low, value) => Math.min(low, value))
  const max = Arr.reduce(defined, Number.NEGATIVE_INFINITY, (high, value) => Math.max(high, value))
  const span = max - min
  const innerWidth = size.width - 2 * pad
  const innerHeight = size.height - 2 * pad
  const toPoint = (value: number, index: number): Point => ({
    x: round1(
      values.length <= 1 ? size.width / 2 : pad + (index * innerWidth) / (values.length - 1),
    ),
    y: round1(span <= 0 ? size.height / 2 : pad + (1 - (value - min) / span) * innerHeight),
  })
  const points = Arr.map(values, (value, index) => Option.map(value, (v) => toPoint(v, index)))
  const runs = Arr.reduce(
    points,
    noRuns,
    (state, point): RunState => ({
      runs: extendRuns(state.runs, point, state.gap),
      gap: Option.isNone(point),
    }),
  ).runs
  return {
    segments: pipe(
      runs,
      Arr.filter((run) => run.length >= 2),
      Arr.map((run) => run.map((point) => `${point.x},${point.y}`).join(" ")),
    ),
    dots: Arr.getSomes(points),
  }
}
