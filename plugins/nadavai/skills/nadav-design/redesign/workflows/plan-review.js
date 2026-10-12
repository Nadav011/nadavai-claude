export const meta = {
  name: 'redesign-plan-review',
  description: 'The redesign build plan: write the answers and plan items into it, fresh Opus reviews until APPROVE, diff-only confirms of every later edit, a second model (Codex, else Grok, else a fresh Opus), then the START-BUILD prompt and checklist; returns review gates, never Nadav\'s approval',
  whenToUse: 'nadav-design redesign mode step 8, only after Nadav opted into multi-agent orchestration',
  phases: [{ title: 'Plan write' }, { title: 'Plan review' }, { title: 'Second model' }, { title: 'Start build' }, { title: 'Checkpoint' }],
}

/* Launch: Workflow({ scriptPath: '<skill>/redesign/workflows/plan-review.js', args: {...} }). README «Build plan».
   {
     out: '~/design-redesign/<app>', skill: '<…>/skills/nadav-design/redesign', app: '/path/to/app',
     round: 'r3', date: '11.10',
     planItems: { file: 'state/r3/plan.json', n: 14 },  // optional: plan-track items from demo rounds (a file, never args)
     nonce: 'r3a',           // REQUIRED, fresh per run: names its snapshots (work/plan-snap-<nonce>-<tag>), so a rerun never
                             // diffs against an old one; there is no default, the round name repeats across runs
     write: true,            // false = review the plan as it stands (no writer pass first)
     maxReviews: 8,          // full reviews, 1-8
     secondModel: true,      // false stops before the second model: an explicit intermediate state, never ready for Nadav
     startBuild: true, commit: true,
   }
   Why the loop is shaped this way: on 2.10.2026 every full review that followed an APPROVE found new things and the
   plan flipped APPROVE/ITERATE for ten rounds. After an APPROVE only the diff of each edit is judged, and EVERY edit is
   followed by such a confirm: approval holds only when the last step is a confirm that says APPROVE.
   The result never says Nadav approved: gates.ownerApproved is always false. The parent shows him the plan and asks. */

const A = args || {}
if (!A.out || !A.skill) throw new Error('args.out and args.skill are required (redesign/README.md «Build plan»)')
const OUT = A.out, SK = A.skill, APP = A.app || '(not given)', R = A.round || 'r1'
const MAX = Math.min(8, Math.max(1, Number.isInteger(A.maxReviews) ? A.maxReviews : 8))
const CONF = 3 // diff-only confirms per edit chain
const p = f => (String(f).startsWith('/') ? f : `${OUT}/${f}`)
if (!A.nonce) throw new Error('args.nonce is required: a fresh name for this run\'s snapshots (the round name repeats across runs)')
const NONCE = String(A.nonce).replace(/[^\w.-]/g, '')
const snap = t => `${OUT}/work/plan-snap-${NONCE}-${t}`

const MACHINE = `MACHINE RULES: scratch goes under ${OUT}/work/, never /tmp (a reboot wipes it). Never commit, push or deploy unless your task says so. Never print a secret value.`
const PCTX = `REDESIGN BUILD PLAN in ${OUT} (its own git repo): plan/build-plan.md (units cite demo column labels as \`s-<id>\` «label», copied verbatim), plan/HISTORY.md (one line per change, newest first), plan/reviews/ (each review saved as <name>.json by the writer that answers it). Sources: DECISIONS-ANSWERED.md (never re-decide an answer), FEATURES-PROPOSED.md (every row ends as a unit, an after-the-core unit or a «Not built» row), INVENTORY.md, BRIEF.md, the demo sections, and the app at ${APP} (read-only; work already merged on its main branch is marked done, not planned again). Template: ${SK}/templates/build-plan.md. After any edit: (cd ${OUT} && python3 tools/check-anchors.py --config redesign.json) must exit 0 (0 missing, 0 wrong, no unknown screen, no stale unit id); every reply reports its exit code and numbers in "anchors". Status lines are exact tokens: \`Status: DRAFT\` until Nadav approves, then \`Status: OWNER-APPROVED answer <N> commit <sha>\` (only the parent writes that one); any explanation goes on the next line, never on the status line.
Convergence rule: fix a finding by simplifying, never by adding machinery that breeds new findings; when a rule keeps producing edge cases, cut it back to the simplest form a person can apply.
SEVERITY: HIGH = following the plan would ship something wrong or unsafe, or break one of Nadav's answers. MEDIUM = the build session would be blocked or forced to guess, or two parts contradict. LOW = everything else.
${MACHINE}`

