export const meta = {
  name: 'review-fanout',
  description: 'Parallel multi-dimension code review of the working tree with adversarial verification of every finding',
  whenToUse: 'Large diffs (roughly 400+ lines), integration reviews in company mode, or when the Lead wants independent reviewers per dimension. Args: { scope?: string, brief?: string, verifyVotes?: number }',
  phases: [
    { title: 'Review', detail: 'one read-only reviewer per dimension' },
    { title: 'Verify', detail: 'independent skeptics try to refute each finding' },
  ],
}

// Plain JavaScript (not repo code): the functional lint rules do not apply here.
const scope =
  (args && args.scope) ||
  'all uncommitted changes: `git status --short`, `git diff`, and untracked files read whole'
const brief =
  (args && args.brief) ||
  'No brief supplied. Review against CLAUDE.md hard rules, .claude/rules/*.md and the package CLAUDE.md files.'
const votes = (args && args.verifyVotes) || 3

const ROLE =
  'You are the Tanren reviewer role: read-only. Anchor every finding to a file:line you actually read. ' +
  'Never invent findings to look thorough; an empty list is a valid result. Return findings only.'

const DIMENSIONS = [
  {
    key: 'hard-rules',
    prompt:
      'Review ONLY for violations of the Tanren hard rules: no throw, no any, no non-null assertions, ' +
      'no unexplained as-casts, no let, no mutation, no class outside adapters (Context.Tag, ' +
      'Data.TaggedError and Schema.Class subclasses are allowed), Option over null, readonly everywhere, ' +
      'exhaustive Match.',
  },
  {
    key: 'effect-idioms',
    prompt:
      'Review ONLY for Effect idiom problems: services must be Context.Tag + Layer; no runSync/runPromise ' +
      'outside entry points and tests; error channels must be typed; Schema.decodeUnknown at boundaries; ' +
      'Effect.die only for defects; Clock/Random services instead of Date.now()/Math.random().',
  },
  {
    key: 'correctness',
    prompt:
      'Review ONLY for correctness defects: wrong logic, off-by-one, Option/undefined mishandling, ' +
      'encode/decode asymmetry, timestamp or timezone bugs, missing sync columns, ' +
      'exactOptionalPropertyTypes pitfalls, tests that cannot fail.',
  },
  {
    key: 'brief-and-tests',
    prompt:
      'Review ONLY brief compliance and tests: every done-criterion met with evidence; nothing outside the ' +
      "brief's scope changed without explanation; tests cover the stated behaviour including failure paths " +
      'and follow .claude/rules/tests.md. The brief:\n' +
      brief,
  },
  {
    key: 'boundaries',
    prompt:
      'Review ONLY package boundaries and structure: shared depends only on effect; db on shared; worker on ' +
      'db + shared; mobile on shared; no deep imports; exports through the package index; package CLAUDE.md ' +
      'still truthful; no stray README or ad-hoc docs; dependencies declared in the pnpm catalog.',
  },
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocking', 'should', 'nit'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          rule: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'line', 'rule', 'problem', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

const ORDER = { blocking: 0, should: 1, nit: 2 }
const LENSES = [
  'quote the exact rule or spec and check the code really violates it',
  'read the surrounding code: does it actually behave as the finding claims',
  'is the proposed fix correct, minimal, and inside the brief scope',
]

phase('Review')
// Barrier is deliberate: findings are de-duplicated across dimensions before the (expensive) verify stage.
const rounds = await parallel(
  DIMENSIONS.map((d) => () =>
    agent(`${d.prompt}\n\nScope: ${scope}\n\n${ROLE}`, {
      label: `review:${d.key}`,
      phase: 'Review',
      agentType: 'reviewer',
      schema: FINDINGS,
    }),
  ),
)

const byKey = new Map()
for (const r of rounds.filter(Boolean)) {
  for (const f of r.findings) {
    const k = `${f.file}:${f.line}`
    const prev = byKey.get(k)
    if (!prev || ORDER[f.severity] < ORDER[prev.severity]) byKey.set(k, f)
  }
}
const findings = [...byKey.values()]
log(`${findings.length} unique findings from ${rounds.filter(Boolean).length}/${DIMENSIONS.length} reviewers`)
if (findings.length === 0) return { verdict: 'APPROVE', confirmed: [], refuted: [] }

phase('Verify')
const judged = await parallel(
  findings.map((f) => () => {
    const n = f.severity === 'blocking' ? votes : 1
    return parallel(
      Array.from({ length: n }, (_, i) => () =>
        agent(
          `A reviewer claims this finding in the Tanren working tree:\n${JSON.stringify(f, null, 2)}\n\n` +
            `Read ${f.file} around line ${f.line} and whatever else you need. Your lens: ${LENSES[i % LENSES.length]}. ` +
            'Try to REFUTE the finding. If it is wrong, exaggerated, already handled, or you are uncertain, ' +
            'answer refuted=true with the reason. Read-only.',
          {
            label: `verify:${f.file.split('/').pop()}:${f.line}`,
            phase: 'Verify',
            agentType: 'reviewer',
            schema: VERDICT,
            effort: 'medium',
          },
        ),
      ),
    ).then((vs) => {
      const valid = vs.filter(Boolean)
      const refutes = valid.filter((v) => v.refuted).length
      const survives = valid.length > 0 && refutes * 2 < valid.length
      return { ...f, survives, votes: valid }
    })
  }),
)

const confirmed = judged
  .filter(Boolean)
  .filter((j) => j.survives)
  .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
const refuted = judged.filter(Boolean).filter((j) => !j.survives)
log(`${confirmed.length} confirmed, ${refuted.length} refuted`)

return {
  verdict: confirmed.some((f) => f.severity === 'blocking') ? 'REQUEST CHANGES' : 'APPROVE',
  confirmed: confirmed.map(({ votes: vs, survives: _s, ...f }) => ({
    ...f,
    confirmedBy: vs.length - vs.filter((v) => v.refuted).length,
    of: vs.length,
  })),
  refuted: refuted.map((f) => ({
    file: f.file,
    line: f.line,
    problem: f.problem,
    reasons: f.votes.map((v) => v.reason),
  })),
}
