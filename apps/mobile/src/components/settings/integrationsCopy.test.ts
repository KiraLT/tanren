import { ActivityExport, ProviderStatus } from "@tanren/shared"
import { DateTime, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  actionBanner,
  BLOCKED_COPY,
  detailHeadline,
  detailNote,
  exportRow,
  formatDayTime,
  GO_LIVE_NOTE,
  IDLE_SUBTITLE,
  isBlocked,
  PENDING_SUBTITLE,
  providerRow,
  returnBanner,
  settingsSubtitle,
  VIEW_ON_STRAVA,
} from "./integrationsCopy"

const UTC = DateTime.zoneMakeOffset(0)
const VILNIUS = DateTime.zoneMakeOffset(2 * 60 * 60 * 1000)

const status = (overrides: Record<string, unknown>) =>
  Schema.decodeUnknownSync(ProviderStatus)({
    provider: "strava",
    state: "connected",
    account: { displayName: "Lukas K." },
    connectedAt: "2026-10-26T19:00:00.000Z",
    lastExportAt: null,
    pendingExports: 0,
    failedExports: 0,
    blockedExports: 0,
    ...overrides,
  })

const exportOf = (overrides: Record<string, unknown>) =>
  Schema.decodeUnknownSync(ActivityExport)({
    id: "00000000-0000-4000-8000-0000000000e1",
    provider: "strava",
    sessionId: "00000000-0000-4000-8000-0000000000c1",
    status: "sent",
    attempts: 1,
    externalActivityId: null,
    lastError: null,
    createdAt: "2026-10-24T08:00:00.000Z",
    updatedAt: "2026-10-24T08:05:00.000Z",
    ...overrides,
  })

const PUSH_DAY = Option.some({
  title: "Push day",
  startedAt: DateTime.makeUnsafe("2026-10-26T17:00:00.000Z"),
})

describe("providerRow", () => {
  it("shows Not connected, neutral, for a disconnected provider", () => {
    const row = providerRow(status({ state: "disconnected", account: null }), UTC)
    expect(row).toEqual({
      title: "Strava",
      pill: { label: "Not connected", tone: "neutral" },
      subtitle: IDLE_SUBTITLE,
      accessibilityLabel: "Strava, Not connected",
    })
  })

  it("shows Connected with the idle subtitle before the first export", () => {
    const row = providerRow(status({}), UTC)
    expect([row.pill, row.subtitle]).toEqual([
      { label: "Connected", tone: "success" },
      IDLE_SUBTITLE,
    ])
  })

  it("shows the last export time in the device zone", () => {
    const row = providerRow(status({ lastExportAt: "2026-10-26T19:40:12.000Z" }), VILNIUS)
    expect(row.subtitle).toBe("Last export 26 Oct, 21:40")
  })

  it("shows the failed count instead of the last export", () => {
    const row = providerRow(
      status({ lastExportAt: "2026-10-26T19:40:12.000Z", failedExports: 3 }),
      UTC,
    )
    expect([row.pill.label, row.subtitle]).toEqual(["Connected", "3 failed"])
  })

  it("shows Blocked over failed, with the resubscribe copy", () => {
    const row = providerRow(status({ failedExports: 2, blockedExports: 1 }), UTC)
    expect([row.pill, row.subtitle]).toEqual([{ label: "Blocked", tone: "danger" }, BLOCKED_COPY])
  })

  it("asks to reconnect a revoked provider", () => {
    const row = providerRow(status({ state: "revoked" }), UTC)
    expect([row.pill, row.accessibilityLabel]).toEqual([
      { label: "Reconnect", tone: "danger" },
      "Strava, Reconnect",
    ])
  })
})

describe("settingsSubtitle", () => {
  it("names the provider alone while the status is unknown", () => {
    expect(settingsSubtitle(Option.none())).toBe("Strava")
  })

  it("adds the state label", () => {
    expect(
      settingsSubtitle(Option.some({ strava: status({ state: "disconnected" }), zone: UTC })),
    ).toBe("Strava · Not connected")
  })
})

describe("actionBanner", () => {
  it("shows the go-live note as info when Strava is not configured", () => {
    expect(actionBanner("not-configured")).toEqual({ tone: "info", title: GO_LIVE_NOTE })
  })

  it("keeps the danger copy for other failures", () => {
    expect(actionBanner("offline")).toEqual({
      tone: "danger",
      title: "Integrations need a connection",
      body: "Connect to the internet and sign in, then try again.",
    })
  })
})

