import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Better Auth 1.7.11 core tables (`user`, `session`, `account`, `verification`); the magicLink
 * plugin adds none. Source of truth: `getAuthTables()` from `better-auth/db`.
 *
 * Better Auth owns these tables and reads them through Kysely (`database: env.DB`), so table and
 * column names are its own camelCase field names, not our snake_case: renaming a column needs a
 * `fields` mapping in the Better Auth options. There are no sync columns and no `server_seq`: auth
 * rows never sync. `user.id` is a UUID string (`advanced.database.generateId: "uuid"`, or the seed
 * hook), the same value as `UserId` in every domain row's `user_id`.
 *
 * Better Auth stores dates as ISO strings and booleans as 0/1 on SQLite (`supportsDates: false`),
 * which matches the `text` timestamps used everywhere else. It writes every timestamp itself, so
 * there are no SQL defaults.
 */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  /**
   * Token generations (ADR-0022, migration 0006). The stateless app / MCP JWTs carry the `gen` they
   * were issued at; bumping a column revokes every token of that family at once. Better Auth never
   * writes them (the SQL default is 0).
   */
  appTokenGen: integer("appTokenGen").notNull().default(0),
  mcpTokenGen: integer("mcpTokenGen").notNull().default(0),
})

export const authSession = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: text("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
)

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: text("accessTokenExpiresAt"),
    refreshTokenExpiresAt: text("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
)

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: text("expiresAt").notNull(),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
)

/**
 * Single-use ledger for the stateless OAuth authorization codes (ADR-0022): a code's `jti` is
 * inserted when it is redeemed, a duplicate means replay. Not user data, so no `userId`; rows are
 * purged once `expiresAt` (epoch ms) has passed.
 */
export const oauthCodeUse = sqliteTable("oauth_code_use", {
  jti: text("jti").primaryKey(),
  expiresAt: integer("expiresAt").notNull(),
})
