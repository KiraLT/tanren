import { type Option, Record as Rec } from "effect"

/**
 * Neutral placeholder: a framed stick figure in one colour (`illustration.figure`). It is a real
 * `<svg>` string so the placeholder goes through the same `SvgXml` path as a generated drawing.
 */
export const placeholderSvg = (color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="108" height="108" rx="16" stroke-dasharray="8 8"/><circle cx="60" cy="34" r="9"/><path d="M60 43v30M60 52l-18 12M60 52l18 12M60 73l-14 24M60 73l14 24"/></svg>`

/** The webp for a catalog id from `IMAGES` (src/illustrations/images.ts); none = placeholder. */
export const illustrationImage = <Source>(
  map: Readonly<Record<string, Source>>,
  catalogId: string,
): Option.Option<Source> => Rec.get(map, catalogId)
