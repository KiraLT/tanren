import { Match, Option } from "effect"
import { useKeepAwake } from "expo-keep-awake"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { type PlayerSession, usePlayer } from "../../src/hooks/usePlayer"
import { CompletionSheet, PlayerView } from "../../src/player/components/PlayerView"
import { approxMinutes } from "../../src/player/components/ProgramHome"
import { isRunning } from "../../src/player/cues"
import { useProgramDay } from "../../src/player/useProgramDay"
import {
  AppBar,
  Banner,
  Button,
  EmptyState,
  IconButton,
  Page,
  Skeleton,
  space,
  Text,
} from "../../src/ui"

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
  return (
    <View style={{ gap: space.lg }}>
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
                size="xl"
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
    </View>
  )
}

export default function PlayScreen() {
  const router = useRouter()
  const { state } = useProgramDay()
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
      leading={<IconButton icon="close" accessibilityLabel="Close player" onPress={close} />}
    />
  )

  return (
    <Page header={header} scroll>
      {Option.match(session, {
        onSome: (s) => <Player session={s} onClose={close} />,
        onNone: () =>
          Match.value(state).pipe(
            Match.tag("Loading", () => <Skeleton width="100%" height={320} />),
            Match.tag("Failed", ({ message }) => (
              <Banner tone="danger" title="Could not load the workout" body={message} />
            )),
            Match.orElse(() => (
              <EmptyState title="No workout today" body="Enrol in a program on the Programs tab." />
            )),
          ),
      })}
    </Page>
  )
}
