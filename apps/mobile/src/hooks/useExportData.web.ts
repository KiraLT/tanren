import { Effect, Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { DataExporter } from "../services/DataExport"
import { runtime } from "../services/runtime"
import type { ExportData, ExportState } from "./useExportData"

/** Hands the JSON to the browser as `<a download>`; the object URL is released afterwards. */
const download = (fileName: string, json: string): void => {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }))
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", fileName)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const build = DataExporter.use((exporter) =>
  Effect.all({ json: exporter.exportAll, fileName: exporter.fileName }),
)

/** Web: "Export my data" builds the `DataExport` file from the local store and downloads it. */
export const useExportData = (): Option.Option<ExportData> => {
  const [state, setState] = useState<ExportState>({ _tag: "Idle" })
  const start = useCallback(() => {
    setState({ _tag: "Working" })
    runtime.runPromiseExit(build).then((exit) => {
      if (Exit.isSuccess(exit)) {
        download(exit.value.fileName, exit.value.json)
        setState({ _tag: "Done", fileName: exit.value.fileName })
      } else {
        setState({ _tag: "Failed" })
      }
    })
  }, [])
  return Option.some({ state, start })
}
