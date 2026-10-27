import { type ImportedActivity, ImportedActivityId } from "@tanren/shared"
import { DateTime, Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import {
  importedDetailStats,
  importedOn,
  importedStamp,
} from "../../../src/components/feed/importedText"
import { useImportedActivity } from "../../../src/hooks/useImportedActivity"
import {
  AppBar,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  StatRow,
  space,
  Text,
} from "../../../src/ui"

const NOT_FOUND = (
  <EmptyState
    icon="warning"
    title="Activity not found"
    body="It may have been removed from the provider."
  />
)

function DetailSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading activity" style={{ gap: space.lg }}>
      <Skeleton width="60%" height={22} />
      <Skeleton width="100%" height={360} radius={radius.lg} />
    </View>
  )
}

/**
 * Start, the five stats as a column of tiles on the bare page, and where the activity came from.
 * No wrapping `Card`: tiles are `surface` with no border, so inside a `surface` card they vanish.
 */
function ImportedStats({ activity }: { readonly activity: ImportedActivity }) {
  const zone = DateTime.zoneMakeLocal()
  return (
    <View style={{ gap: space.md }}>
      <Text variant="caption" tone="muted">
        {importedStamp(activity, zone)}
      </Text>
      <StatRow variant="tile" direction="column" items={importedDetailStats(activity)} />
      <Text variant="caption" tone="muted">
        {importedOn(activity, zone)}
      </Text>
    </View>
  )
}

function ImportedPage({
  id,
  back,
}: {
  readonly id: ImportedActivityId
  readonly back: () => void
}) {
  const state = useImportedActivity(id)
  const title = Match.value(state).pipe(
    Match.tag("Ready", ({ value }) =>
      Option.match(value, { onNone: () => "Activity", onSome: (a) => a.title }),
    ),
    Match.orElse(() => "Activity"),
  )
  // One 600 column at every width, like the session detail's non-wide states: a single card has
  // no second column to fill.
  return (
    <Page
      scroll
      header={
        <AppBar
          title={title}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <DetailSkeleton />,
          Failed: ({ message }) => (
            <EmptyState icon="warning" title="Could not load this activity" body={message} />
          ),
          Ready: ({ value }) =>
            Option.match(value, {
              onNone: () => NOT_FOUND,
              onSome: (activity) => <ImportedStats activity={activity} />,
            }),
        }),
      )}
    </Page>
  )
}

export default function ImportedActivityScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  // A direct load has no history to go back to: fall back to the feed.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/activity"))
  return Option.match(Schema.decodeUnknownOption(ImportedActivityId)(id), {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Activity"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        {NOT_FOUND}
      </Page>
    ),
    onSome: (valid) => <ImportedPage id={valid} back={back} />,
  })
}
