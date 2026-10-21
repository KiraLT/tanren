import type { CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { useCallback, useEffect, useState } from "react"
import { type AddOutcome, addOutcome, NOTICE_MS, noticeCopy } from "../library/addToToday"
import { addCatalogToToday } from "../services/addCatalogToToday"
import { failureMessage, runtime } from "../services/runtime"

/**
 * "Add to today's session": links the entry and appends it to today's planned session in one
 * runtime run. `outcome` holds what to show; the muted notices (added / already planned) clear
 * themselves after `NOTICE_MS`, the banners on `dismiss`. Never rejects.
 */
export const useAddToToday = (): {
  readonly add: (catalogId: CatalogId) => Promise<void>
  readonly pending: boolean
  readonly outcome: Option.Option<AddOutcome>
  readonly dismiss: () => void
} => {
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Option.Option<AddOutcome>>(Option.none())
  const add = useCallback((catalogId: CatalogId) => {
    setPending(true)
    setOutcome(Option.none())
    return runtime.runPromiseExit(addCatalogToToday(catalogId)).then((exit) => {
      setPending(false)
      setOutcome(Option.some(addOutcome(exit, failureMessage)))
    })
  }, [])
  const transient = Option.isSome(Option.flatMap(outcome, noticeCopy))
  useEffect(() => {
    if (!transient) {
      return
    }
    const timer = setTimeout(() => setOutcome(Option.none()), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [transient])
  const dismiss = useCallback(() => setOutcome(Option.none()), [])
  return { add, pending, outcome, dismiss }
}
