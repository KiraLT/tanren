// Wrangler `rules` (wrangler.jsonc, wrangler.test.jsonc) bundle `*.woff2` as Data modules: the
// default export is the file's bytes.
declare module "*.woff2" {
  const data: ArrayBuffer
  export default data
}