const ISSUE = { type: 'object', properties: { severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] }, where: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'where', 'what', 'fix'] }
const ANCHORS = { type: 'object', properties: { exit_code: { type: 'integer' }, missing: { type: 'integer' }, wrong: { type: 'integer' }, unknown: { type: 'integer' }, stale: { type: 'integer' } }, required: ['exit_code', 'missing', 'wrong', 'unknown', 'stale'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['APPROVE', 'ITERATE', 'REJECT'] }, summary: { type: 'string' }, findings: { type: 'array', items: ISSUE }, anchors: ANCHORS }, required: ['verdict', 'summary', 'findings', 'anchors'] }
const OUTCOME = { type: 'object', properties: { i: { type: 'integer' }, done: { type: 'string', enum: ['changed', 'rejected'] }, note: { type: 'string' } }, required: ['i', 'done', 'note'] }
const WRITE = { type: 'object', properties: { units: { type: 'integer' }, changed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, outcomes: { type: 'array', items: OUTCOME }, anchors: ANCHORS, summary: { type: 'string' } }, required: ['units', 'changed', 'rejected', 'outcomes', 'anchors', 'summary'] }
const SECOND = { type: 'object', properties: { reviewer: { type: 'string', enum: ['codex', 'grok', 'none'] }, verdict: { type: 'string', enum: ['APPROVE', 'ITERATE', 'REJECT'] }, summary: { type: 'string' }, findings: { type: 'array', items: ISSUE } }, required: ['reviewer', 'verdict', 'summary', 'findings'] }
const DONE = { type: 'object', properties: { committed: { type: 'boolean' }, sha: { type: 'string' }, summary: { type: 'string' } }, required: ['committed', 'sha', 'summary'] }

// Every agent on Opus: after a usage-limit resume on 29.9.2026 agents silently ran on a smaller model.
const run = async (prompt, opts, tries = 2) => {
  for (let t = 0; t < tries; t++) {
    const r = await agent(prompt, { model: 'opus', ...opts, label: t ? `${opts.label}~retry${t}` : opts.label })
    if (r) return r
    log(`[${opts.label}] returned nothing (attempt ${t + 1}/${tries})`)
  }
  return null
}
const checkpoint = what => A.commit === false ? null : run(`${MACHINE}
CHECKPOINT COMMIT of the output repo ${OUT} after «${what}». Run git -C ${OUT} status --short. Stage everything .gitignore allows except files over 5 MB (list those). When something is staged, commit it as «chore(redesign): ${R} plan, ${what}». Never push, amend or force. Return the DONE shape.`, { label: `checkpoint:${what}`, phase: 'Checkpoint', schema: DONE, effort: 'low' })

let last = null // the newest WRITE result
let anchors = null // the newest check-anchors numbers any agent reported (writer or reviewer): the plan's anchor gate
const note = w => { if (w) { last = w; anchors = w.anchors } return w }
const seen = v => { if (v && v.anchors) anchors = v.anchors; return v }
// approval by the rubric: APPROVE with nothing HIGH or MEDIUM left, whatever the verdict word says
const blockingIn = v => v.findings.some(f => f.severity !== 'LOW')
const ok = v => !!v && v.verdict === 'APPROVE' && !blockingIn(v)
// The baseline of the next diff-only confirm: plan/ copied to <snap>/plan/, START-BUILD.md to <snap>/START-BUILD.md.
const SNAPSHOT = t => `FIRST take the baseline: rm -rf ${snap(t)} && mkdir -p ${snap(t)} && cp -r ${OUT}/plan ${snap(t)}/plan && (cp ${OUT}/START-BUILD.md ${snap(t)}/START-BUILD.md 2>/dev/null || true). The next reviewer diffs it against today.`
const planFix = async (t, findings, what) => note(await run(`${PCTX}
WRITER (${what}). ${SNAPSHOT(t)} Save the findings below as plan/reviews/${t}.json. Then apply them, smallest wording change first; reject a wrong one with its reason in plan/HISTORY.md. Rerun check-anchors and log the round in plan/HISTORY.md.
FINDINGS (numbered from 0): ${JSON.stringify(findings, null, 1)}
Return the WRITE shape, with one entry in "outcomes" per finding: its number i, "changed" or "rejected", and a one-line note.`, { label: `plan-fix:${t}`, phase: 'Plan review', schema: WRITE, effort: 'xhigh' }))
const fullReview = async (label, extra) => seen(await run(`${PCTX}
You are a FRESH plan reviewer with a clean context, READ-ONLY: never edit a file. Review the WHOLE plan as the build session will use it, with extra care on everything plan/HISTORY.md lists since the last approval: each change correct, consistent with the rest of the plan and with Nadav's answers, in the right unit, testable; no machinery the convergence rule forbids; check-anchors passing (run it). ${extra || ''}
Verdict APPROVE when nothing HIGH or MEDIUM remains, and still list every LOW: Nadav wants those fixed too.`, { label, phase: 'Plan review', schema: VERDICT, effort: 'xhigh' }, 3))
const diffConfirm = async (t, changed) => seen(await run(`${PCTX}
You are a FRESH plan reviewer with a clean context, READ-ONLY, confirming ONE edit. Diff the baseline against today: diff -ruN ${snap(t)}/plan ${OUT}/plan and diff -uN ${snap(t)}/START-BUILD.md ${OUT}/START-BUILD.md (-N: a file that is new or gone shows in full). The writer says it changed: ${JSON.stringify(changed || [])}. Judge ONLY that diff: is every change correct, consistent with the rest of the plan and with Nadav's answers, did it change only what it says, and did it break anything (run check-anchors)? Report a HIGH or MEDIUM only when the diff introduced it or failed to fix what it set out to fix.
Verdict APPROVE when the diff introduced nothing HIGH or MEDIUM; list every LOW.`, { label: `plan-confirm:${t}`, phase: 'Plan review', schema: VERDICT, effort: 'xhigh' }, 3))
// Confirm the edit made under tag t; fix what the confirm finds and confirm again, at most CONF times. Approval holds
// only when the LAST step is a confirm that says APPROVE; LOWs it still lists are reported, never edited unchecked.
const confirmEdits = async (t, changed) => {
  let tag = t, what = changed
  for (let i = 1; ; i++) {
    const c = await diffConfirm(tag, what)
    if (!c) return { approved: false, open: [], why: `confirm ${tag} returned nothing` }
    log(`diff-only confirm ${tag}: ${c.verdict}, ${c.findings.length} findings`)
    if (!c.findings.length || i === CONF) return { approved: ok(c), open: c.findings, why: ok(c) ? '' : `confirm ${tag}: ${c.verdict}, ${blockingIn(c) ? 'HIGH or MEDIUM still open' : 'not approved'}` }
    tag = `${t}.${i}`
    const fx = await planFix(tag, c.findings, `what confirm ${t} round ${i} found`)
    if (!fx) return { approved: false, open: c.findings, why: `fix ${tag} returned nothing` }
    what = fx.changed
  }
}

