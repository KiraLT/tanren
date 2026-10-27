import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema, SchemaAST } from "effect"
import { EntityName } from "./common"
import { ActivityExportId, SessionId } from "./ids"
import {
  ActivityExport,
  ConnectRejected,
  ConnectRequest,
  ConnectResponse,
  ExportFailureReason,
  ExportStatus,
  ExportsQuery,
  IntegrationNotConnected,
  IntegrationState,
  IntegrationsStatus,
  Provider,
  ProviderAccount,
  ProviderStatus,
  RetryExportRequest,
} from "./integrations"
import { accepts, failingPaths, rejects, roundTrips, wireRoundTrips } from "./testing"

const exportId = "0a1b2c3d-6d43-4c1a-9a3e-2f4f1a2b3c4d"
const sessionId = "1b2c3d4e-7e54-4d2b-8b4f-3a5a2b3c4d5e"

const connectedWire = {
  provider: "strava",
  state: "connected",
  account: { displayName: "Lukas K." },
  connectedAt: "2026-10-26T19:00:00.000Z",
  lastExportAt: "2026-10-26T19:40:12.000Z",
  pendingExports: 0,
  failedExports: 1,
  blockedExports: 0,
} as const
const blockedWire = { ...connectedWire, failedExports: 0, blockedExports: 2 } as const
const disconnectedWire = {
  provider: "strava",
  state: "disconnected",
  account: null,
  connectedAt: null,
  lastExportAt: null,
  pendingExports: 0,
  failedExports: 0,
  blockedExports: 0,
} as const
const exportWire = {
  id: exportId,
  provider: "strava",
  sessionId,
  status: "sent",
  attempts: 1,
  externalActivityId: "12345",
  lastError: null,
  createdAt: "2026-10-26T19:30:00.000Z",
  updatedAt: "2026-10-26T19:40:12.000Z",
} as const

const statusOf = (schema: Schema.Top) => SchemaAST.resolveAt<number>("httpApiStatus")(schema.ast)

describe("literal schemas", () => {
  it.effect("accept every documented literal", () =>
    Effect.gen(function* () {
      yield* accepts(Provider, "strava")
      yield* Effect.forEach(["connected", "revoked", "disconnected"], (state) =>
        accepts(IntegrationState, state),
      )
      yield* Effect.forEach(["pending", "running", "sent", "failed", "dead", "blocked"], (status) =>
        accepts(ExportStatus, status),
      )
      yield* Effect.forEach(
        [
          "unauthorized",
          "rate_limited",
          "rejected",
          "provider_error",
          "transport",
          "session_missing",
          "app_inactive",
        ],
        (reason) => accepts(ExportFailureReason, reason),
      )
    }),
  )

  it.effect("reject an unknown literal", () =>
    Effect.gen(function* () {
      yield* rejects(Provider, "garmin")
      yield* rejects(IntegrationState, "pending")
      yield* rejects(ExportStatus, "queued")
      yield* rejects(ExportFailureReason, "network")
    }),
  )

  it.effect("EntityName accepts activityExport", () => accepts(EntityName, "activityExport"))
})

describe("ActivityExportId", () => {
  it.effect("accepts a UUID, rejects other strings", () =>
    Effect.gen(function* () {
      yield* accepts(ActivityExportId, exportId)
      yield* rejects(ActivityExportId, "not-a-uuid")
    }),
  )
})

describe("ProviderAccount", () => {
  it.effect("decodes a name and rejects an empty one with the path", () =>
    Effect.gen(function* () {
      yield* accepts(ProviderAccount, { displayName: "Lukas K." })
      expect(yield* failingPaths(ProviderAccount, { displayName: "" })).toEqual([["displayName"]])
    }),
  )
})