describe("detailNote", () => {
  it("shows the go-live note for a disconnected provider", () => {
    expect(detailNote({ state: "disconnected" })).toEqual(Option.some(GO_LIVE_NOTE))
  })

  it("hides it once connected or revoked", () => {
    expect([detailNote({ state: "connected" }), detailNote({ state: "revoked" })]).toEqual([
      Option.none(),
      Option.none(),
    ])
  })
})

describe("detailHeadline", () => {
  it("names the athlete when connected", () => {
    expect(detailHeadline(status({}))).toBe("Connected as Lukas K.")
  })

  it("says Not connected when disconnected", () => {
    expect(detailHeadline(status({ state: "disconnected", account: null }))).toBe("Not connected")
  })
})

describe("returnBanner", () => {
  it("confirms a connection", () => {
    expect(returnBanner({ connected: "strava" })).toEqual(
      Option.some({ tone: "success", title: "Strava connected" }),
    )
  })

  it("explains a declined authorization", () => {
    expect(returnBanner({ error: "denied" })).toEqual(
      Option.some({ tone: "danger", title: "Strava access was declined" }),
    )
  })

  it("explains a missing upload scope", () => {
    expect(returnBanner({ error: "scope" })).toEqual(
      Option.some({
        tone: "danger",
        title:
          "Tanren needs permission to create activities. Connect again and keep 'Upload your activities' ticked",
      }),
    )
  })

  it("explains a provider failure", () => {
    expect(returnBanner({ error: "provider" })).toEqual(
      Option.some({ tone: "danger", title: "Strava did not answer. Try again" }),
    )
  })

  it("shows nothing without params, for unknown values or repeated params", () => {
    expect([
      returnBanner({}),
      returnBanner({ error: "other" }),
      returnBanner({ connected: ["strava", "strava"] }),
    ]).toEqual([Option.none(), Option.none(), Option.none()])
  })
})

describe("exportRow", () => {
  it("links a sent export to Strava under the session's date and name", () => {
    const row = exportRow(exportOf({ externalActivityId: "987" }), PUSH_DAY, UTC)
    expect(row).toMatchObject({
      title: "26 Oct · Push day",
      icon: "check",
      subtitle: VIEW_ON_STRAVA,
      pill: { label: "Sent", tone: "success" },
      action: { _tag: "View", url: "https://www.strava.com/activities/987" },
    })
  })

  it("falls back to the export date and Session when the session is not local", () => {
    expect(exportRow(exportOf({}), Option.none(), UTC).title).toBe("24 Oct · Session")
  })

  it("promises a pending export within 5 minutes, with no action", () => {
    const row = exportRow(exportOf({ status: "running" }), PUSH_DAY, UTC)
    expect([row.icon, row.subtitle, row.pill.label, row.action._tag]).toEqual([
      "clock",
      PENDING_SUBTITLE,
      "Pending",
      "None",
    ])
  })

  it("offers Retry on a failed export with the reason and the a11y label", () => {
    const row = exportRow(exportOf({ status: "dead", lastError: "rejected" }), PUSH_DAY, UTC)
    expect([row.subtitle, row.pill, row.action]).toEqual([
      "Strava rejected the activity",
      { label: "Failed", tone: "danger" },
      {
        _tag: "Retry",
        id: "00000000-0000-4000-8000-0000000000e1",
        accessibilityLabel: "Retry export of 26 Oct · Push day",
      },
    ])
  })

  it("offers Retry on a blocked export with the resubscribe copy", () => {
    const row = exportRow(exportOf({ status: "blocked", lastError: "app_inactive" }), PUSH_DAY, UTC)
    expect([row.subtitle, row.pill.label, row.action._tag]).toEqual([
      BLOCKED_COPY,
      "Blocked",
      "Retry",
    ])
  })
})

describe("isBlocked", () => {
  it("is true when the status counts blocked rows or a row is blocked", () => {
    expect([
      isBlocked(status({ blockedExports: 1 }), []),
      isBlocked(status({}), [{ status: "blocked" }]),
      isBlocked(status({ failedExports: 2 }), [{ status: "failed" }]),
    ]).toEqual([true, true, false])
  })
})

describe("formatDayTime", () => {
  it("pads hours and minutes", () => {
    expect(formatDayTime(DateTime.makeUnsafe("2026-01-05T07:03:00.000Z"), UTC)).toBe("5 Jan, 07:03")
  })
})
