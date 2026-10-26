import type { Activity, SessionId } from "@tanren/shared"
import type { Option } from "effect"
import { FeedRepo } from "../services/FeedRepo"
import { type HistoryState, type StoreRead, useStoreRead } from "./useHistory"

export type { HistoryState } from "./useHistory"

/** Module-level readers: stable identities, so they can sit in the effect's dependencies. */
const readFeed: StoreRead<number, ReadonlyArray<Activity>> = (limit) =>
  FeedRepo.use((repo) => repo.activities(limit))
const readActivity: StoreRead<SessionId, Option.Option<Activity>> = (id) =>
  FeedRepo.use((repo) => repo.activity(id))

/** The newest `limit` activities (live sessions with sets); re-reads after every store write. */
export const useFeed = (
  limit: number,
): { state: HistoryState<ReadonlyArray<Activity>>; reload: () => void } =>
  useStoreRead(readFeed, limit)

/** One activity; `Ready(None)` when the session is missing, deleted or has no live set. */
export const useActivity = (
  id: SessionId,
): { state: HistoryState<Option.Option<Activity>>; reload: () => void } =>
  useStoreRead(readActivity, id)
