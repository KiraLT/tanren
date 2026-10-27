import { Match } from "effect"
import { type Href, useRouter } from "expo-router"
import { View } from "react-native"
import { SettingsSection } from "../../src/components/settings/SettingsSection"
import { ThisWeekCard } from "../../src/components/week/ThisWeekCard"
import { type AccountState, useAccount } from "../../src/hooks/useAccount"
import {
  AppBar,
  Columns,
  IconButton,
  type IconName,
  ListRow,
  Page,
  rhythm,
  useBreakpoint,
} from "../../src/ui"

interface HubRow {
  readonly title: string
  readonly subtitle?: string
  readonly icon: IconName
  readonly href: Href
}

interface HubGroup {
  readonly title: string
  readonly rows: ReadonlyArray<HubRow>
}

/** You (ADR-0029, navigation-v2.md §2 merge table): everything about the person, as rows. */
const INSIGHTS: HubGroup = {
  title: "Insights",
  rows: [
    { title: "Progress", subtitle: "Best sets, 1RM trends", icon: "chart", href: "/progress" },
    { title: "Health", subtitle: "Calories, steps, protein", icon: "zap", href: "/health" },
    {
      title: "Weekly review",
      subtitle: "Your week against your goal",
      icon: "calendar",
      href: "/review",
    },
  ],
}

const SETUP: HubGroup = {
  title: "Setup",
  rows: [
    { title: "Nutrition goals", icon: "fork", href: "/settings/nutrition" },
    {
      title: "Integrations",
      subtitle: "Strava, Garmin",
      icon: "repeat",
      href: "/settings/integrations",
    },
    {
      title: "Settings",
      subtitle: "Equipment, appearance, data",
      icon: "settings",
      href: "/settings",
    },
  ],
}

const ABOUT: HubGroup = {
  title: "About",
  rows: [
    { title: "Privacy", icon: "info", href: "/privacy" },
    { title: "Terms", icon: "book", href: "/terms" },
  ],
}

/** The account row's title: the signed-in email when the worker answers, else the state. */
const accountTitle = (account: AccountState): string =>
  Match.value(account).pipe(
    Match.tagsExhaustive({
      Loading: () => "Your account",
      SignedOut: () => "Not signed in",
      SignedIn: ({ email }) => email,
      SignedInOffline: () => "Signed in (offline)",
    }),
  )

export default function YouScreen() {
  const router = useRouter()
  const { account } = useAccount()
  // One week read per screen: the tiles card below desktop, the rings card on top of Setup at desktop.
  const desktop = useBreakpoint() === "desktop"
  const open = (href: Href) => () => router.navigate(href)
  const group = ({ title, rows }: HubGroup) => (
    <SettingsSection title={title}>
      {rows.map((row) => (
        <ListRow
          key={row.title}
          icon={row.icon}
          title={row.title}
          {...(row.subtitle === undefined ? {} : { subtitle: row.subtitle })}
          chevron
          onPress={open(row.href)}
        />
      ))}
    </SettingsSection>
  )
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title="You"
          trailing={
            <IconButton icon="settings" accessibilityLabel="Settings" onPress={open("/settings")} />
          }
        />
      }
    >
      <Columns
        split="6/6"
        main={
          <View style={{ gap: rhythm.groupToLabel }}>
            {desktop ? null : <ThisWeekCard />}
            <SettingsSection title="Account">
              <ListRow
                icon="user"
                title={accountTitle(account)}
                subtitle="Account, sign-out, connected AI"
                chevron
                accessibilityLabel="Account"
                onPress={open("/settings")}
              />
            </SettingsSection>
            {group(INSIGHTS)}
            {/* At desktop About balances the columns against the week card on top of Setup. */}
            {desktop ? group(ABOUT) : null}
          </View>
        }
        side={
          <View style={{ gap: rhythm.groupToLabel }}>
            {desktop ? <ThisWeekCard variant="rings" /> : null}
            {group(SETUP)}
            {desktop ? null : group(ABOUT)}
          </View>
        }
      />
    </Page>
  )
}
