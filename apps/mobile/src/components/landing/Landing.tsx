import { useRouter } from "expo-router"
import { Fragment } from "react"
import { Image, type ImageStyle, View, type ViewStyle } from "react-native"
import { Button, Columns, Page, space, Text, useBreakpoint, useTheme } from "../../ui"
import { LegalLink } from "../legal/LegalPage"
import { LandingFeature, LandingImageSlot } from "./LandingFeature"
import { LANDING } from "./landingCopy"
import { LANDING_IMAGES } from "./landingImages"

/**
 * The W1 brush wordmark (LOGO-4, plan Amendment 15) heads the hero at 32 px high; the footer keeps the
 * standalone T mark. Width comes from the 1280 x 286 file's aspect.
 */
const WORDMARK_HEIGHT = 32
const WORDMARK_ASPECT = 1280 / 286

/** Desktop CTA width (design §3.2); phone and tablet buttons span the column. */
const CTA_MIN_WIDTH = 240

/** The hero illustration never grows past 480 (desktop side column, tablet cap; design §3). */
const HERO_MAX = 480

const CTA_A11Y_LABEL = "Sign in with a magic link"

const MARK = require("../../../assets/brand/mark.png")
const MARK_PAPER = require("../../../assets/brand/mark-paper.png")
const WORDMARK = require("../../../assets/brand/wordmark.png")
const WORDMARK_PAPER = require("../../../assets/brand/wordmark-paper.png")

/**
 * The signed-out web landing (ADR-0021, design `docs/design/landing.md`): `_layout.tsx` renders it
 * on every gated web route in place of the `/sign-in` redirect. No AppBar, no tab bar, no state.
 */
export function Landing() {
  const router = useRouter()
  const { scheme } = useTheme()
  const desktop = useBreakpoint() === "desktop"
  const mark = scheme === "dark" ? MARK : MARK_PAPER
  const toSignIn = () => router.replace("/sign-in")
  const ctaStyle: ViewStyle = desktop ? { alignSelf: "flex-start", minWidth: CTA_MIN_WIDTH } : {}

  const heroText = (
    <View style={{ gap: space.md }}>
      <Image
        source={scheme === "dark" ? WORDMARK : WORDMARK_PAPER}
        style={wordmarkHero}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityRole="image"
        accessibilityLabel="Tanren"
      />
      <Text variant="label" tone="muted">
        {LANDING.eyebrow}
      </Text>
      <Text variant="display" accessibilityRole="header">
        {LANDING.headline}
      </Text>
      <Text variant="subhead" tone="muted">
        {LANDING.promise}
      </Text>
      <View style={{ gap: space.sm }}>
        <Button
          label={LANDING.cta}
          accessibilityLabel={CTA_A11Y_LABEL}
          variant="primary"
          size="lg"
          onPress={toSignIn}
          style={ctaStyle}
        />
        <Text variant="caption" tone="muted" style={{ textAlign: desktop ? "left" : "center" }}>
          {LANDING.ctaNote}
        </Text>
      </View>
    </View>
  )
  const heroImage = <LandingImageSlot source={LANDING_IMAGES.hero} style={heroImageStyle} />

  const features = (
    <View
      style={
        desktop ? { flexDirection: "row", flexWrap: "wrap", gap: space.xl } : { gap: space.lg }
      }
    >
      {LANDING.features.map((feature) => (
        <LandingFeature
          key={feature.image}
          feature={feature}
          image={LANDING_IMAGES[feature.image]}
          wide={desktop}
          {...(desktop ? { style: { flexBasis: "48%", flexGrow: 1 } } : {})}
        />
      ))}
    </View>
  )

  return (
    <View testID="landing" style={{ flex: 1 }}>
      <Page scroll wide sectionGap={space.xl}>
        {desktop ? (
          <Columns
            split="6/6"
            main={
              // Centre the copy on the 480 figure instead of leaving the column's lower half empty.
              <View style={{ flex: 1, justifyContent: "center", minHeight: HERO_MAX }}>
                {heroText}
              </View>
            }
            side={heroImage}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {heroText}
            {heroImage}
          </View>
        )}
        {features}
        <View style={{ gap: space.sm, alignItems: desktop ? "center" : "stretch" }}>
          <Text variant="display" accessibilityRole="header" style={{ textAlign: "center" }}>
            {LANDING.closing}
          </Text>
          <Button
            label={LANDING.cta}
            accessibilityLabel={CTA_A11Y_LABEL}
            variant="primary"
            size="lg"
            onPress={toSignIn}
            {...(desktop ? { style: { minWidth: CTA_MIN_WIDTH } } : {})}
          />
          <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
            {LANDING.ctaNote}
          </Text>
        </View>
        <View style={{ alignItems: "center", gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Image
              source={mark}
              style={markFooter}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Text variant="caption" tone="muted">
              {`${LANDING.footer.name} · ${LANDING.footer.domain}`}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
            {LANDING.meaning}
          </Text>
          <Text
            testID="landing-operator"
            variant="caption"
            tone="muted"
            style={{ textAlign: "center" }}
          >
            {`${LANDING.footer.operator} · ${LANDING.footer.contact}`}
          </Text>
          <View
            testID="landing-legal-links"
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
          >
            {LANDING.footer.links.map((link, index) => (
              <Fragment key={link.href}>
                {index > 0 ? (
                  <Text variant="caption" tone="muted">
                    ·
                  </Text>
                ) : null}
                <LegalLink label={link.label} href={link.href} />
              </Fragment>
            ))}
          </View>
        </View>
      </Page>
    </View>
  )
}

/** Hero lockup 32 high; footer T mark 24 (transparent in both schemes since LOGO-4). */
const wordmarkHero: ImageStyle = {
  height: WORDMARK_HEIGHT,
  width: Math.round(WORDMARK_HEIGHT * WORDMARK_ASPECT),
}
const markFooter: ImageStyle = { width: 24, height: 24 }

const heroImageStyle: ViewStyle = {
  width: "100%",
  maxWidth: HERO_MAX,
  aspectRatio: 1,
  alignSelf: "center",
}
