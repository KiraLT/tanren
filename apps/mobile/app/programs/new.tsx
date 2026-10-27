import { ProgramId } from "@tanren/shared"
import { Array as Arr, Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useRef } from "react"
import { View } from "react-native"
import { droppedDays } from "../../src/components/programs/newProgram"
import { SectionLabel } from "../../src/components/programs/ProgramFields"
import { useGoBack } from "../../src/components/programs/useGoBack"
import { useCreateProgram } from "../../src/components/programs/useProgramEditor"
import { summarySubtitle } from "../../src/player/programList"
import { usePrograms } from "../../src/player/usePrograms"
import {
  AppBar,
  Banner,
  Card,
  IconButton,
  ListGroup,
  ListRow,
  Page,
  radius,
  rhythm,
  Skeleton,
  space,
  Text,
} from "../../src/ui"

const MAX_DAYS_NOTE = "copies the first 60 days"

function StartSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading programs" style={{ gap: space.lg }}>
      <Skeleton width="100%" height={80} radius={radius.lg} />
      <Skeleton width="100%" height={220} radius={radius.lg} />
    </View>
  )
}

/**
 * Creates a blank or copied program and opens its editor in place of this screen. With `?from=`
 * the copy starts at once (no second tap); a ref flag keeps a re-run of the effect from copying twice.
 */
function useStartProgram(from: Option.Option<ProgramId>) {
  const router = useRouter()
  const { create, busy, error } = useCreateProgram()
  const open = useCallback(
    (source: Option.Option<ProgramId>) =>
      create(source).then((created) => {
        if (Option.isSome(created)) {
          router.replace({
            pathname: "/programs/edit/[programId]",
            params: { programId: created.value },
          })
        }
      }),
    [create, router],
  )
  const started = useRef(false)
  useEffect(() => {
    if (Option.isNone(from) || started.current) {
      return
    }
    // biome-ignore lint/plugin/noMutation: a ref flag, not an array mutation
    started.current = true
    open(from)
  }, [from, open])
  return { open, busy, error }
}

export default function NewProgramScreen() {
  const back = useGoBack("/programs")
  const params = useLocalSearchParams<{ from?: string }>()
  const from = Option.flatMap(Option.fromNullishOr(params.from), (raw) =>
    Schema.decodeUnknownOption(ProgramId)(raw),
  )
  const { state } = usePrograms()
  const { open, busy, error: failure } = useStartProgram(from)
  return (
    <Page
      scroll
      header={
        <AppBar
          title="New program"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Option.match(failure, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not create the program" body={message} />
        ),
      })}
      {Option.isSome(from) ? (
        <StartSkeleton />
      ) : (
        Match.value(state).pipe(
          Match.tagsExhaustive({
            Loading: () => <StartSkeleton />,
            Failed: ({ message }) => (
              <Banner tone="danger" title="Could not load programs" body={message} />
            ),
            Ready: ({ summaries }) => (
              <View style={{ gap: rhythm.groupToLabel }}>
                <Card
                  accessibilityLabel="Blank program"
                  onPress={() => {
                    if (!busy) {
                      open(Option.none())
                    }
                  }}
                >
                  <View style={{ gap: space.xs }}>
                    <Text variant="headline">Blank program</Text>
                    <Text variant="subhead" tone="muted">
                      One day with one exercise to start from, three days a week.
                    </Text>
                  </View>
                </Card>
                <View style={{ gap: rhythm.labelToGroup }}>
                  <SectionLabel>Duplicate a program</SectionLabel>
                  <ListGroup>
                    {Arr.map(summaries, (summary) => (
                      <ListRow
                        key={summary.programId}
                        title={summary.title}
                        subtitle={
                          droppedDays(summary.days) > 0
                            ? `${summarySubtitle(summary)} · ${MAX_DAYS_NOTE}`
                            : summarySubtitle(summary)
                        }
                        accessibilityLabel={`Duplicate ${summary.title}`}
                        chevron
                        disabled={busy}
                        onPress={() => open(Option.some(summary.programId))}
                      />
                    ))}
                  </ListGroup>
                </View>
              </View>
            ),
          }),
        )
      )}
    </Page>
  )
}
