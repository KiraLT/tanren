import { Redirect } from "expo-router"
import { Page, Text } from "../src/ui"

/**
 * Any unknown path goes Home (ADR-0029): covers links and installed web apps that point at a path
 * the app no longer has. The root layout's sign-in gate still decides first: a gated device sees
 * the landing (web) or is sent to sign-in (native) wherever it lands.
 */
export default function NotFound() {
  return (
    <Page>
      <Text variant="subhead" tone="muted">
        Taking you Home
      </Text>
      <Redirect href="/home" />
    </Page>
  )
}
