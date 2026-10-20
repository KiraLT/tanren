import type { CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { failureMessage, runtime } from "../services/runtime"
import { type AddOutcome, addCatalogToToday, addOutcome } from "./addToToday"

/**
 * "Add to today's session": links the entry and appends it to today's planned session in one
 * runtime run. Added → opens Today; otherwise `outcome` holds the notice to show. Never rejects.
 */
export const useAddToToday = (): {
  readonly add: (catalogId: CatalogId) => Promise<void>
  readonly pending: boolean
  readonly outcome: Option.Option<AddOutcome>
  readonly dismiss: () => void
} => {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Option.Option<AddOutcome>>(Option.none())
  const add = useCallback(
    (catalogId: CatalogId) => {
      setPending(true)
      setOutcome(Option.none())
      return runtime.runPromiseExit(addCatalogToToday(catalogId)).then((exit) => {
        const next = addOutcome(exit, failureMessage)
        setPending(false)
        if (next._tag === "Added") {
          // biome-ignore lint/plugin/noMutation: expo-router push
          router.push("/today")
          return
        }
        setOutcome(Option.some(next))
      })
    },
    [router],
  )
  const dismiss = useCallback(() => setOutcome(Option.none()), [])
  return { add, pending, outcome, dismiss }
}
