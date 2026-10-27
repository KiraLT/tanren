/** One block of a legal section: a paragraph or a bullet list (design `legal.md` §3). */
export type LegalBlock =
  | { readonly _tag: "p"; readonly text: string }
  | { readonly _tag: "ul"; readonly items: ReadonlyArray<string> }

export interface LegalSection {
  /** The DOM anchor (`/privacy#deletion`) and the key. */
  readonly id: string
  readonly heading: string
  readonly blocks: ReadonlyArray<LegalBlock>
}

export interface LegalDoc {
  readonly slug: "privacy" | "terms"
  readonly title: string
  readonly updated: string
  readonly sections: ReadonlyArray<LegalSection>
}

export const LAST_UPDATED = "27 October 2026"
export const CONTACT_EMAIL = "hello@tanren.me"

const p = (text: string): LegalBlock => ({ _tag: "p", text })

/**
 * The first sentence of Privacy §1.7 until LEGAL-2 ships the Settings row (design §1.7). LEGAL-2
 * replaces it with "Settings → Data → Delete account removes your account and every record linked
 * to it from our database, and clears the copy on that device."
 */
export const PRIVACY_DELETION_INTERIM =
  "Email hello@tanren.me from your account address and we remove your account and every record linked to it within 30 days."

/** Privacy Policy, verbatim from design `legal.md` §1. `**x**` marks the bold lead of a bullet. */
export const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy Policy",
  updated: LAST_UPDATED,
  sections: [
    {
      id: "who",
      heading: "Who runs Tanren",
      blocks: [
        p(
          "Tanren (tanren.me) is a personal gym tracker run by a private individual in Lithuania. For the purposes of the GDPR, Tanren is the controller of the personal data described here. Contact: hello@tanren.me.",
        ),
      ],
    },
    {
      id: "data",
      heading: "What we store",
      blocks: [
        {
          _tag: "ul",
          items: [
            "**Account**: your email address, when it was verified, and the time of your sign-ins. Sign-in uses a one-time magic link sent to that address; there is no password.",
            "**Training log**: the sessions, sets, weights, reps, RPE and notes you log, the exercises you add, your plans and plan weeks, and the guided-program days you complete.",
            "**Profile**: goals, constraints, available days, your locations (for example Home, Gym) and the equipment at each.",
            "**Integrations**: if you connect Strava, the access and refresh tokens Strava issues. They are stored encrypted with a key that lives only on the server. If you connect Garmin, the token you paste is stored the same way, and the activities and daily health data we pull from Garmin are stored as your records.",
            "**AI access**: if you connect your own Claude (or another MCP client) through our connector, we store the grant you approved and short-lived tokens for it. We never send your data to an AI service ourselves.",
            "**On your device**: the app keeps a copy of your training data in a local database so it works offline, plus your theme preference. On the web this lives in your browser's storage for tanren.me.",
          ],
        },
        p(
          "Your email address is the only data you must provide: without it Tanren cannot sign you in. Everything else is optional.",
        ),
      ],
    },
    {
      id: "purpose",
      heading: "Why, and on what legal basis",
      blocks: [
        p(
          "We process your data to run the service you signed up for: logging, syncing between your devices, showing your plan and history, and pushing or pulling activities for the integrations you turned on (GDPR Art. 6(1)(b)). Connecting Strava, Garmin or an AI client is your choice and can be undone in Settings (Art. 6(1)(a)). Standard server and email delivery logs are kept to run the service securely (Art. 6(1)(f)). We do not profile you, sell data, show ads, or run analytics or tracking.",
        ),
      ],
    },
    {
      id: "where",
      heading: "Where it is stored, and who else sees it",
      blocks: [
        p(
          "Your account and training data are stored in a Cloudflare database and run on Cloudflare's network. Cloudflare also keeps standard request logs and traffic analytics on its side. Magic-link emails are delivered by Resend, which keeps delivery logs including your address. Strava and Garmin receive or provide only what the integration you enabled needs; their own terms apply to the data you hold there. The iPhone app is built and delivered with Expo's tools; Expo does not receive your training data. These providers are based in the United States and process data under their GDPR data processing terms and the EU standard contractual clauses. We do not share your data with anyone else, except when the law requires.",
        ),
      ],
    },
    {
      id: "cookies",
      heading: "Cookies and local storage",
      blocks: [
        p(
          "On the web, one cookie keeps you signed in for up to 30 days; it is strictly necessary and set only after you sign in, so no cookie banner is needed. The web app stores your training data and theme in your browser's storage so it can work offline. There are no analytics, advertising or third-party cookies.",
        ),
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      blocks: [
        p(
          "Your data stays as long as your account exists. Items you delete in the app are marked deleted and kept so your other devices learn about the deletion; they are removed with your account. Magic links expire within minutes and work once. Integration tokens are deleted when you disconnect the integration. AI client grants are revoked when you disconnect them in Settings.",
        ),
      ],
    },
    {
      id: "deletion",
      heading: "Deleting your account",
      blocks: [
        p(
          `${PRIVACY_DELETION_INTERIM} Delete the app or clear site data to remove copies on other devices. You can also ask by email at hello@tanren.me and we will do it within 30 days. Data already pushed to Strava stays in your Strava account under Strava's terms.`,
        ),
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      blocks: [
        p(
          "You can access, correct, export (Settings → Data → Export), restrict or object to the processing of your data, and have it erased. Write to hello@tanren.me. You may also complain to the Lithuanian State Data Protection Inspectorate (vdai.lrv.lt) or the supervisory authority where you live.",
        ),
      ],
    },
    {
      id: "children",
      heading: "Children",
      blocks: [
        p(
          "Tanren is for people aged 16 and over. If you believe a younger person has an account, tell us and we will delete it.",
        ),
      ],
    },
    {
      id: "changes",
      heading: "Changes",
      blocks: [
        p(
          "When this policy changes, the date at the top changes and the app shows the new version here. Material changes are announced on the sign-in page before they take effect.",
        ),
      ],
    },
  ],
}

/** Terms of Service, verbatim from design `legal.md` §2. */
export const TERMS: LegalDoc = {
  slug: "terms",
  title: "Terms of Service",
  updated: LAST_UPDATED,
  sections: [
    {
      id: "service",
      heading: "What Tanren is",
      blocks: [
        p(
          "Tanren is a personal gym tracker: you log sets, follow guided programs, see your history, and may let your own AI assistant read that history and write a plan. It is run by a private individual in Lithuania and offered free of charge. By using it you agree to these terms.",
        ),
      ],
    },
    {
      id: "health",
      heading: "Not medical advice",
      blocks: [
        p(
          "Tanren records what you do. Plans, targets and programs are suggestions, not medical or professional coaching advice. Training carries a risk of injury: check with a doctor if you are unsure, and train at your own risk.",
        ),
      ],
    },
    {
      id: "account",
      heading: "Your account",
      blocks: [
        p(
          "You need a working email address; sign-in is a one-time link sent to it. Keep your mailbox secure, because whoever reads it can sign in as you. You must be 16 or older. One account per person.",
        ),
      ],
    },
    {
      id: "your-data",
      heading: "Your data",
      blocks: [
        p(
          "Your training log belongs to you. You give Tanren the permission needed to store, sync and show it to you and to send it where you ask (for example Strava). You can export it at any time and delete it with your account.",
        ),
      ],
    },
    {
      id: "integrations",
      heading: "AI assistants and integrations",
      blocks: [
        p(
          "Connecting Claude or another MCP client, Strava or Garmin is optional. Those services have their own terms and privacy policies, and Tanren is not responsible for what they do with your data or for the plans an AI assistant writes. You can disconnect any of them in Settings.",
        ),
      ],
    },
    {
      id: "use",
      heading: "Acceptable use",
      blocks: [
        p(
          "Do not attack, overload or reverse-engineer the service, access other people's data, or use Tanren for anything unlawful. We may suspend accounts that do.",
        ),
      ],
    },
    {
      id: "availability",
      heading: "Availability and changes",
      blocks: [
        p(
          "Tanren is free and provided as is, without uptime guarantees. Features may change or be removed, and the service may pause or end; if it ends, we announce it on tanren.me and give you time to export your data.",
        ),
      ],
    },
    {
      id: "ip",
      heading: "Intellectual property",
      blocks: [
        p(
          "The app, its design, the Tanren name and mark, and the exercise illustrations belong to Tanren. You may use them only through the app.",
        ),
      ],
    },
    {
      id: "liability",
      heading: "Liability",
      blocks: [
        p(
          "To the extent the law allows, Tanren is not liable for injury, lost data or other losses from using a free service. Nothing here limits rights you have as a consumer under Lithuanian or EU law.",
        ),
      ],
    },
    {
      id: "termination",
      heading: "Ending",
      blocks: [
        p(
          "You can delete your account at any time. We may close accounts that break these terms. These terms end when your account does, except the sections on your data, IP and liability.",
        ),
      ],
    },
    {
      id: "law",
      heading: "Law and contact",
      blocks: [
        p(
          "These terms are governed by the law of the Republic of Lithuania; EU consumer protection rules apply where they are mandatory. Questions: hello@tanren.me.",
        ),
      ],
    },
  ],
}

/** The page chrome strings (design §3 footer) and the document `<title>` (VERIFY-1). */
export const LEGAL_PAGE = {
  questions: `Questions? ${CONTACT_EMAIL}`,
  updated: (updated: string) => `Last updated ${updated}`,
  documentTitle: (doc: LegalDoc) => `${doc.slug === "privacy" ? "Privacy" : "Terms"} · Tanren`,
  other: {
    privacy: { label: "Terms of Service", href: "/terms" },
    terms: { label: "Privacy Policy", href: "/privacy" },
  },
} as const

/** Settings → About row titles (design §4 row 3). */
export const ABOUT_LEGAL_ROWS = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
} as const

/** The sign-in agreement line: the two linked words are their own parts (design §4 row 2). */
export const SIGN_IN_AGREEMENT_PARTS = [
  { text: "By continuing you agree to the " },
  { text: "Terms", href: "/terms" },
  { text: " and acknowledge the " },
  { text: "Privacy Policy", href: "/privacy" },
  { text: "." },
] as const

export const SIGN_IN_AGREEMENT = SIGN_IN_AGREEMENT_PARTS.map((part) => part.text).join("")

/** Splits `**bold** rest` into runs; odd segments between `**` markers are strong. */
export const emphasisRuns = (
  text: string,
): ReadonlyArray<{ readonly text: string; readonly strong: boolean }> =>
  text
    .split("**")
    .map((segment, index) => ({ text: segment, strong: index % 2 === 1 }))
    .filter((run) => run.text.length > 0)