describe("ProviderStatus", () => {
  it.effect("decodes the connected wire example and encodes it back", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ProviderStatus, connectedWire)
      const decoded = yield* Schema.decodeUnknownEffect(ProviderStatus)(connectedWire)
      expect(Option.isSome(decoded.lastExportAt)).toBe(true)
      expect(Option.map(decoded.account, (a) => a.displayName)).toEqual(Option.some("Lukas K."))
    }),
  )

  it.effect("round-trips a status with blockedExports 2 and requires the field", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ProviderStatus, blockedWire)
      const decoded = yield* Schema.decodeUnknownEffect(ProviderStatus)(blockedWire)
      expect(decoded.blockedExports).toBe(2)
      expect(yield* failingPaths(ProviderStatus, { ...blockedWire, blockedExports: -1 })).toEqual([
        ["blockedExports"],
      ])
    }),
  )

  it.effect("decodes nulls to None and encodes None back to null", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ProviderStatus, disconnectedWire)
      const decoded = yield* Schema.decodeUnknownEffect(ProviderStatus)(disconnectedWire)
      expect(Option.isNone(decoded.account)).toBe(true)
      expect(Option.isNone(decoded.connectedAt)).toBe(true)
      expect(Option.isNone(decoded.lastExportAt)).toBe(true)
    }),
  )

  it.effect("round-trips a value", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProviderStatus)(connectedWire)
      yield* roundTrips(ProviderStatus, decoded)
    }),
  )

  it.effect("rejects a negative or fractional count and a bad state, with paths", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ProviderStatus, { ...connectedWire, pendingExports: -1 })).toEqual(
        [["pendingExports"]],
      )
      expect(yield* failingPaths(ProviderStatus, { ...connectedWire, failedExports: 1.5 })).toEqual(
        [["failedExports"]],
      )
      expect(yield* failingPaths(ProviderStatus, { ...connectedWire, state: "gone" })).toEqual([
        ["state"],
      ])
    }),
  )
})

describe("IntegrationsStatus", () => {
  it.effect("round-trips the wire shape with both examples", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(IntegrationsStatus, { providers: [connectedWire] })
      yield* wireRoundTrips(IntegrationsStatus, { providers: [disconnectedWire] })
      yield* wireRoundTrips(IntegrationsStatus, { providers: [] })
    }),
  )

  it.effect("reports the failing provider index in the path", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(IntegrationsStatus, {
          providers: [connectedWire, { ...disconnectedWire, provider: "garmin" }],
        }),
      ).toEqual([["providers", 1, "provider"]])
    }),
  )
})

describe("ActivityExport", () => {
  it.effect("round-trips on the wire with externalActivityId set", () =>
    wireRoundTrips(ActivityExport, exportWire),
  )

  it.effect("round-trips on the wire with externalActivityId and lastError null", () =>
    wireRoundTrips(ActivityExport, {
      ...exportWire,
      status: "pending",
      attempts: 0,
      externalActivityId: null,
      lastError: null,
    }),
  )

  it.effect("round-trips a failed row with a reason, null externalActivityId", () =>
    wireRoundTrips(ActivityExport, {
      ...exportWire,
      status: "failed",
      externalActivityId: null,
      lastError: "rejected",
    }),
  )

  it.effect("round-trips a value (Option.none and Option.some)", () =>
    Effect.gen(function* () {
      const base = {
        id: ActivityExportId.make(exportId),
        provider: "strava",
        sessionId: SessionId.make(sessionId),
        status: "sent",
        attempts: 2,
        createdAt: DateTime.makeUnsafe("2026-10-26T19:30:00.000Z"),
        updatedAt: DateTime.makeUnsafe("2026-10-26T19:40:12.000Z"),
      } as const
      yield* roundTrips(ActivityExport, {
        ...base,
        externalActivityId: Option.none(),
        lastError: Option.none(),
      })
      yield* roundTrips(ActivityExport, {
        ...base,
        externalActivityId: Option.some("12345"),
        lastError: Option.some("transport" as const),
      })
    }),
  )

  it.effect("rejects an unknown status, an unknown error and a bad id with paths", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ActivityExport, { ...exportWire, status: "queued" })).toEqual([
        ["status"],
      ])
      expect(yield* failingPaths(ActivityExport, { ...exportWire, lastError: "boom" })).toEqual([
        ["lastError"],
      ])
      expect(yield* failingPaths(ActivityExport, { ...exportWire, id: "nope" })).toEqual([["id"]])
      expect(yield* failingPaths(ActivityExport, { ...exportWire, attempts: -1 })).toEqual([
        ["attempts"],
      ])
    }),
  )
})

