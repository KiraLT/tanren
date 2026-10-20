import { AppBar, EmptyState, Page } from "../../src/ui"

export default function ProgramsScreen() {
  return (
    <Page header={<AppBar title="Programs" />}>
      <EmptyState title="Coming soon" body="Training programs will live here." />
    </Page>
  )
}
