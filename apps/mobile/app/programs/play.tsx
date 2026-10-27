import { CORE30, type ProgramDay } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useKeepAwake } from "expo-keep-awake"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { useNavGuard } from "../../src/components/programs/useGoBack"
import { type PlayerSession, usePlayer } from "../../src/hooks/usePlayer"
import { ExerciseIllustration } from "../../src/library/ExerciseIllustration"
import { CompletionSheet, PlayerView } from "../../src/player/components/PlayerView"
import { approxMinutes } from "../../src/player/components/ProgramHome"
import { isRunning } from "../../src/player/cues"
import { mergeDay } from "../../src/player/mergeDay"
import { dayFraction, eyebrowLabel, segmentsFilled } from "../../src/player/playerHeader"
import { progress } from "../../src/player/playerMachine"
import { usePrograms } from "../../src/player/usePrograms"
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

/** `?enrollmentId=` missing, unknown, paused or finished. */
const WORKOUT_NOT_FOUND = "This workout is not available. Start it from Train → Programs."

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
        Enrol in a program in Train → Programs.
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

interface Latched {
  readonly session: PlayerSession
  readonly original: ProgramDay
}

function Player({
  session,
  original,
  onClose,
}: {
  readonly session: PlayerSession
  /** The day as the program writes it: a swap is keyed by the original catalog id. */
  readonly original: ProgramDay
  readonly onClose: () => void
}) {
  const router = useRouter()
  const once = useNavGuard()
  const { run, remainingMs, send, adjust, completion, retry } = usePlayer(session)
  const { player } = run
  // "Start" on the Programs tab already asked for the run: begin at once (`start` is a no-op later).
  useEffect(() => send("start"), [send])
  const position = progress(session.day, player)
  /** The current exercise's original id; `None` before the first exercise and after the last. */
  const swapFrom = Option.flatMap(position, (p) =>
    Option.map(Arr.get(original.items, p.item - 1), (item) => item.catalogId),
  )
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
            <PlayerView
              day={session.day}
              state={player}
              remainingMs={remainingMs}
              send={send}
              draft={run.draft}
              onAdjust={adjust}
              {...Option.match(swapFrom, {
                onNone: () => ({}),
                onSome: (from) => ({
                  // Once per focus: a double tap must not stack two sheets.
                  onSwap: () =>
                    once(() =>
                      // biome-ignore lint/plugin/noMutation: Expo Router navigation, not an array push
                      router.push({
                        pathname: "/programs/swap",
                        params: { enrollmentId: session.enrollmentId, from },
                      }),
                    ),
                }),
              })}
            />
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
  const { state } = usePrograms()
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string | string[] }>()
  const desktop = useBreakpoint() === "desktop"
  const close = () => (router.canGoBack() ? router.back() : router.replace("/train?view=programs"))
  /** The `active` enrollment named by `?enrollmentId=`; a missing, unknown or paused one is `None`. */
  const target =
    state._tag === "Ready"
      ? Arr.findFirst(
          state.active,
          (entry) => entry.enrollment.id === enrollmentId && entry.enrollment.status === "active",
        )
      : Option.none()
  // Latch the first loaded day: completing it bumps `currentDay`, which must not swap the player.
  // `original` is that day without swaps (the swap sheet keys on it).
  const [latched, setLatched] = useState<Option.Option<Latched>>(Option.none())
  useEffect(() => {
    const day = Option.flatMap(target, (entry) => entry.day)
    if (Option.isNone(latched) && Option.isSome(target) && Option.isSome(day)) {
      const dayNumber = day.value.dayNumber
      setLatched(
        Option.some({
          session: { enrollmentId: target.value.enrollment.id, dayNumber, day: day.value },
          original: Option.getOrElse(
            Arr.findFirst(target.value.program.days, (d) => d.dayNumber === dayNumber),
            () => day.value,
          ),
        }),
      )
    }
  }, [latched, target])
  // After the swap sheet (any store write): fold the re-read day into the running session. Only
  // item names change (`mergeDay`), so the running phase keeps its clock; a day that completing
  // moved on (`currentDay` ahead of the latched one) is not folded in.
  useEffect(() => {
    if (Option.isNone(latched)) {
      return
    }
    const running = latched.value.session
    const reread = Option.flatMap(target, (entry) =>
      entry.enrollment.currentDay === running.dayNumber ? entry.day : Option.none(),
    )
    if (Option.isNone(reread)) {
      return
    }
    const day = mergeDay(running.day, reread.value)
    if (day !== running.day) {
      setLatched(Option.some({ ...latched.value, session: { ...running, day } }))
    }
  }, [latched, target])

  const header = (
    <AppBar
      title="Workout"
      nav={false}
      leading={<IconButton icon="close" accessibilityLabel="Close player" onPress={close} />}
    />
  )

  return Option.match(latched, {
    onSome: (l) => <Player session={l.session} original={l.original} onClose={close} />,
    onNone: () => (
      <Page header={header} scroll>
        {Match.value(state).pipe(
          Match.tag("Loading", () => <Skeleton width="100%" height={320} />),
          Match.tag("Failed", ({ message }) => (
            <Banner tone="danger" title="Could not load the workout" body={message} />
          )),
          Match.when(
            () => Option.isNone(target),
            () => (
              <Banner tone="danger" title="Could not load the workout" body={WORKOUT_NOT_FOUND} />
            ),
          ),
          Match.orElse(() =>
            desktop ? (
              <NoWorkoutDesktop onOpen={() => router.replace("/train?view=programs")} />
            ) : (
              <EmptyState title="No workout today" body="Enrol in a program in Train → Programs." />
            ),
          ),
        )}
      </Page>
    ),
  })
}
