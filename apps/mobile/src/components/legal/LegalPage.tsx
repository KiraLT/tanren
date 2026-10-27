import { type Href, Link, useRouter } from "expo-router"
import Head from "expo-router/head"
import { Linking, Pressable, View, type ViewStyle } from "react-native"
import { AppBar, IconButton, Page, rhythm, space, Text, usePressableInteraction } from "../../ui"
import {
  CONTACT_EMAIL,
  emphasisRuns,
  LEGAL_PAGE,
  type LegalBlock,
  type LegalDoc,
  type LegalSection,
} from "./legalCopy"

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
      {section.blocks.map((block) => (
        <Block key={block._tag === "p" ? block.text : block.items.join("|")} block={block} />
      ))}
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
        hitSlop={8}
        // One object, not an array: `Link asChild` rejects array styles on its child.
        style={{ ...focusStyle }}
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
  const router = useRouter()
  // biome-ignore lint/plugin/noMutation: expo-router navigation, not Array.push
  const open = () => router.push(href)
  return (
    <Text
      variant="caption"
      tone="accent"
      accessibilityRole="link"
      onPress={open}
      style={{ textDecorationLine: "underline" }}
    >
      {label}
    </Text>
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
          <AppBar
            title={doc.title}
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
            <Text
              variant="caption"
              tone="accent"
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(`mailto:${CONTACT_EMAIL}`)
              }}
              style={{ textDecorationLine: "underline" }}
            >
              {CONTACT_EMAIL}
            </Text>
          </Text>
          <LegalLink label={other.label} href={other.href} />
        </View>
      </Page>
    </>
  )
}

const sectionStyle: ViewStyle = { gap: space.md }
const bullets: ViewStyle = { gap: space.sm }
const bulletRow: ViewStyle = { flexDirection: "row", gap: space.sm }
const footer: ViewStyle = { gap: space.sm }
