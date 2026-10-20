import { AppBar, EmptyState, Page } from "../../src/ui"

export default function ProgressScreen() {
  return (
    <Page header={<AppBar title="Progress" />}>
      <EmptyState title="Coming soon" body="Your lifting progress will show up here." />
    </Page>
  )
}