// ---------------- write ----------------
if (A.write !== false) {
  phase('Plan write')
  note(await run(`${PCTX}
WRITER. Update plan/build-plan.md (create it from the template when it does not exist). Integrate, with one line per change in plan/HISTORY.md: (1) every answer in DECISIONS-ANSWERED.md the plan does not carry yet; (2) every row of FEATURES-PROPOSED.md (a unit, an after-the-core unit, or a «Not built» row with the answer that says so); (3) ${A.planItems ? `the ${A.planItems.n} plan items in ${p(A.planItems.file)} (re-check each against the current plan; some may be done)` : 'nothing else'}. Each unit: id, title, files, the demo states it builds cited as \`s-<id>\` «<column label>» copied verbatim from the section, acceptance, size, dependencies, State «todo», and «go» when it needs Nadav's explicit go (migrations, auth, payments, store publishing, paid services). The status line reads exactly \`Status: DRAFT\`. Then run check-anchors: exit 0.
Return the WRITE shape.`, { label: 'plan-write', phase: 'Plan write', schema: WRITE, effort: 'xhigh' }))
  log(last ? `plan write: ${last.units} units, ${last.changed.length} changes, check-anchors exit ${last.anchors.exit_code}` : 'plan write returned nothing')
  await checkpoint('write')
}

// ---------------- full reviews until APPROVE; then every edit is diff-confirmed ----------------
phase('Plan review')
const reviews = []
let approved = false, open = [], stop = ''
if (A.write !== false && !last) stop = 'the writer returned nothing'
for (let r = 1; r <= MAX && !approved && !stop; r++) {
  const v = await fullReview(`plan-review:${R}-${r}`)
  if (!v) { stop = `review ${r} returned nothing`; break }
  reviews.push({ round: r, verdict: v.verdict, n: v.findings.length, summary: v.summary.slice(0, 300) })
  log(`review ${r}: ${v.verdict}, ${v.findings.length} findings`)
  if (ok(v) && !v.findings.length) { approved = true; break }
  if (ok(v)) {
    // APPROVE with LOWs only: fix them, then only the diff is judged
    const fx = await planFix(`${R}-${r}`, v.findings, `the LOW findings of review ${r}`)
    if (!fx) { stop = `fix ${r} returned nothing`; break }
    const res = await confirmEdits(`${R}-${r}`, fx.changed)
    approved = res.approved
    open = res.open
    if (!approved) stop = res.why
    break
  }
  // ITERATE, REJECT, or an APPROVE that still lists a HIGH or MEDIUM: fix, then a full review again
  if (r === MAX) { stop = `still ${v.verdict} after ${MAX} full reviews`; break } // no edit that nobody would check
  if (!(await planFix(`${R}-${r}`, v.findings, `fix round ${r}`))) { stop = `fix ${r} returned nothing`; break }
}
await checkpoint('reviews')
if (!approved) log(`the plan is NOT approved: ${stop || 'no APPROVE'}`)

