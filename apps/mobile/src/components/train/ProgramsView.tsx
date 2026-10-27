import { Match } from "effect"
import { useRouter } from "expo-router"
import type { ReactNode } from "react"
import { View } from "react-native"
import { ActiveSection, NoActiveCard, ProgramsSection } from "../../player/components/ProgramList"
import { type ProgramsState, usePrograms } from "../../player/usePrograms"
import { Banner, Columns, IconButton, Page, Skeleton, space, useBreakpoint } from "../../ui"

export interface ProgramsViewProps {
  /** The Train hub's bar and segment row; `trailing` is the bar's one action ("New program" when Ready). */
  readonly header: (trailing: ReactNode) => ReactNode
}

/** Train's Programs segment (the former Programs tab, ADR-0029): running programs and the list. */
export function ProgramsView({ header }: ProgramsViewProps) {
  const router = useRouter()
  const wide = useBreakpoint() === "desktop"
  const { state, setStatus } = usePrograms()
  return Match.value<ProgramsState>(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Page header={header(null)}>
          <View accessible accessibilityLabel="Loading programs" style={{ gap: space.lg }}>
            <Skeleton width="100%" height={136} />
            <Skeleton width="100%" height={220} />
          </View>
        </Page>
      ),
      Failed: ({ message }) => (
        <Page header={header(null)}>
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
        const newProgram = (
          <IconButton
            icon="plus"
            accessibilityLabel="New program"
            // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
            onPress={() => router.push("/programs/new")}
          />
        )
        return (
          <Page header={header(newProgram)} scroll wide>
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
