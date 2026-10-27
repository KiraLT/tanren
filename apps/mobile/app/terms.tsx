import { LegalPage } from "../src/components/legal/LegalPage"
import { TERMS } from "../src/components/legal/legalCopy"

/** Root-Stack route, public (the sign-in gate allows it): the Terms of Service. */
export default function TermsScreen() {
  return <LegalPage doc={TERMS} />
}
