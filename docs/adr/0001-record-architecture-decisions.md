# ADR-0001: Record architecture decisions as ADRs

Date: 2026-10-19 · Status: **accepted** (owner decision at kickoff; see
`docs/plan.md` "Amendments" and `docs/dev-system.md` §1.6)

## Context

Tanren is built by Claude Code agents whose only shared memory is the
repository. A decision taken in a chat transcript is gone when the session
ends; the next agent re-decides it, often differently, and nobody can tell a
deliberate choice from an accident. `docs/plan.md` is the constitution (stack,
hard rules, data model, build order) and says: "Ask before making
architectural decisions not covered here." We need one place where every such
decision and its reasons live, a status that says whether the owner has
confirmed it, and a rule for what deserves one.

## Decision

Every architectural decision is recorded as an Architecture Decision Record
(Nygard style): one Markdown file per decision in `docs/adr/`, named
`NNNN-slug.md`, four-digit sequence number, never reused. Sections in this
order: **Status, Context, Decision, Consequences, Alternatives considered.**
One page at most.

- Status is `proposed` (recorded by an agent, owner has not confirmed),
  `accepted` (confirmed by the owner, or already decided by the owner in the
  plan or a kickoff message), `superseded by NNNN`, or `deprecated`.
- An accepted ADR is not edited except to change its status and link its
  successor. Changing a decision means a new ADR.
- What needs an ADR: anything the plan does not cover; any deviation from the
  plan; any change of roles, gate or tooling; any choice of library or
  version where alternatives existed. Refinements inside what the plan fixes
  (field names, exact schemas) go to `docs/design/<topic>.md` instead and
  reference the ADRs they rely on.
- The architect writes ADRs (the Lead triggers it with `/adr`); engineers
  propose them in their reports under "Decisions". The Lead reserves numbers
  in the brief when several ADRs are written in parallel.
- Every `proposed` ADR is listed under "Decisions for the owner" in
  `docs/handoff.md` and in the session's final message until the owner
  accepts or rejects it. Task sheets list the ADRs a step relies on.

## Consequences

- Decisions survive sessions and model changes; briefs point at an ADR
  instead of re-explaining, which keeps context budgets small.
- The owner reviews decisions in one place and can veto a `proposed` ADR
  before code depends on it.
- Each ADR costs a few minutes to write; agents may over- or under-record.
  The rule of thumb above draws the line; the retro adjusts it.
- Numbers are allocated by hand; the Lead owns the sequence.

## Alternatives considered

- **Decisions inside `CLAUDE.md`.** Always loaded, so every decision costs
  context in every session, and history is lost on edit. Rejected;
  `CLAUDE.md` links to ADRs instead.
- **One `DECISIONS.md` log.** Grows without bound, poor diffs, no status per
  decision, no superseding. Rejected.
- **Decisions only in transcripts or the handoff.** Lost or stale within a
  session or two. Rejected; this is the problem being solved.
