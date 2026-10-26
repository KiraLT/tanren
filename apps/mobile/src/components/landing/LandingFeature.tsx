import { Option } from "effect"
import { Image, type ImageSourcePropType, type StyleProp, View, type ViewStyle } from "react-native"
import { Card, Icon, radius, sizes, space, Text, useTheme } from "../../ui"
import type { LandingFeatureCopy } from "./landingCopy"

export interface LandingImageSlotProps {
  readonly source: Option.Option<ImageSourcePropType>
  readonly style: StyleProp<ViewStyle>
  /** Inside a `Card` (itself `surface`) the tile steps up to `surfaceRaised`, or it would vanish. */
  readonly onCard?: boolean
}

/**
 * A decorative illustration slot (design `landing.md` §4): the webp when there is one, otherwise a
 * `surface` tile of the same size so the layout never moves when LAND-2 wires the files.
 */
export function LandingImageSlot({ source, style, onCard = false }: LandingImageSlotProps) {
  const { colors } = useTheme()
  return Option.match(source, {
    onNone: () => (
      <View
        testID="landing-image-placeholder"
        style={[
          {
            backgroundColor: onCard ? colors.surfaceRaised : colors.surface,
            borderRadius: radius.lg,
          },
          style,
        ]}
      />
    ),
    onSome: (image) => (
      <View style={style}>
        <Image
          source={image}
          resizeMode="contain"
          accessible={false}
          accessibilityIgnoresInvertColors
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    ),
  })
}

export interface LandingFeatureProps {
  readonly feature: LandingFeatureCopy
  readonly image: Option.Option<ImageSourcePropType>
  /** Desktop cards carry the 176 illustration and a 16 gap; phone and tablet 104 and 12 (§3). */
  readonly wide: boolean
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Phone/tablet card illustration (LAND-3): at `illustrationMd` 104 the figures read at ~60 %; 120
 * leaves a 198 text column at 390 (358 − 2·16 padding − 120 − 8 gap). No ramp step exists for it.
 */
const PHONE_IMAGE = 120

/** One feature card: illustration on the left, icon + title and the muted body on the right. */
export function LandingFeature({ feature, image, wide, style }: LandingFeatureProps) {
  const { colors } = useTheme()
  const imageSize = wide ? sizes.illustrationLg : PHONE_IMAGE
  return (
    <Card style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: wide ? space.lg : space.sm }}>
        <LandingImageSlot source={image} onCard style={{ width: imageSize, height: imageSize }} />
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Icon name={feature.icon} size={sizes.iconSm} color={colors.accent} />
            <Text variant="headline" style={{ flexShrink: 1 }}>
              {feature.title}
            </Text>
          </View>
          <Text variant="subhead" tone="muted">
            {feature.body}
          </Text>
        </View>
      </View>
    </Card>
  )
}
