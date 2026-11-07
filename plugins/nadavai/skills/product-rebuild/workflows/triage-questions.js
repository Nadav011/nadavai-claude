export const meta = {
  name: 'triage-questions',
  description: 'Decide every open question that a decision, the law or the clearly best option settles; adversarially verify each; group the rest into a few questions for the owner',
  phases: [
    { title: 'Triage', detail: 'one agent per group: decide or ask, with the basis' },
    { title: 'Verify', detail: 'an adversarial check on every decide; doubt sends it back to ask' },
    { title: 'Group', detail: 'the remaining questions merged into a few grouped questions' },
  ],
}

// args: { repo, questions_json, out_dir, groups: [..], owner_quote, max_questions? }
const A = args || {}
if (!A.repo || !A.questions_json || !A.out_dir || !Array.isArray(A.groups)) throw new Error('args: repo, questions_json, out_dir, groups[] are required')
const MAX = A.max_questions || 15
const OWNER = A.owner_quote ? `The owner's instruction: ${A.owner_quote}` : 'The owner asked: decide what you are sure of, ask him only the rest, in groups.'

const RULES = `Sources:
- \`${A.repo}/DECISIONS-ANSWERED.md\`. The newest number wins. Search it by keyword.
- The specs under \`${A.repo}/spec/\`, and each question's own "sources".

DECIDE (verdict "decide") only when one of these holds, and name which:
- (a) **decided:** a numbered decision answers it. Give the number(s).
- (b) **law:** a law or regulator rule forces it. Cite the law and the section. Wording that needs a lawyer is decided as "נוסח לאישור עו״ד".
- (c) **best:** one option is clearly the most advanced and professional, and it fits the owner's standing direction. It costs no money and changes no numbered decision. Say why the others are worse.

ASK whenever any of these holds:
- a fact only the owner knows
- money or a price
- anything sent to a real person
- it reverses or narrows a decision
- a taste choice he has not delegated
- the sources conflict
- you are not sure

When in doubt, ASK.`

const TS = { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, verdict: { type: 'string', enum: ['decide', 'ask'] }, basis: { type: 'string', enum: ['decided', 'law', 'best', 'none'] },
  choice: { type: 'integer' }, answer_he: { type: 'string' }, why_he: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } },
  required: ['id', 'verdict', 'basis', 'choice', 'answer_he', 'why_he', 'refs'] } } }, required: ['rows'] }
const VS = { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, keep: { type: 'boolean' }, reason: { type: 'string' } }, required: ['id', 'keep', 'reason'] } } }, required: ['rows'] }

const results = await pipeline(A.groups,
  g => agent(`${OWNER}

Triage the open questions in \`${A.questions_json}\` whose "group" is "${g}".
${RULES}

For each question return:
- verdict and basis
- choice: the 0-based option index, or -1
- answer_he: one plain Hebrew line
- why_he: one Hebrew line with the basis
- refs

Write \`${A.out_dir}/${g.replace(/\W+/g, '-')}.md\` as you go: a Hebrew table. Do not commit.`, { label: `triage:${g}`, phase: 'Triage', model: 'opus', schema: TS }),
  (t, g) => {
    const dec = (t && t.rows || []).filter(r => r.verdict === 'decide')
    if (!dec.length) return { rows: (t && t.rows) || [], verdicts: [] }
    return agent(`${OWNER}

Another agent decided these questions on the owner's behalf. Your job is to REFUTE each one.
Questions: \`${A.questions_json}\` (group "${g}"). Decisions: ${JSON.stringify(dec)}

${RULES}

For each decision:
- Open the cited decisions, any newer decision on the same subject, and the cited law or files.
- Set keep=true only if the basis holds and nothing newer contradicts it.
- Default to false when uncertain.

Give the reason in one Hebrew line.`, { label: `verify:${g}`, phase: 'Verify', model: 'opus', schema: VS }).then(v => ({ rows: t.rows, verdicts: (v && v.rows) || [] }))
  })

const all = results.filter(Boolean).flatMap(r => r.rows.map(row => {
  const v = r.verdicts.find(x => x.id === row.id)
  if (row.verdict === 'decide' && !(v && v.keep)) return { ...row, verdict: 'ask', demoted: v ? v.reason : 'not verified' }
  return row
}))
const decided = all.filter(r => r.verdict === 'decide')
const asked = all.filter(r => r.verdict === 'ask')
log(`decided ${decided.length}, ask ${asked.length}, demoted ${all.filter(r => r.demoted).length}`)

phase('Group')
const grouped = asked.length ? await agent(`${OWNER}

These open questions still need the owner: ${JSON.stringify(asked)}
The full text, options and sources are in \`${A.questions_json}\`, by id.

Turn them into as FEW grouped questions as possible, at most ${MAX}:
- Merge questions that one answer settles.
- Each grouped question has a Hebrew title, one plain Hebrew line, 2-4 full Hebrew options (the recommended one first), the why in one Hebrew line, and the ids it answers.
- Put facts only the owner knows into ONE "facts" question with free text.

Write \`${A.out_dir}/GROUPED.md\` and \`${A.out_dir}/grouped.json\`. Do not commit.`, { label: 'group', phase: 'Group', model: 'opus', schema: { type: 'object', properties: { grouped: { type: 'array', items: { type: 'object', properties: { gid: { type: 'string' }, title: { type: 'string' }, question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommended: { type: 'integer' }, why: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, free_text: { type: 'boolean' } }, required: ['gid', 'title', 'question', 'options', 'recommended', 'why', 'ids', 'free_text'] } } }, required: ['grouped'] } }) : { grouped: [] }

return { decided, asked: asked.map(a => a.id), demoted: all.filter(r => r.demoted).map(r => ({ id: r.id, why: r.demoted })), grouped: grouped && grouped.grouped }
