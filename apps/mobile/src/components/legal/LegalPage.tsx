import { type Href, Link, useRouter } from "expo-router"
import Head from "expo-router/head"
import { Pressable, View, type ViewStyle } from "react-native"
import {
  AppBar,
  IconButton,
  Page,
  rhythm,
  sizes,
  space,
  Text,
  type,
  usePressableInteraction,
  useTheme,
} from "../../ui"
import {
  CONTACT_EMAIL,
  emphasisRuns,
  LEGAL_PAGE,
  type LegalBlock,
  type LegalDoc,
  type LegalSection,
} from "./legalCopy"

/** The AppBar title of a legal page: the brand, since the document title is the body heading. */
const BRAND = "Tanren"

/** Width of the "•" column of a bullet row (design §3). */
const BULLET_WIDTH = 16

/** Body text with `**bold**` leads rendered as strong runs. */
function Runs({ text }: { readonly text: string }) {
  return (
    <>
      {emphasisRuns(text).map((run, index) =>
        run.strong ? (
          <Text key={index} variant="headline">
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </>
  )
}

function Block({ block }: { readonly block: LegalBlock }) {
  return block._tag === "p" ? (
    <Text variant="body">
      <Runs text={block.text} />
    </Text>
  ) : (
    <View style={bullets}>
      {block.items.map((item) => (
        <View key={item} style={bulletRow}>
          <Text variant="body" style={{ width: BULLET_WIDTH }}>
            •
          </Text>
          <Text variant="body" style={{ flex: 1 }}>
            <Runs text={item} />
          </Text>
        </View>
      ))}
    </View>
  )
}

function Section({ section }: { readonly section: LegalSection }) {
  return (
    // `nativeID` becomes the DOM id on web (react-native-web createDOMProps), so `/privacy#deletion` anchors.
    <View nativeID={section.id} style={sectionStyle}>
      <Text variant="title2" accessibilityRole="header">
        {section.heading}
      </Text>
      <View style={blocksStyle}>
        {section.blocks.map((block) => (
          <Block key={block._tag === "p" ? block.text : block.items.join("|")} block={block} />
        ))}
      </View>
    </View>
  )
}

/** A caption-sized link to an in-app route: real anchor on web, hover underline, focus ring. */
export function LegalLink({ label, href }: { readonly label: string; readonly href: Href }) {
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        {...handlers}
        // 44 px tap area (RNW ignores `hitSlop`); the text keeps its caption size.
        // One object, not an array: `Link asChild` rejects array styles on its child.
        style={{
          minHeight: sizes.tap,
          justifyContent: "center",
          paddingHorizontal: space.sm,
          ...focusStyle,
        }}
      >
        <Text
          variant="caption"
          tone="accent"
          style={{ textDecorationLine: hovered ? "underline" : "none" }}
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  )
}

/** Inline link inside a caption sentence (sign-in agreement): accent, always underlined. */
export function InlineLegalLink({
  label,
  href,
}: {
  readonly label: string
  readonly href: "/terms" | "/privacy"
}) {
  return <InlineAnchor label={label} href={href} />
}

/** A real anchor on web (`Link` is a `Text` with an href, so it nests in a caption sentence). */
function InlineAnchor({ label, href }: { readonly label: string; readonly href: Href }) {
  const { colors } = useTheme()
  return (
    <Link
      href={href}
      style={{ ...type.caption, color: colors.accent, textDecorationLine: "underline" }}
    >
      {label}
    </Link>
  )
}

/** Privacy Policy / Terms of Service: static copy in the Forge page frame (design `legal.md` §3). */
export function LegalPage({ doc }: { readonly doc: LegalDoc }) {
  const router = useRouter()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/today"))
  const other = LEGAL_PAGE.other[doc.slug]
  return (
    <>
      <Head>
        <title>{LEGAL_PAGE.documentTitle(doc)}</title>
      </Head>
      <Page
        scroll
        header={
          // A document page, not an app screen: back control and the brand only, no app nav.
          <AppBar
            title={BRAND}
            nav={false}
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
        sectionGap={rhythm.groupToLabel}
      >
        <View>
          <Text variant="title" accessibilityRole="header">
            {doc.title}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
            {LEGAL_PAGE.updated(doc.updated)}
          </Text>
        </View>
        {doc.sections.map((section) => (
          <Section key={section.id} section={section} />
        ))}
        <View style={footer}>
          <Text variant="caption" tone="muted">
            {"Questions? "}
            <InlineAnchor label={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
          </Text>
          {/* The link pads 8 px for its 44 px tap area: pull it back so the text aligns with the column. */}
          <View style={{ alignSelf: "flex-start", marginLeft: -space.sm, marginTop: -space.sm }}>
            <LegalLink label={other.label} href={other.href} />
          </View>
        </View>
      </Page>
    </>
  )
}

/** Heading → first block 8 (`rhythm.labelToGroup`), block → block 12 (design §3). */
const sectionStyle: ViewStyle = { gap: rhythm.labelToGroup }
const blocksStyle: ViewStyle = { gap: space.md }
const bullets: ViewStyle = { gap: space.sm }
const bulletRow: ViewStyle = { flexDirection: "row", gap: space.sm }
const footer: ViewStyle = { gap: space.sm }
