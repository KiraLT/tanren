import { LegalPage } from "../src/components/legal/LegalPage"
import { PRIVACY } from "../src/components/legal/legalCopy"

/** Root-Stack route, public (the sign-in gate allows it): the Privacy Policy. */
export default function PrivacyScreen() {
  return <LegalPage doc={PRIVACY} />
}
