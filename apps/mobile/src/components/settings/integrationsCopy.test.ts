import { ActivityExport, ProviderStatus } from "@tanren/shared"
import { DateTime, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  ABOUT_BODIES,
  actionBanner,
  BLOCKED_COPY,
  canSubmitToken,
  detailHeadline,
  detailNote,
  exportRow,
  formatDayTime,
  GARMIN,
  GO_LIVE_NOTE,
  garminActionBanner,
  garminConnectedLine,
  garminVisibleFailure,
  IDLE_SUBTITLE,
  isBlocked,
  PENDING_SUBTITLE,
  providerRow,
  returnBanner,
  settingsSubtitle,
  tokenAddedLine,
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

const garmin = (overrides: Record<string, unknown>) =>
  status({
    provider: "garmin",
    imports: { lastPullAt: null, lastError: null, activities: 0, days: 0 },
    ...overrides,
  })

describe("providerRow for Garmin", () => {
  it("shows Not connected, neutral, with the import subtitle when disconnected", () => {
    const row = providerRow(
      status({ provider: "garmin", state: "disconnected", account: null }),
      UTC,
    )
    expect(row).toEqual({
      title: "Garmin",
      pill: { label: "Not connected", tone: "neutral" },
      subtitle: "Imports runs, rides and daily calories",
      accessibilityLabel: "Garmin, Not connected",
    })
  })

  it("promises the first import within 5 minutes when connected and never pulled", () => {
    const row = providerRow(garmin({}), UTC)
    expect([row.pill, row.subtitle]).toEqual([
      { label: "Connected", tone: "accent" },
      "First import within 5 minutes",
    ])
  })

  it("shows the last import time in the zone when connected and pulled", () => {
    const row = providerRow(
      garmin({
        imports: {
          lastPullAt: "2026-10-27T08:05:00.000Z",
          lastError: null,
          activities: 3,
          days: 7,
        },
      }),
      VILNIUS,
    )
    expect(row.subtitle).toBe("Last import 27 Oct, 10:05")
  })

  it("shows Token rejected, danger, and asks for a new token when revoked", () => {
    const row = providerRow(garmin({ state: "revoked" }), UTC)
    expect([row.pill, row.subtitle]).toEqual([
      { label: "Token rejected", tone: "danger" },
      "Garmin stopped accepting the token. Paste a new one",
    ])
  })

  it("keeps Strava's own copy for a Strava row", () => {
    expect(providerRow(status({ state: "revoked" }), UTC).pill.label).toBe("Reconnect")
  })
})

describe("Garmin card copy", () => {
  it("summarises the account and import counts when connected", () => {
    const line = garminConnectedLine(
      garmin({
        account: { displayName: "Lukas K." },
        imports: { lastPullAt: null, lastError: null, activities: 12, days: 1 },
      }),
    )
    expect(line).toBe("Connected as Lukas K. · 12 activities · 1 day")
  })

  it("reads plain Connected with zero counts when the server sent no account or imports", () => {
    expect(garminConnectedLine(status({ provider: "garmin", account: null }))).toBe(
      "Connected · 0 activities · 0 days",
    )
  })

  it("dates the token as 'Mon 26 Oct'", () => {
    expect(tokenAddedLine(garmin({ connectedAt: "2026-10-26T19:00:00.000Z" }), UTC)).toEqual(
      Option.some("Token added Mon 26 Oct"),
    )
  })

  it("has no token date when connectedAt is null", () => {
    expect(tokenAddedLine(garmin({ connectedAt: null }), UTC)).toEqual(Option.none())
  })

  it("enables Connect only once the trimmed token has 16 characters", () => {
    expect([
      canSubmitToken("  0123456789abcde  "),
      canSubmitToken("0123456789abcdef"),
      canSubmitToken(" 0123456789abcdef\n"),
    ]).toEqual([false, true, true])
  })

  it("names the token page in the link caption", () => {
    expect(GARMIN.tokenLink).toBe("Get a token at connect.garmin.com → Settings")
  })
})

describe("garminActionBanner", () => {
  it("says Garmin did not accept a rejected token", () => {
    expect(garminActionBanner({ _tag: "Rejected", reason: "rejected" })).toEqual({
      tone: "danger",
      title: "Garmin did not accept this token",
    })
  })

  it("says the connection goes live later when Garmin is not configured", () => {
    expect(garminActionBanner({ _tag: "Rejected", reason: "not-configured" })).toEqual({
      tone: "danger",
      title: "Garmin connection goes live after the owner enables it",
    })
  })

  it("asks to try again when Garmin is unreachable", () => {
    expect(garminActionBanner({ _tag: "Rejected", reason: "unreachable" })).toEqual({
      tone: "danger",
      title: "Garmin did not answer. Try again",
    })
  })

  it("reuses the shared offline copy", () => {
    expect(garminActionBanner({ _tag: "Failed", reason: "offline" })).toEqual(
      actionBanner("offline"),
    )
  })

  it("names Garmin, not Strava, when the provider is not connected", () => {
    expect(garminActionBanner({ _tag: "Failed", reason: "not-connected" }).title).toBe(
      "Garmin is not connected",
    )
  })
})

describe("garminVisibleFailure", () => {
  it("hides a failed connect once the reloaded status reads connected", () => {
    expect(
      garminVisibleFailure({ _tag: "Failed", reason: "offline", action: "connect" }, "connected"),
    ).toEqual(Option.none())
  })

  it("shows the offline banner for a failed connect while still disconnected", () => {
    expect(
      garminVisibleFailure(
        { _tag: "Failed", reason: "offline", action: "connect" },
        "disconnected",
      ),
    ).toEqual(Option.some(actionBanner("offline")))
  })

  it("still shows a failed disconnect while connected", () => {
    expect(
      Option.isSome(
        garminVisibleFailure(
          { _tag: "Failed", reason: "server", action: "disconnect" },
          "connected",
        ),
      ),
    ).toBe(true)
  })

  it("shows nothing while busy", () => {
    expect(garminVisibleFailure({ _tag: "Busy" }, "disconnected")).toEqual(Option.none())
  })

  it("tells the user a connect can take up to 30 s", () => {
    expect(GARMIN.connecting).toBe("Connecting… up to 30 s")
  })
})

describe("ABOUT_BODIES", () => {
  it("never claims Tanren does not read data on the Garmin page or the list", () => {
    expect(
      [ABOUT_BODIES.garmin, ABOUT_BODIES.list].some((body) =>
        body.includes("never reads data back"),
      ),
    ).toBe(false)
  })

  it("says Garmin imports are read-only, never shared, and readable by the owner's own Claude", () => {
    expect(ABOUT_BODIES.garmin).toContain(
      "Read-only and never shared with third parties. Your own Claude can read everything Tanren stores, imported Garmin data included, through the MCP connector when you ask.",
    )
  })

  it("no longer claims the AI tools cannot read Garmin data", () => {
    expect(
      [ABOUT_BODIES.garmin, ABOUT_BODIES.list].some((body) => body.includes("AI planning tools")),
    ).toBe(false)
  })

  it("keeps Strava's export-only text", () => {
    expect(ABOUT_BODIES.strava).toBe(
      "Integrations send finished sessions to other apps. Tanren only writes; it never reads data back.",
    )
  })
})
