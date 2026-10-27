import { describe, expect, it } from "@effect/vitest"
import {
  ABOUT_LEGAL_ROWS,
  CONTACT_EMAIL,
  emphasisRuns,
  LAST_UPDATED,
  type LegalDoc,
  PRIVACY,
  PRIVACY_DELETION_INTERIM,
  SIGN_IN_AGREEMENT,
  SIGN_IN_AGREEMENT_PARTS,
  TERMS,
} from "./legalCopy"

const docs: ReadonlyArray<LegalDoc> = [PRIVACY, TERMS]

const allText = (doc: LegalDoc): string =>
  [
    doc.title,
    doc.updated,
    ...doc.sections.flatMap((section) => [
      section.id,
      section.heading,
      ...section.blocks.flatMap((block) => (block._tag === "p" ? [block.text] : block.items)),
    ]),
  ].join("\n")

describe("legal copy (design legal.md §1–§3)", () => {
  it("has unique section ids and at least 9 sections per document", () => {
    const counts = docs.map((doc) => {
      const ids = doc.sections.map((section) => section.id)
      return { unique: new Set(ids).size === ids.length, enough: ids.length >= 9 }
    })
    expect(counts).toEqual(docs.map(() => ({ unique: true, enough: true })))
  })

  it("keeps the section ids of the design", () => {
    expect(PRIVACY.sections.map((section) => section.id)).toEqual([
      "who",
      "data",
      "purpose",
      "where",
      "cookies",
      "retention",
      "deletion",
      "rights",
      "children",
      "changes",
    ])
    expect(TERMS.sections.map((section) => section.id)).toEqual([
      "service",
      "health",
      "account",
      "your-data",
      "integrations",
      "use",
      "availability",
      "ip",
      "liability",
      "termination",
      "law",
    ])
  })

  it("has no placeholder brackets and names the contact address", () => {
    const facts = docs.map((doc) => ({
      bracket: /[[\]]/.test(allText(doc)),
      email: allText(doc).includes(CONTACT_EMAIL),
    }))
    expect(facts).toEqual(docs.map(() => ({ bracket: false, email: true })))
  })

  it("dates both documents with LAST_UPDATED", () => {
    expect(LAST_UPDATED).toBe("27 October 2026")
    expect(docs.map((doc) => doc.updated)).toEqual(docs.map(() => LAST_UPDATED))
  })

  it("opens the deletion section with the interim sentence until LEGAL-2", () => {
    const deletion = PRIVACY.sections.find((section) => section.id === "deletion")
    const first = deletion?.blocks[0]
    expect(first?._tag === "p" && first.text.startsWith(PRIVACY_DELETION_INTERIM)).toBe(true)
    expect(PRIVACY_DELETION_INTERIM).toBe(
      "Email hello@tanren.me from your account address and we remove your account and every record linked to it within 30 days.",
    )
  })

  it("titles the documents and the About rows", () => {
    expect(PRIVACY.title).toBe("Privacy Policy")
    expect(TERMS.title).toBe("Terms of Service")
    expect(ABOUT_LEGAL_ROWS).toEqual({ privacy: "Privacy Policy", terms: "Terms of Service" })
  })
})

describe("sign-in agreement line", () => {
  it("reads as the design sentence and links Terms and Privacy Policy", () => {
    expect(SIGN_IN_AGREEMENT).toBe(
      "By continuing you agree to the Terms and acknowledge the Privacy Policy.",
    )
    const links = SIGN_IN_AGREEMENT_PARTS.flatMap((part) =>
      "href" in part ? [[part.text, part.href]] : [],
    )
    expect(links).toEqual([
      ["Terms", "/terms"],
      ["Privacy Policy", "/privacy"],
    ])
  })
})

describe("emphasisRuns", () => {
  it("marks the bold lead of a bullet and keeps the rest plain", () => {
    expect(emphasisRuns("**Account**: your email")).toEqual([
      { text: "Account", strong: true },
      { text: ": your email", strong: false },
    ])
  })

  it("returns one plain run when there is no marker", () => {
    expect(emphasisRuns("plain")).toEqual([{ text: "plain", strong: false }])
  })
})