// ---------------- second model (never skipped when the plan is to reach Nadav) ----------------
let second = null
if (approved && A.secondModel === false) log('secondModel false: stopping before the second model; the plan is NOT ready for Nadav')
if (approved && A.secondModel !== false) {
  phase('Second model')
  const sm = await run(`${PCTX}
SECOND-MODEL CROSS-CHECK, read-only for the plan. Run Codex from ${OUT}: omc ask codex "<question>". Never pass -m or an effort flag: the config default (gpt-6.1-sol at xhigh) is the only allowed model. If Codex cannot run (quota, missing binary, error, timeout), run omc ask grok with the same question instead. The question: review plan/build-plan.md (and START-BUILD.md when it exists) as the build session will use them, against DECISIONS-ANSWERED.md and the demo sections; report HIGH, MEDIUM and LOW findings with the exact place and fix, and a verdict (APPROVE only when nothing HIGH or MEDIUM). Read the artifact file omc prints and return its verdict and findings faithfully, with reviewer "codex" or "grok"; reviewer "none" when neither ran (say why in the summary).`, { label: 'second-model', phase: 'Second model', schema: SECOND, effort: 'high' })
  if (sm && sm.reviewer !== 'none') second = { ...sm }
  else {
    // a fresh Opus with a clean context reviews in Codex's place; its verdict counts like Codex's
    log(`neither Codex nor Grok ran (${sm ? sm.summary.slice(0, 160) : 'agent returned nothing'}): a fresh Opus reviews instead`)
    const o = await fullReview(`plan-review:second-opus`, 'You stand in for the second model: be adversarial, look for what the earlier reviews missed.')
    second = o && { reviewer: 'opus', verdict: o.verdict, summary: o.summary, findings: o.findings }
  }
  log(second ? `second model (${second.reviewer}): ${second.verdict}, ${second.findings.length} findings` : 'second model: no reviewer returned anything')
  if (!second) approved = false
  else if (second.findings.length) {
    const fx = await planFix(`${R}-second`, second.findings, `the ${second.reviewer} findings that hold`)
    // what was done with each finding, for Nadav: per finding, from the writer's outcomes
    second.findings = second.findings.map((f, i) => { const o = fx && (fx.outcomes || []).find(x => x.i === i); return { ...f, done: o ? o.done : 'no outcome reported', note: o ? o.note : '' } })
    if (!fx) approved = false
    else { const res = await confirmEdits(`${R}-second`, fx.changed); approved = res.approved; open = res.open }
  } else if (!ok(second)) approved = false // a rejection with nothing to fix still blocks
  await checkpoint('second model')
}

// ---------------- START-BUILD ----------------
let startBuild = null
if (approved && second && A.startBuild !== false) {
  phase('Start build')
  startBuild = note(await run(`${PCTX}
WRITER. ${SNAPSHOT(`${R}-start`)} From ${SK}/templates/START-BUILD.md write ${OUT}/START-BUILD.md (the paste prompt for the build session, with the real paths and the demo link; its status line reads exactly \`Status: DRAFT\`; the line under it says it waits for Nadav's approval) and plan/START-BUILD-CHECKLIST.md (the pre-start gate: every item a command with its expected result, run from the output repo where it says so). Nothing in them may contradict the plan; check-anchors must still pass. Return the WRITE shape.`, { label: 'start-build', phase: 'Start build', schema: WRITE, effort: 'xhigh' }))
  if (!startBuild) approved = false
  else { const res = await confirmEdits(`${R}-start`, startBuild.changed); approved = res.approved; open = res.open }
  await checkpoint('START-BUILD')
}

// Gates from structured fields only. Reviewer approval is not Nadav's approval.
const anchorsClean = !!(anchors && anchors.exit_code === 0 && !anchors.missing && !anchors.wrong && !anchors.unknown && !anchors.stale)
const gates = {
  reviewApproved: approved && anchorsClean,
  anchorsClean,
  secondModel: second ? second.reviewer : (A.secondModel === false ? 'skipped' : 'not run'),
  startBuildWritten: !!startBuild,
  readyForOwner: approved && anchorsClean && !!second && (A.startBuild === false || !!startBuild),
  ownerApproved: false,
}
log(`plan gates: ${JSON.stringify(gates)}`)
return { gates, units: last && last.units, reviews, open, stop, second: second && { reviewer: second.reviewer, verdict: second.verdict, summary: second.summary.slice(0, 600), findings: second.findings } }
