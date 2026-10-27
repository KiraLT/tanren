import {
  activeLocation,
  CATALOG,
  type CatalogExercise,
  CatalogId,
  findCatalogExercise,
  ProgramEnrollmentId,
  swapCandidates,
} from "@tanren/shared"
import { Array as Arr, Match, Option, Schema } from "effect"
import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"
import { SwapList } from "../../src/components/programs/SwapList"
import { swappedTo } from "../../src/components/programs/swapRows"
import { useGoBack } from "../../src/components/programs/useGoBack"
import { useSwap } from "../../src/components/programs/useSwap"
import { useProfileState } from "../../src/hooks/useProfile"
import { usePrograms } from "../../src/player/usePrograms"
import { AppBar, Banner, EmptyState, IconButton, Page, Skeleton, Text } from "../../src/ui"

const param = (raw: string | ReadonlyArray<string> | undefined): Option.Option<string> =>
  typeof raw === "string" ? Option.some(raw) : Option.none()

interface SheetProps {
  readonly enrollmentId: ProgramEnrollmentId
  readonly from: CatalogId
  readonly original: CatalogExercise
}

function Sheet({ enrollmentId, from, original }: SheetProps) {
  const back = useGoBack("/train?view=programs")
  const { state } = usePrograms()
  const profile = useProfileState()
  const { choose, busy, error } = useSwap()
  const swaps = useMemo(
    () =>
      state._tag === "Ready"
        ? Option.map(
            Arr.findFirst(state.active, (entry) => entry.enrollment.id === enrollmentId),
            (entry) => entry.enrollment.swaps,
          )
        : Option.none(),
    [state, enrollmentId],
  )
  const candidates = useMemo(
    () =>
      profile._tag === "Loaded"
        ? Option.some(
            swapCandidates(
              original,
              CATALOG,
              // `None` = no active location: nothing is filtered (programs-mcp.md §1).
              Option.map(Option.flatMap(profile.profile, activeLocation), (l) => l.equipment),
            ),
          )
        : Option.none(),
    [profile, original],
  )
  const pick = (to: Option.Option<CatalogId>) =>
    choose(enrollmentId, from, to).then((saved) => {
      if (saved) {
        back()
      }
    })
  const header = (
    <AppBar
      title="Swap exercise"
      leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
    />
  )
  return (
    <Page header={header} scroll>
      <Text tone="muted">{`Instead of ${original.name}, for the rest of this program.`}</Text>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => <Banner tone="danger" title="Could not swap" body={message} />,
      })}
      {Match.value(state).pipe(
        Match.tag("Failed", ({ message }) => (
          <Banner tone="danger" title="Could not load the program" body={message} />
        )),
        Match.orElse(() =>
          Option.match(Option.all({ swaps, candidates }), {
            onNone: () =>
              state._tag === "Ready" && profile._tag === "Loaded" ? (
                <Banner
                  tone="danger"
                  title="Could not load the swap"
                  body="This workout is not available. Start it from Train → Programs."
                />
              ) : (
                <Skeleton width="100%" height={240} />
              ),
            onSome: (ready) =>
              Arr.isReadonlyArrayEmpty(ready.candidates) ? (
                <EmptyState
                  icon="search"
                  headingLevel={2}
                  title="No similar exercise"
                  body="Nothing else here works the same muscles with the equipment at your active location."
                />
              ) : (
                <SwapList
                  original={original}
                  candidates={ready.candidates}
                  current={swappedTo(ready.swaps, from)}
                  busy={busy}
                  onChoose={(entry) => pick(Option.some(entry.catalogId))}
                  onRevert={() => pick(Option.none())}
                />
              ),
          }),
        ),
      )}
    </Page>
  )
}

export default function SwapScreen() {
  const back = useGoBack("/train?view=programs")
  const { enrollmentId, from } = useLocalSearchParams<{
    enrollmentId?: string | string[]
    from?: string | string[]
  }>()
  const parsed = Option.all({
    enrollmentId: Option.flatMap(
      param(enrollmentId),
      Schema.decodeUnknownOption(ProgramEnrollmentId),
    ),
    from: Option.flatMap(param(from), Schema.decodeUnknownOption(CatalogId)),
  })
  const found = Option.flatMap(parsed, ({ enrollmentId: id, from: catalogId }) =>
    Option.map(findCatalogExercise(catalogId), (original) => ({ id, catalogId, original })),
  )
  return Option.match(found, {
    onSome: ({ id, catalogId, original }) => (
      <Sheet enrollmentId={id} from={catalogId} original={original} />
    ),
    onNone: () => (
      <Page
        header={
          <AppBar
            title="Swap exercise"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        <EmptyState
          icon="warning"
          headingLevel={2}
          title="Nothing to swap"
          body="Open this from an exercise in the workout player."
        />
      </Page>
    ),
  })
}
