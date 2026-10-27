import type { Activity, SessionId } from "@tanren/shared"
import type { Option } from "effect"
import { type FeedItem, FeedRepo } from "../services/FeedRepo"
import { type HistoryState, type StoreRead, useStoreRead } from "./useHistory"

export type { FeedItem } from "../services/FeedRepo"
export type { HistoryState } from "./useHistory"

/** Module-level readers: stable identities, so they can sit in the effect's dependencies. */
const readFeed: StoreRead<number, ReadonlyArray<FeedItem>> = (limit) =>
  FeedRepo.use((repo) => repo.activities(limit))
const readActivity: StoreRead<SessionId, Option.Option<Activity>> = (id) =>
  FeedRepo.use((repo) => repo.activity(id))

/**
 * The newest `limit` feed items (live sessions with sets and imported activities, `startedAt`
 * desc); re-reads after every store write.
 */
export const useFeed = (
  limit: number,
): { state: HistoryState<ReadonlyArray<FeedItem>>; reload: () => void } =>
  useStoreRead(readFeed, limit)

/** One activity; `Ready(None)` when the session is missing, deleted or has no live set. */
export const useActivity = (
  id: SessionId,
): { state: HistoryState<Option.Option<Activity>>; reload: () => void } =>
  useStoreRead(readActivity, id)
