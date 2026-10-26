import { CORE30 } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useKeepAwake } from "expo-keep-awake"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { type PlayerSession, usePlayer } from "../../src/hooks/usePlayer"
import { ExerciseIllustration } from "../../src/library/ExerciseIllustration"
import { CompletionSheet, PlayerView } from "../../src/player/components/PlayerView"
import { approxMinutes } from "../../src/player/components/ProgramHome"
import { isRunning } from "../../src/player/cues"
import { dayFraction, eyebrowLabel, segmentsFilled } from "../../src/player/playerHeader"
import { progress } from "../../src/player/playerMachine"
import { useProgramDay } from "../../src/player/useProgramDay"
import {
  AppBar,
  Banner,
  Button,
  EmptyState,
  IconButton,
  Page,
  SegmentBar,
  Skeleton,
  sizes,
  space,
  Text,
  useBreakpoint,
} from "../../src/ui"

/** Core 30's first exercise stands for the program on the desktop empty state. */
const PROGRAM_ART = Option.flatMap(Arr.head(CORE30.days), (day) =>
  Option.map(Arr.head(day.items), (item) => item.catalogId),
)

/**
 * Desktop empty state (UI-Pdesktop r3): illustration 176, title, body and one primary `xl` button
 * as wide as the player ring (280). Phone and tablet keep `EmptyState` unchanged.
 */
function NoWorkoutDesktop({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: space.md,
        padding: space.xl,
        minHeight: sizes.illustrationXl * 2,
      }}
    >
      <ExerciseIllustration catalogId={PROGRAM_ART} size={sizes.illustrationLg} />
      <Text variant="headline" accessibilityRole="header" style={{ textAlign: "center" }}>
        No workout today
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        Enrol in a program on the Programs tab.
      </Text>
      <Button
        label="Open Programs"
        variant="primary"
        size="xl"
        onPress={onOpen}
        style={{ width: sizes.ringXl, marginTop: space.md }}
      />
    </View>
  )
}

/** Mounted only while the countdown runs, so the screen may sleep when paused or done. */
function KeepAwake() {
  useKeepAwake()
  return null
}

function Player({
  session,
  onClose,
}: {
  readonly session: PlayerSession
  readonly onClose: () => void
}) {
  const { run, remainingMs, send, completion, retry } = usePlayer(session)
  const { player } = run
  // "Start" on the Programs tab already asked for the run: begin at once (`start` is a no-op later).
  useEffect(() => send("start"), [send])
  const position = progress(session.day, player)
  const playing = completion._tag === "None" && player._tag !== "Idle"
  const phone = useBreakpoint() === "phone"
  const header = (
    <AppBar
      title={session.day.title}
      nav={false}
      leading={<IconButton icon="close" accessibilityLabel="Close player" onPress={onClose} />}
      {...Option.match(position, {
        onNone: () => ({}),
        onSome: (p) => ({
          // Phone: text only. The 20 px day ring is empty for the first exercise and repeats
          // what "Round x/y · Exercise x/y" and the segment bar already say.
          eyebrow: phone
            ? { label: eyebrowLabel(p) }
            : { label: eyebrowLabel(p), progress: dayFraction(p) },
          trailing: (
            <SegmentBar
              total={p.items}
              filled={segmentsFilled(p.item, p.items)}
              accessibilityLabel={`Exercise ${p.item} of ${p.items}`}
            />
          ),
        }),
      })}
    />
  )
  return (
    // While playing, `PlayerView` owns the scrolling (it fills the viewport on phone).
    <Page header={header} scroll={!playing}>
      {isRunning(player) ? <KeepAwake /> : null}
      {Match.value(completion).pipe(
        Match.tag("None", () =>
          player._tag === "Idle" ? (
            <View style={{ gap: space.lg }}>
              <Text variant="title">{session.day.title}</Text>
              <Text tone="muted">{`${session.day.rounds} rounds · ${approxMinutes(session.day)}`}</Text>
              <Button
                label="Go"
                accessibilityLabel="Start workout"
                icon="play"
                variant="primary"
                size="lg"
                onPress={() => send("start")}
              />
            </View>
          ) : (
            <PlayerView day={session.day} state={player} remainingMs={remainingMs} send={send} />
          ),
        ),
        Match.orElse((done) => (
          <CompletionSheet completion={done} onClose={onClose} onRetry={retry} />
        )),
      )}
    </Page>
  )
}

export default function PlayScreen() {
  const router = useRouter()
  const { state } = useProgramDay()
  const desktop = useBreakpoint() === "desktop"
  const close = () => (router.canGoBack() ? router.back() : router.replace("/programs"))
  // Latch the first loaded day: completing it bumps `currentDay`, which must not swap the player.
  const [session, setSession] = useState<Option.Option<PlayerSession>>(Option.none())
  useEffect(() => {
    if (Option.isNone(session) && state._tag === "Ready" && Option.isSome(state.day)) {
      setSession(
        Option.some({
          enrollmentId: state.enrollment.id,
          dayNumber: state.day.value.dayNumber,
          day: state.day.value,
        }),
      )
    }
  }, [session, state])

  const header = (
    <AppBar
      title="Workout"
      nav={false}
      leading={<IconButton icon="close" accessibilityLabel="Close player" onPress={close} />}
    />
  )

  return Option.match(session, {
    onSome: (s) => <Player session={s} onClose={close} />,
    onNone: () => (
      <Page header={header} scroll>
        {Match.value(state).pipe(
          Match.tag("Loading", () => <Skeleton width="100%" height={320} />),
          Match.tag("Failed", ({ message }) => (
            <Banner tone="danger" title="Could not load the workout" body={message} />
          )),
          Match.orElse(() =>
            desktop ? (
              <NoWorkoutDesktop onOpen={() => router.replace("/programs")} />
            ) : (
              <EmptyState title="No workout today" body="Enrol in a program on the Programs tab." />
            ),
          ),
        )}
      </Page>
    ),
  })
}
