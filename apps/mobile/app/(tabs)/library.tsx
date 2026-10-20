import { AppBar, EmptyState, Page } from "../../src/ui"

export default function LibraryScreen() {
  return (
    <Page header={<AppBar title="Library" />}>
      <EmptyState title="Coming soon" body="The exercise library will live here." />
    </Page>
  )
}
