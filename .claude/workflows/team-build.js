export const meta = {
  name: 'team-build',
  description: 'Company mode build: foundation engineer, then parallel feature teams (team-lead agents), then integration, cross-team review and QA',
  whenToUse: 'A build step split into two or more teams with frozen contracts. Args: { step: number, foundation?: string, teams: [{ name, charter }], integration: string, doneCriteria: string }',
  phases: [
    { title: 'Foundation', detail: 'contracts + dependencies so every team compiles alone' },
    { title: 'Teams', detail: 'one team-lead per feature area, concurrently' },
    { title: 'Integration', detail: 'one engineer wires the teams together' },
    { title: 'Verify', detail: 'cross-team review, then QA' },
  ],
}

// Plain JavaScript (not repo code): the functional lint rules do not apply here.
if (!args || !Array.isArray(args.teams) || args.teams.length === 0) {
  throw new Error('team-build needs args.teams: [{ name, charter }]')
}
if (!args.integration || !args.doneCriteria) {
  throw new Error('team-build needs args.integration (brief) and args.doneCriteria')
}
const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s || '')

phase('Foundation')
const foundation = args.foundation
  ? await agent(args.foundation, { label: 'foundation', phase: 'Foundation', agentType: 'engineer' })
  : 'No foundation task: contracts were already in place.'
log('foundation finished')

phase('Teams')
// Barrier is deliberate: integration needs every team report.
const reports = await parallel(
  args.teams.map((t) => () =>
    agent(
      `${t.charter}\n\n## Foundation report (for context, do not redo it)\n${clip(foundation, 6000)}`,
      { label: `team:${t.name}`, phase: 'Teams', agentType: 'team-lead' },
    ),
  ),
)
const teamReports = args.teams.map((t, i) => ({ name: t.name, report: reports[i] }))
const missing = teamReports.filter((t) => !t.report).map((t) => t.name)
if (missing.length) log(`teams without a report: ${missing.join(', ')}`)

phase('Integration')
const integration = await agent(
  `${args.integration}\n\n## Team reports\n${teamReports
    .map((t) => `### ${t.name}\n${clip(t.report, 8000)}`)
    .join('\n\n')}`,
  { label: 'integration', phase: 'Integration', agentType: 'engineer' },
)

phase('Verify')
const review = await agent(
  `Cross-team review for build step ${args.step ?? '?'}. Scope: all uncommitted changes. ` +
    `Pay special attention to the seams between teams and to the frozen contracts.\n\n## Done-criteria\n${args.doneCriteria}\n\n` +
    `## Integration report\n${clip(integration, 6000)}`,
  { label: 'review', phase: 'Verify', agentType: 'reviewer' },
)
const qa = await agent(
  `Verify build step ${args.step ?? '?'} against these done-criteria:\n${args.doneCriteria}\n\n` +
    `## Review findings (fixes may still be pending; report what you observe)\n${clip(review, 6000)}`,
  { label: 'qa', phase: 'Verify', agentType: 'qa' },
)

return { foundation, teams: teamReports, integration, review, qa }
