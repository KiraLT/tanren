import { Option } from "effect"
import { useState } from "react"
import { View } from "react-native"
import type { ActiveProgram } from "../../services/ProgramRepo"
import { Banner, Button, ListGroup, ListRow, rhythm, space } from "../../ui"
import { DELETE_BLOCKED } from "../programList"

interface ProgramActionsProps {
  readonly title: string
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
 * The actions group of the detail route. Delete confirms inline (`Alert.alert` is a no-op on web)
 * and is disabled, with a reason, while an enrollment runs.
 */
export function ProgramActions({
  title,
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
  const [confirming, setConfirming] = useState(false)
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
              onPress={onLeave}
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
              disabled={isRunning || busy || confirming}
              onPress={() => setConfirming(true)}
            />
          ),
        ]}
      </ListGroup>
      {confirming ? (
        <View style={{ gap: space.md }}>
          <Banner tone="danger" title={`Delete ${title}? This cannot be undone.`} />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button
              variant="destructive"
              label="Delete"
              accessibilityLabel={`Delete ${title}`}
              loading={busy}
              disabled={busy}
              onPress={onDelete}
            />
            <Button
              variant="text"
              label="Cancel"
              disabled={busy}
              onPress={() => setConfirming(false)}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}
