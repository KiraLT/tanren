import type { MuscleGroup } from "@tanren/shared"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { useTheme } from "../../ui"
import { DETAILS, MUSCLE_MAP_STYLE, PANELS, REGIONS, SILHOUETTE, VIEW_BOX_SIZE } from "./body"
import { muscleMapLabel, type RegionTone, regionTone } from "./regions"

export interface MuscleMapProps {
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
  /** Width and height in px (the map is square: front and back figures side by side). */
  readonly size: number
}

const OPACITY: Readonly<Record<RegionTone, number>> = {
  primary: MUSCLE_MAP_STYLE.primaryOpacity,
  secondary: MUSCLE_MAP_STYLE.secondaryOpacity,
  idle: 1,
}

/** Front and back silhouettes; primary muscles in the accent, secondary in a light accent tint. */
export function MuscleMap({ primary, secondary, size }: MuscleMapProps) {
  const { colors } = useTheme()
  const tone = regionTone(primary, secondary)
  const scale = VIEW_BOX_SIZE / size
  const seamWidth = MUSCLE_MAP_STYLE.seamWidth * scale
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={muscleMapLabel(primary, secondary)}
      style={{ width: size, height: size, alignSelf: "center" }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}>
        {PANELS.map((panel) => [
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
