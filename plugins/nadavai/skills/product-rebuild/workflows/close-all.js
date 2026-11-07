export const meta = {
  name: 'close-all',
  description: 'Find every open end in every dimension, merge them into one ledger with one status each, close the doc-only ones, and let a critic name what is still missing',
  phases: [
    { title: 'Find', detail: 'one read-only finder per dimension' },
    { title: 'Ledger', detail: 'dedupe into one ledger' },
    { title: 'Close', detail: 'doc-only closers per file' },
    { title: 'Critic', detail: 'missing dimensions and unproven closes' },
  ],
}

// args: { repo, out_dir, date, context, finders: [{ k, p }], protected: ['/spec/', '/proto/', ...] }
const A = args || {}
if (!A.repo || !A.out_dir || !A.date || !Array.isArray(A.finders) || !A.finders.length) throw new Error('args: repo, out_dir, date, finders[] are required')
const PROTECTED = A.protected || []
const CTX = `Context: output repo \`${A.repo}\` (docs only). Decisions: \`${A.repo}/DECISIONS-ANSWERED.md\`, the newest wins.
${A.context || ''}
Never write to the app repo. Never send anything to anyone.`

const STATUSES = ['closed_now_verified', 'running_lane', 'doc_fix', 'needs_nadav', 'launch_gate', 'build_plan', 'external_session', 'decided_not']
const IS = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  key: { type: 'string' }, dimension: { type: 'string' }, what: { type: 'string' }, source: { type: 'string' },
  status: { type: 'string', enum: STATUSES }, evidence: { type: 'string' }, owner_or_lane: { type: 'string' }, fix_instruction: { type: 'string' }, file_to_change: { type: 'string' } },
  required: ['key', 'dimension', 'what', 'source', 'status', 'evidence', 'owner_or_lane', 'fix_instruction', 'file_to_change'] } } }, required: ['items'] }

phase('Find')
const found = await parallel(A.finders.map(f => () => agent(`${CTX}

You are a read-only finder for the dimension "${f.k}". Do not edit any file.

${f.p}

For every item give:
- a stable key
- the dimension
- what it is (short, in English)
- the source file:line
- the status
- the evidence you checked
- the owner or lane
- an exact fix_instruction
- file_to_change ("" if none)

Statuses:
- closed_now_verified: done, and you checked the disk
- running_lane: a running lane covers it; name it
- doc_fix: an agent can fix it now in a doc that is NOT under: ${PROTECTED.join(', ') || 'nothing'}
- needs_nadav: a real choice, or only he can do it
- launch_gate: a check on real people or devices before launch
- build_plan: belongs in the build plan
- external_session: another session owns it
- decided_not: a decision rules it out; cite the number

Be exhaustive.`, { label: `find:${f.k}`, phase: 'Find', model: 'opus', schema: IS })))
const all = found.filter(Boolean).flatMap(r => r.items)
log(`found ${all.length} items from ${found.filter(Boolean).length}/${A.finders.length} finders`)

phase('Ledger')
const ledger = await agent(`${CTX}

Here are ${all.length} open-end items: ${JSON.stringify(all)}

1. Merge the duplicates.
2. Write ONE ledger, \`${A.out_dir}/LEDGER-${A.date}.md\`, in sections as you go:
   - \`## לנדב, בקצרה\` in clean Hebrew:
     - the totals by status
     - what is now closed
     - what only Nadav can do, as a short numbered list of plain actions
     - what waits on counsel, the CPA or other sessions
     - what goes into the build plan or the launch gates
   - one table per status
3. Write \`${A.out_dir}/ledger.json\`.

Return the doc_fix items grouped by file, and the needs_nadav list, as Hebrew questions with options and the recommended index.`, { label: 'ledger', phase: 'Ledger', model: 'opus', schema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, fix_instruction: { type: 'string' } }, required: ['key', 'fix_instruction'] } } }, required: ['file', 'items'] } }, needs_nadav: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, ask_he: { type: 'string' }, options_he: { type: 'array', items: { type: 'string' } }, recommended: { type: 'integer' } }, required: ['key', 'ask_he', 'options_he', 'recommended'] } } }, required: ['groups', 'needs_nadav'] } })

phase('Close')
const groups = ((ledger && ledger.groups) || []).filter(g => g.file && !PROTECTED.some(p => g.file.includes(p)))
const skipped = ((ledger && ledger.groups) || []).length - groups.length
if (skipped) log(`skipped ${skipped} doc_fix groups in protected paths; they stay in the ledger`)
const closed = await parallel(groups.map(g => () => agent(`${CTX}

Close these open ends by editing \`${g.file}\` only. Create the file if the instruction says to write a new one.
Items: ${JSON.stringify(g.items)}

Rules:
- Ground every change in the cited decision or evidence.
- Report self-made changes as Hebrew lines under "לנדב, בקצרה".
- No personal data.
- Do not commit.

Return the keys closed and the keys not closed, with the reason for each.`, { label: `close:${g.file.split('/').pop()}`, phase: 'Close', model: 'opus', schema: { type: 'object', properties: { closed: { type: 'array', items: { type: 'string' } }, not_closed: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, why: { type: 'string' } }, required: ['key', 'why'] } }, notes_for_owner_he: { type: 'array', items: { type: 'string' } } }, required: ['closed', 'not_closed', 'notes_for_owner_he'] } })))

phase('Critic')
const critic = await agent(`${CTX}

You are a completeness critic. Read \`${A.out_dir}/LEDGER-${A.date}.md\` and \`${A.out_dir}/ledger.json\`, and ask what is still missing:
- a dimension nobody checked: security, accessibility, performance, data migration, support, pricing, native apps, analytics, backups, operator and admin, other verticals, integrations
- an item marked closed without real evidence
- a promise to the owner that is not in the ledger

Append \`## מבקר: מה עוד חסר\` to the ledger. Edit nothing else. Return the gaps.`, { label: 'critic', phase: 'Critic', model: 'opus', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, closes_it: { type: 'string' }, needs_nadav: { type: 'boolean' } }, required: ['what', 'closes_it', 'needs_nadav'] } } }, required: ['gaps'] } })

return { items: all.length, needs_nadav: ledger && ledger.needs_nadav, closed: closed.filter(Boolean), critic_gaps: critic && critic.gaps }
