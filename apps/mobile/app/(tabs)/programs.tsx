import { Match } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import {
  ActiveSection,
  NoActiveCard,
  ProgramsSection,
} from "../../src/player/components/ProgramList"
import { type ProgramsState, usePrograms } from "../../src/player/usePrograms"
import {
  AppBar,
  Banner,
  Columns,
  IconButton,
  Page,
  Skeleton,
  space,
  useBreakpoint,
} from "../../src/ui"

function ProgramsBar({ onNew }: { readonly onNew?: () => void }) {
  return (
    <AppBar
      title="Programs"
      {...(onNew === undefined
        ? {}
        : {
            trailing: <IconButton icon="plus" accessibilityLabel="New program" onPress={onNew} />,
          })}
    />
  )
}

export default function ProgramsScreen() {
  const router = useRouter()
  const wide = useBreakpoint() === "desktop"
  const { state, setStatus } = usePrograms()
  return Match.value<ProgramsState>(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Page header={<ProgramsBar />}>
          <View accessible accessibilityLabel="Loading programs" style={{ gap: space.lg }}>
            <Skeleton width="100%" height={136} />
            <Skeleton width="100%" height={220} />
          </View>
        </Page>
      ),
      Failed: ({ message }) => (
        <Page header={<ProgramsBar />}>
          <Banner tone="danger" title="Could not load programs" body={message} />
        </Page>
      ),
      Ready: ({ summaries, active }) => {
        const running = (
          <ActiveSection
            active={active}
            onStart={(enrollmentId) =>
              // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
              router.push({ pathname: "/programs/play", params: { enrollmentId } })
            }
            onResume={(entry) => {
              setStatus(entry.enrollment.id, "active")
            }}
            onOpenDay={(entry) =>
              // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
              router.push({
                pathname: "/programs/[programId]/day/[n]",
                params: {
                  programId: entry.enrollment.programId,
                  n: String(entry.enrollment.currentDay),
                },
              })
            }
          />
        )
        const list = (
          <ProgramsSection
            summaries={summaries}
            onOpen={(summary) =>
              // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
              router.push({
                pathname: "/programs/[programId]",
                params: { programId: summary.programId },
              })
            }
          />
        )
        return (
          <Page
            header={
              <ProgramsBar
                // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                onNew={() => router.push("/programs/new")}
              />
            }
            scroll
            wide
          >
            {/* Desktop: running programs left, the full list right; a phone stacks them. */}
            <Columns
              split="6/6"
              main={active.length > 0 ? running : wide ? <NoActiveCard /> : null}
              side={list}
            />
          </Page>
        )
      },
    }),
  )
}