describe("ConnectRequest / ConnectResponse / RetryExportRequest", () => {
  const returnTo = "https://tanren.me/settings/integrations"

  it.effect("ConnectRequest accepts 512 chars, rejects 513 with the path", () =>
    Effect.gen(function* () {
      yield* accepts(ConnectRequest, { returnTo })
      yield* accepts(ConnectRequest, { returnTo: "a".repeat(512) })
      expect(yield* failingPaths(ConnectRequest, { returnTo: "a".repeat(513) })).toEqual([
        ["returnTo"],
      ])
      expect(yield* failingPaths(ConnectRequest, {})).toEqual([["returnTo"]])
    }),
  )

  it.effect("ConnectRequest and ConnectResponse round-trip on the wire", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ConnectRequest, { returnTo })
      yield* wireRoundTrips(ConnectResponse, { url: "https://www.strava.com/oauth/authorize?x=1" })
      expect(yield* failingPaths(ConnectResponse, { url: 5 })).toEqual([["url"]])
    }),
  )

  it.effect("RetryExportRequest round-trips and rejects a bad id with the path", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(RetryExportRequest, { id: exportId })
      expect(yield* failingPaths(RetryExportRequest, { id: "nope" })).toEqual([["id"]])
    }),
  )
})

describe("ExportsQuery", () => {
  const Query = Schema.Struct(ExportsQuery)

  it.effect("accepts limits 1 and 500, rejects 0, 501 and a fraction with the path", () =>
    Effect.gen(function* () {
      yield* accepts(Query, { limit: 1 })
      yield* accepts(Query, { limit: 500 })
      expect(yield* failingPaths(Query, { limit: 0 })).toEqual([["limit"]])
      expect(yield* failingPaths(Query, { limit: 501 })).toEqual([["limit"]])
      expect(yield* failingPaths(Query, { limit: 1.5 })).toEqual([["limit"]])
    }),
  )

  it.effect("round-trips on the wire", () => wireRoundTrips(Query, { limit: 20 }))

  it.effect("decodes a query without limit to zero keys (no decoding default)", () =>
    Effect.gen(function* () {
      expect(Object.keys(yield* Schema.decodeUnknownEffect(Query)({}))).toEqual([])
      yield* wireRoundTrips(Query, {})
      expect(yield* failingPaths(Query, { limit: "many" })).toEqual([["limit"]])
    }),
  )
})

describe("integration errors", () => {
  it("IntegrationNotConnected has the tag, the provider and status 409", () => {
    const error = new IntegrationNotConnected({ provider: "strava" })
    expect(error._tag).toBe("IntegrationNotConnected")
    expect(statusOf(IntegrationNotConnected)).toBe(409)
    const wire = Schema.encodeSync(IntegrationNotConnected)(error)
    expect(wire).toEqual({ _tag: "IntegrationNotConnected", provider: "strava" })
    expect(Schema.decodeUnknownSync(IntegrationNotConnected)(wire)).toEqual(error)
  })

  it("ConnectRejected has the tag, the reason and status 400", () => {
    const error = new ConnectRejected({ reason: "return-to" })
    expect(error._tag).toBe("ConnectRejected")
    expect(statusOf(ConnectRejected)).toBe(400)
    const wire = Schema.encodeSync(ConnectRejected)(error)
    expect(wire).toEqual({ _tag: "ConnectRejected", reason: "return-to" })
    expect(Schema.decodeUnknownSync(ConnectRejected)(wire)).toEqual(error)
  })

  it.effect("reject an unknown provider and an unknown reason", () =>
    Effect.gen(function* () {
      yield* rejects(IntegrationNotConnected, { _tag: "IntegrationNotConnected", provider: "x" })
      yield* rejects(ConnectRejected, { _tag: "ConnectRejected", reason: "other" })
    }),
  )
})
