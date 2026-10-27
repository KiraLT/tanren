import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/**
 * Outbound provider connections (ADR-0018, integrations.md §2). Not synced: no `rowColumns()`, no
 * `server_seq`, never in `SyncTable`. The tokens are sealed (AES-GCM) and never plaintext.
 */
export const integration = sqliteTable(
  "integration",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    /** `active` | `revoked`. */
    status: text("status").notNull(),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    scope: text("scope").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    /**
     * Token-refresh lease (ms since epoch): the drain that set it is rotating the tokens until then.
     * `NULL` = free. Server-internal: not part of `IntegrationRow`.
     */
    refreshingUntil: integer("refreshing_until"),
  },
  (t) => [uniqueIndex("integration_user_provider_unique").on(t.userId, t.provider)],
)

/** The export outbox: one row per (user, provider, session). Not synced. */
export const activityExport = sqliteTable(
  "activity_export",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    externalActivityId: text("external_activity_id"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("activity_export_user_provider_session_unique").on(
      t.userId,
      t.provider,
      t.sessionId,
    ),
    index("activity_export_due_idx").on(t.status, t.nextAttemptAt),
  ],
)
