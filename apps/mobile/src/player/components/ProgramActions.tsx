import { Option } from "effect"
import { View } from "react-native"
import type { ActiveProgram } from "../../services/ProgramRepo"
import { Banner, ListGroup, ListRow, rhythm, useConfirm } from "../../ui"
import { DELETE_BLOCKED } from "../programList"

interface ProgramActionsProps {
  readonly title: string
  /** The program's day count, for the delete dialog's message. */
  readonly dayCount: number
  /** The live enrollment in this program, if any. */
  readonly running: Option.Option<ActiveProgram>
  /** Built-ins offer "Duplicate to edit"; the owner's programs offer Edit and Delete. */
  readonly builtin: boolean
  readonly busy: boolean
  readonly error: Option.Option<string>
  readonly onPause: () => void
  readonly onLeave: () => void
  readonly onEdit: () => void
  readonly onDuplicate: () => void
  readonly onDelete: () => void
}

/**
 * The actions group of the detail route. Leave and Delete ask through the `useConfirm` dialog;
 * Delete is disabled, with a reason, while an enrollment runs.
 */
export function ProgramActions({
  title,
  dayCount,
  running,
  builtin,
  busy,
  error,
  onPause,
  onLeave,
  onEdit,
  onDuplicate,
  onDelete,
}: ProgramActionsProps) {
  const confirm = useConfirm()
  const paused = Option.exists(running, ({ enrollment }) => enrollment.status === "paused")
  const isRunning = Option.isSome(running)
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not update the program" body={message} />
        ),
      })}
      <ListGroup inset="icon">
        {[
          // A paused program is resumed from the hero card above, not from this group.
          isRunning && !paused ? (
            <ListRow
              key="pause"
              icon="pause"
              title="Pause"
              accessibilityLabel={`Pause ${title}`}
              disabled={busy}
              onPress={onPause}
            />
          ) : null,
          isRunning ? (
            <ListRow
              key="leave"
              tone="danger"
              icon="close"
              title="Leave program"
              accessibilityLabel={`Leave ${title}`}
              disabled={busy}
              onPress={() => {
                confirm({
                  title: `Leave ${title}?`,
                  message: "Your progress in it is lost; you can enrol again from day 1.",
                  confirmLabel: "Leave",
                }).then((ok) => ok && onLeave())
              }}
            />
          ) : null,
          builtin ? (
            <ListRow
              key="duplicate"
              icon="plus"
              title="Duplicate to edit"
              accessibilityLabel={`Duplicate ${title} to edit`}
              chevron
              onPress={onDuplicate}
            />
          ) : null,
          builtin ? null : (
            <ListRow
              key="edit"
              icon="list"
              title="Edit program"
              accessibilityLabel={`Edit ${title}`}
              chevron
              onPress={onEdit}
            />
          ),
          builtin ? null : (
            <ListRow
              key="delete"
              tone="danger"
              icon="trash"
              title="Delete program"
              {...(isRunning ? { subtitle: DELETE_BLOCKED } : {})}
              accessibilityLabel={`Delete ${title}`}
              disabled={isRunning || busy}
              onPress={() => {
                confirm({
                  title: `Delete ${title}?`,
                  message:
                    dayCount === 1
                      ? "Its 1 day is gone for good."
                      : `Its ${dayCount} days are gone for good.`,
                  confirmLabel: "Delete",
                }).then((ok) => ok && onDelete())
              }}
            />
          ),
        ]}
      </ListGroup>
    </View>
  )
}
