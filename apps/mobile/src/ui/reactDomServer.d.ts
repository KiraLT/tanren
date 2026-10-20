/**
 * Minimal types for the one `react-dom/server` call the node tests make (`theme.test.ts` renders a
 * hook probe). `@types/react-dom` is not a dependency (D1 allowed one dependency line only); if it
 * is added later, delete this file.
 */
declare module "react-dom/server" {
  export function renderToStaticMarkup(element: import("react").ReactElement): string
}
