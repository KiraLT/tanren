// Dev-only pipe: `wrangler dev 2>&1 | node scripts/linkQr.mjs`.
// Every line is passed through unchanged; after a `magic link for <email>: <url>` line (printed by
// the console EmailSender) the URL is printed again as a terminal QR, so the owner can scan it with
// the iPhone camera (docs/design/native-auth.md §5). `uqr` lives in this package's devDependencies
// and is never imported under src/ (not in the Worker bundle). Plain .mjs: not type-checked.
import { createInterface } from "node:readline"
import { renderUnicodeCompact } from "uqr"

// Piped wrangler output has no colour (not a TTY); `dev:phone` also sets NO_COLOR=1.
const LINK = /magic link for \S+: (https?:\/\/\S+)/

const showQr = (line) => {
  const match = LINK.exec(line)
  if (match === null) return
  // The URL is a capture group, so it is always present when the regex matched.
  process.stdout.write(`\n${renderUnicodeCompact(match[1])}\n(open on the PHONE: ${match[1]})\n\n`)
}

createInterface({ input: process.stdin }).on("line", (line) => {
  process.stdout.write(`${line}\n`)
  showQr(line)
})
