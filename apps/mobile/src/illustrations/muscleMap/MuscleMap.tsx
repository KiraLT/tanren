import type { MuscleGroup } from "@tanren/shared"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { useTheme } from "../../ui"
import {
  DETAILS,
  MUSCLE_MAP_STYLE,
  PANEL_WIDTH,
  PANELS,
  type Panel,
  REGIONS,
  SILHOUETTE,
  VIEW_BOX_SIZE,
} from "./body"
import { muscleMapLabel, type RegionTone, regionTone } from "./regions"

export interface MuscleMapProps {
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
  /**
   * Height in px. `both` (default) is square: front and back figures side by side. A single view
   * is cropped to the figure and drawn at the same height, about 0.38 × `size` wide (the figure
   * is then ~1.7× larger than in `both`).
   */
  readonly size: number
  readonly view?: "both" | Panel
}

/** Viewbox crop of one panel: the figure spans x 30–170 and y 12–392 of its 200 × 400 panel. */
const CROP = { x: 26, y: 8, width: 148, height: 388 } as const

interface Frame {
  readonly viewBox: string
  readonly width: number
  /** viewBox units per screen px (stroke widths are authored in px). */
  readonly scale: number
}

const frameFor = (view: "both" | Panel, size: number): Frame =>
  view === "both"
    ? { viewBox: `0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`, width: size, scale: VIEW_BOX_SIZE / size }
    : {
        viewBox: `${CROP.x + (view === "front" ? 0 : PANEL_WIDTH)} ${CROP.y} ${CROP.width} ${CROP.height}`,
        width: (size * CROP.width) / CROP.height,
        scale: CROP.height / size,
      }

const OPACITY: Readonly<Record<RegionTone, number>> = {
  primary: MUSCLE_MAP_STYLE.primaryOpacity,
  secondary: MUSCLE_MAP_STYLE.secondaryOpacity,
  idle: 1,
}

/** Front and back silhouettes; primary muscles in the accent, secondary in a light accent tint. */
export function MuscleMap({ primary, secondary, size, view = "both" }: MuscleMapProps) {
  const { colors } = useTheme()
  const tone = regionTone(primary, secondary)
  const frame = frameFor(view, size)
  const scale = frame.scale
  const seamWidth = MUSCLE_MAP_STYLE.seamWidth * scale
  const panels = view === "both" ? PANELS : [view]
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={muscleMapLabel(primary, secondary)}
      style={{ width: frame.width, height: size, alignSelf: "center" }}
    >
      <Svg width={frame.width} height={size} viewBox={frame.viewBox}>
        {panels.map((panel) => [
          ...SILHOUETTE[panel].fill.map((d) => (
            <Path key={`${panel}-fill-${d}`} d={d} fill={colors.surface} />
          )),
          ...DETAILS[panel].map((d) => (
            <Path
              key={`${panel}-detail-${d}`}
              d={d}
              fill={colors.border}
              stroke={colors.bg}
              strokeWidth={seamWidth}
              strokeLinejoin="round"
            />
          )),
          ...REGIONS.filter((region) => region.panel === panel).flatMap((region) => {
            const regionToneValue = tone(region.id)
            return regionToneValue === "idle" && region.idle === "hidden"
              ? []
              : region.paths.map((d) => (
                  <Path
                    key={`${region.id}-${d}`}
                    d={d}
                    fill={regionToneValue === "idle" ? colors.border : colors.accent}
                    fillOpacity={OPACITY[regionToneValue]}
                    stroke={colors.bg}
                    strokeWidth={seamWidth}
                    strokeLinejoin="round"
                  />
                ))
          }),
          ...SILHOUETTE[panel].outline.map((d) => (
            <Path
              key={`${panel}-outline-${d}`}
              d={d}
              fill="none"
              stroke={colors.textMuted}
              strokeWidth={MUSCLE_MAP_STYLE.outlineWidth * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )),
        ])}
      </Svg>
    </View>
  )
}
