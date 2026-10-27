import { Option } from "effect"
import { clampSubtitle } from "../../library/catalogFormat"

/**
 * Px a Progress row spends beside its subtitle: 16 + 16 padding, the 56 thumb, 12 + 12 gaps and the
 * trailing date (~46). Measured at 900 (row 340, subtitle 186 = 154 less).
 */
const ROW_TEXT_OVERHEAD = 154
/** The same conservative width per character as `subtitleMaxChars` (15 px subhead, tabular). */
const PX_PER_CHAR = 7.6

/** How many characters of subtitle fit a row of `rowWidth` px (never below 16). */
export const rowDetailMaxChars = (rowWidth: number): number =>
  Math.max(16, Math.floor((rowWidth - ROW_TEXT_OVERHEAD) / PX_PER_CHAR))

/**
 * "105 kg × 5 · e1RM 122.5 kg" on a row that fits it, else the best set alone: the cut is made at
 * the separator, so a row never wraps and never ends in half an e1RM. A best set longer than the
 * cap (very narrow row) ends in an ellipsis.
 */
export const fitRowDetail = (best: string, e1Rm: Option.Option<string>, maxChars: number): string =>
  Option.match(e1Rm, {
    onNone: () => clampSubtitle(best, maxChars),
    onSome: (text) => {
      const full = `${best} · ${text}`
      return full.length <= maxChars ? full : clampSubtitle(best, maxChars)
    },
  })
