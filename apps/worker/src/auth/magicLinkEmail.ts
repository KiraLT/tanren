import { Option, Schema } from "effect"

export const MAGIC_LINK_SUBJECT = "Sign in to Tanren"
/** Better Auth's magic-link default (`expiresIn` 300 s); `BetterAuth.ts` does not override it. */
export const MAGIC_LINK_EXPIRES_IN_MINUTES = 5

export const MagicLinkEmailInput = Schema.Struct({
  url: Schema.String,
  expiresInMinutes: Schema.Number,
  appName: Schema.String,
  supportHint: Schema.optionalKey(Schema.String),
})
export type MagicLinkEmailInput = typeof MagicLinkEmailInput.Type

export const MagicLinkEmailContent = Schema.Struct({
  subject: Schema.String,
  text: Schema.String,
  html: Schema.String,
})
export type MagicLinkEmailContent = typeof MagicLinkEmailContent.Type

export const escapeHtml = (raw: string): string =>
  raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

// Forge palette (docs/design/ui-direction-final.md): ember accent, graphite on paper. Fixed light
// colours with `color-scheme: light`, so clients that auto-darken never get black-on-black.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const DISPLAY = "'Barlow Condensed','Arial Narrow',Impact,Helvetica,Arial,sans-serif"
const INK = "#1f1d1a"
const MUTED = "#6b665e"
const PAPER = "#f6f4ef"
const RULE = "#e4dfd4"
const ACCENT = "#c2410c"

const minutesLabel = (minutes: number): string =>
  `${minutes} ${minutes === 1 ? "minute" : "minutes"}`

/** The magic-link email: table layout and inline styles only (mail clients drop `<style>` and scripts). */
export const magicLinkEmail = (input: MagicLinkEmailInput): MagicLinkEmailContent => {
  const { url, expiresInMinutes, appName } = input
  const hint = Option.fromNullishOr(input.supportHint)
  const intro = `Tap the button to sign in. The link works once and expires in ${minutesLabel(expiresInMinutes)}.`
  const footer = "You asked for this link on tanren.me. If you didn't, ignore this email."
  const legalLine = "Tanren · tanren.me/privacy · tanren.me/terms · hello@tanren.me"
  const subject = `Sign in to ${appName}`
  const button = `Sign in to ${appName}`

  const text = [
    subject,
    "",
    intro,
    "",
    url,
    "",
    footer,
    legalLine,
    ...Option.match(hint, { onNone: () => [], onSome: (value) => ["", value] }),
    "",
  ].join("\n")

  const hintRow = Option.match(hint, {
    onNone: () => "",
    onSome: (value) =>
      `<tr><td style="padding:8px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(value)}</td></tr>`,
  })

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;color-scheme:light;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
<tr><td bgcolor="${PAPER}" style="background-color:${PAPER};border:1px solid ${RULE};border-radius:16px;padding:32px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 20px;font-family:${DISPLAY};font-size:22px;line-height:24px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:${INK};">${escapeHtml(appName)}</td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:20px 0 24px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};">${escapeHtml(intro)}</td></tr>
<tr><td align="left" style="padding:0 0 24px;">
<a href="${escapeHtml(url)}" style="display:inline-block;background-color:${ACCENT};color:#ffffff;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;text-decoration:none;padding:14px 24px;border-radius:999px;">${escapeHtml(button)}</a>
</td></tr>
<tr><td style="padding:0 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Button not working? Paste this link into your browser:</td></tr>
<tr><td style="padding:0 0 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};word-break:break-all;">${escapeHtml(url)}</td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(footer)}<br>${escapeHtml(legalLine)}</td></tr>
${hintRow}
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`

  return { subject, text, html }
}
