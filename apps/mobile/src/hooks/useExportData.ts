import { Option } from "effect"

export type ExportState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Working" }
  | { readonly _tag: "Done"; readonly fileName: string }
  | { readonly _tag: "Failed" }

export interface ExportData {
  readonly state: ExportState
  readonly start: () => void
}

/** Native: no download target, so `None` (Settings shows "Export on the web app"). The web build uses `useExportData.web.ts`. */
export const useExportData = (): Option.Option<ExportData> => Option.none()
