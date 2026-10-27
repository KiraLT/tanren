import { useRouter } from "expo-router"
import { QuickAddSheet } from "../../src/components/health/QuickAddSheet"
import { useAddFood } from "../../src/hooks/useAddFood"
import { AppBar, IconButton, Page } from "../../src/ui"

/** Root-Stack modal: quick-add a typical food from the local catalog (nutrition.md §6). */
export default function AddFoodScreen() {
  const router = useRouter()
  const { add, pending, error, dismiss } = useAddFood()
  // A direct load has no history to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace("/home"))
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title="Add food"
          leading={<IconButton icon="close" accessibilityLabel="Close" onPress={close} />}
        />
      }
    >
      <QuickAddSheet
        pending={pending}
        error={error}
        onDismissError={dismiss}
        onAdd={(input) => {
          add(input).then((added) => (added ? close() : undefined))
        }}
      />
    </Page>
  )
}
