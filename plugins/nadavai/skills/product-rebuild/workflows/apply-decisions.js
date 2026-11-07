export const meta = {
  name: 'apply-decisions',
  description: 'Write a range of numbered owner decisions into every domain spec, close their open questions, then recount the index and gaps',
  phases: [
    { title: 'Apply', detail: 'one applier per domain file' },
    { title: 'Close', detail: 'recount, index, remaining questions' },
  ],
}

// args: { repo, spec_dir, domains: ['01-shell', ..], from: 431, to: 508, watch: ['#490: ...', ..], coverage_file? }
const A = args || {}
if (!A.repo || !A.spec_dir || !Array.isArray(A.domains) || !A.from || !A.to) throw new Error('args: repo, spec_dir, domains[], from, to are required')
const WATCH = (A.watch || []).map(w => `   - ${w}`).join('\n')

phase('Apply')
const applied = await parallel(A.domains.map(d => () => agent(`Write the new decisions into \`${A.spec_dir}/${d}.md\`, and that file ONLY.

Read rows #${A.from}-#${A.to} of \`${A.repo}/DECISIONS-ANSWERED.md\`. The newest number wins over any older decision and over anything the spec says today.

For every decision that touches this domain:
1. Change the blocks it affects, so that every block's states, defaults, wording and acceptance tests match. Cite the number.
2. Remove the matching row from "Open questions".
3. If the decision contradicts another block in this file, fix that block too.
${WATCH ? `4. Watch these in particular:\n${WATCH}` : ''}

Self-made changes: every change beyond what a decision says goes in your return as one Hebrew line under "לנדב, בקצרה", in clean Hebrew. Append "decisions: #N applied" lines to \`## Review log\`. Do not commit. Return the counts.`, { label: `apply:${d}`, phase: 'Apply', model: 'opus', schema: { type: 'object', properties: { decisions_applied: { type: 'integer' }, open_questions_closed: { type: 'integer' }, open_questions_left: { type: 'integer' }, notes_for_owner_he: { type: 'array', items: { type: 'string' } } }, required: ['decisions_applied', 'open_questions_closed', 'open_questions_left', 'notes_for_owner_he'] } })))

phase('Close')
const recount = await agent(`Recount the domain specs in \`${A.spec_dir}\`, then rewrite \`${A.spec_dir}/00-INDEX.md\` and \`${A.spec_dir}/GAPS.md\` from the files.

Check:
- ${A.coverage_file ? `Every id in \`${A.coverage_file}\`` : 'Every capability id'} has exactly one owner, and each half of a split id names the other by id.
- Every "Open questions" row and every open contradiction left in any spec. Settle each one against \`${A.repo}/DECISIONS-ANSWERED.md\`. List whatever is still open, grouped by who answers it: the owner, the spec owners, research, counsel or the CPA.

Keep the Hebrew summary at the top. Do not commit.`, { label: 'recount', phase: 'Close', model: 'opus', schema: { type: 'object', properties: { specced: { type: 'integer' }, missing: { type: 'array', items: { type: 'string' } }, duplicated: { type: 'array', items: { type: 'string' } }, contradictions_open: { type: 'integer' }, questions_left: { type: 'array', items: { type: 'string' } } }, required: ['specced', 'missing', 'duplicated', 'contradictions_open', 'questions_left'] } })

return { applied: applied.map((r, i) => r && { domain: A.domains[i], ...r }).filter(Boolean), recount }
