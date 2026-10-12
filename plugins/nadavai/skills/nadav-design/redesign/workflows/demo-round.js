export const meta = {
  name: 'redesign-demo-round',
  description: 'One redesign demo round: spec of new answers, fix lanes by screen group, cross-lane requests in two passes, a full rebuild, one full fresh Opus verify by lenses, fixes for everything it found, bounded targeted confirms that account for every finding, then CHANGES, the committed round state and a checkpoint commit of the output repo',
  whenToUse: 'nadav-design redesign mode steps 3 and 6, only after Nadav opted into multi-agent orchestration',
  phases: [
    { title: 'Spec' }, { title: 'Lanes' }, { title: 'Requests' }, { title: 'Rebuild' },
    { title: 'Verify' }, { title: 'Fix' }, { title: 'Confirm' }, { title: 'Changes' }, { title: 'Checkpoint' },
  ],
}

/* Launch: Workflow({ scriptPath: '<skill>/redesign/workflows/demo-round.js', args: {...} }). Read redesign/README.md «Rounds».
   args carries small values only. Anything large (items, findings, rejected lists) travels in a FILE whose path is
   passed here, because workflow args over ~57 KB fail.
   {
     out: '~/design-redesign/<app>',  // the output repo: redesign.json, sections/, css/, parts/, tools/, docs
     skill: '<…>/skills/nadav-design/redesign',       // this folder (README.md, templates/)
     app: '/path/to/app',                             // read-only source of today's behaviour
     round: 'r3', date: '11.10',                      // history/<id>/<round>-<nonce>-<tag>/, changelog lines «r3 · 11.10 · …»
     screens: ['<id>', ...],                          // every screen id, in redesign.json order
     laneSize: 4, auditSize: 7,                       // screens per fix lane / per verify group (README «Scale»)
     lanes: [['<id>', '<id>'], ...],                  // optional explicit fix lanes (overrides laneSize)
     mode: 'fix',                                     // 'build' = first demo build from INVENTORY.md; 'fix' = apply items
     spec: 'answers/r3.md',                           // optional: new answers a read-only spec agent turns into items
     items: [{ ids: ['<id>'], file: 'work/items/r3-<id>.json', n: 12, sources: { 'I-r3-4': 'answer 23' } }],
                                                      // optional per-lane item files; sources names every item that
                                                      // carries Nadav's answer (ids unique in the round, e.g. I-<round>-<n>)
     shared: { file: 'work/items/r3-shared.json', n: 3, sources: {} },   // optional items for parts/*
     story: { screens: ['<ids of the journey, from STORY.md>'], file: 'STORY.md' },  // required for a green gate
     rejected: 'state/r2/rejected.json',              // optional: rejections of earlier rounds
     startAt: 'spec',                                 // spec, or a continuation: rebuild | verify | confirm. There is no
                                                      // 'lanes' start: it would skip the spec, and answers go in by the spec
     nonce: 'r3b',                                    // REQUIRED, fresh per run; saved in work-gates.json
     noSpec: true,                                    // only for a spec start without args.spec in a round with no answers
                                                      // (otherwise that start needs the round's latest priorGates)
     continues: 'r3a',                                // REQUIRED for a continuation: the nonce of the run it continues
     priorGates: { ... },                             // a continuation: that run's state/<round>/work-gates.json; the gates of
                                                      // every phase this run skips come from it, only when it is of this
                                                      // round (and of the run named in continues), else they stay false
     confirm: [{ lane: ['<id>'], file: 'state/r2/open.json', findings: [{ id: 'F-r2-4', section: '<id>', severity: 'P1' }] }],
                                                      // startAt 'confirm' only: which findings each confirm accounts for
     themes: ['dark', 'light'],                       // ['dark'] when Nadav chose a dark-only app (README step 1)
     maxConfirms: 3, shooters: 1, verifiers: 4, commit: true,   // clamped: confirms 1-3, shooters 1-3, verifiers 1-4.
                                                      // shooters stays 1 (one browser at a time) unless the machine has
                                                      // measured memory headroom: earlyoom killed Chrome under parallel shoots
   }
   Paths inside args are relative to `out` unless absolute. Every agent runs on Opus (model: 'opus'), on purpose. */

const A = args || {}
if (!A.out || !A.skill || !Array.isArray(A.screens) || !A.screens.length) {
  throw new Error('args.out, args.skill and args.screens are required (redesign/README.md «Rounds»)')
}
const OUT = A.out, SK = A.skill, APP = A.app || '(not given)', R = A.round || 'r1', DATE = A.date || ''
const STAGES = ['spec', 'lanes', 'rebuild', 'verify', 'confirm']
// a continuation never starts at 'lanes': that would skip the spec, the only way Nadav's answers enter a round
const STARTS = ['spec', 'rebuild', 'verify', 'confirm']
if (!STARTS.includes(A.startAt || 'spec')) throw new Error(`args.startAt must be one of ${STARTS.join(', ')} (answers go in by starting at spec)`)
const START = STAGES.indexOf(A.startAt || 'spec')
if (!A.nonce) throw new Error('args.nonce is required: a fresh name for this run, saved in work-gates.json')
if (START > 0 && A.spec) throw new Error('a continuation takes no args.spec: start at spec to apply answers')
if (START > 0 && (A.items || A.shared)) throw new Error('a continuation takes no args.items or args.shared: item files go in by starting at spec')
if (START > 0 && !A.continues) throw new Error('a continuation needs args.continues: the nonce of the run it continues')
if (STAGES[START] === 'confirm' && !(A.confirm || []).every(c => Array.isArray(c.findings) && c.findings.length && c.file)) throw new Error('startAt "confirm" needs args.confirm: [{lane, file, findings: [{id, section, severity}]}]')
const P = A.priorGates || null
if (START > 0 && !P) log('a continuation without args.priorGates: the gates of the phases it skips stay false, so this run cannot go green')
// a prior gate counts only for this round and the run named in args.continues. Owner decisions are never inherited:
// DECISIONS-OPEN.md is their one authority, counted by this run's close agent.
const prior = k => !!(P && P.round === R && P.nonce === A.continues && P[k] === true)
// a spec start without a spec inherits nothing, but it never forgets that the round's last run left its spec unapplied
if (START === 0 && !A.spec && A.mode !== 'build') {
  if (!(P && P.round === R) && A.noSpec !== true) throw new Error('a spec start without args.spec passes the round\'s latest state/<round>/work-gates.json as priorGates (noSpec: true only for a round with no answers)')
  const owed = ['specApplied', 'answersApplied', 'lanesComplete', 'requestsHandled'].filter(k => P && P.round === R && P[k] !== true)
  if (owed.length) throw new Error(`the last run of this round left ${owed.join(', ')} false: start at spec with that spec in args.spec`)
}
const from = s => START <= STAGES.indexOf(s)
const clamp = (v, lo, hi, dflt, name) => {
  const n = v === undefined ? dflt : Number(v)
  if (!Number.isInteger(n)) throw new Error(`args.${name} must be an integer`)
  const c = Math.min(hi, Math.max(lo, n))
  if (c !== n) log(`args.${name} ${n} clamped to ${c}`)
  return c
}
const chunk = (xs, n) => xs.reduce((o, x, i) => (i % n ? o[o.length - 1].push(x) : o.push([x]), o), [])
const LANES = A.lanes || chunk(A.screens, clamp(A.laneSize, 1, 8, 4, 'laneSize'))
const GROUPS = chunk(A.screens, clamp(A.auditSize, 1, 10, 7, 'auditSize'))
// one browser at a time on this laptop (earlyoom killed headless Chrome under parallel shoots); verifiers read the
// shots and open no browser
const SHOOTERS = clamp(A.shooters, 1, 3, 1, 'shooters')
const VERIFIERS = clamp(A.verifiers, 1, 4, 4, 'verifiers')
// a full sweep of a large demo never reaches zero; the gate is at most 3 targeted confirms
const MAXC = clamp(A.maxConfirms, 1, 3, 3, 'maxConfirms')
const THEMES = A.themes || ['dark', 'light']
if (!THEMES.length || THEMES.some(x => !['dark', 'light'].includes(x))) throw new Error('args.themes must hold "dark" and/or "light"')
const PASSES = [...THEMES, ...THEMES.map(x => `320-${x}`), 'pub']
const p = f => (String(f).startsWith('/') ? f : `${OUT}/${f}`)

const MACHINE = `MACHINE RULES: you run at most ONE browser, closed before the next; never shoot in the background; ${SHOOTERS === 1 ? 'no other agent of this round shoots while you do' : `at most ${SHOOTERS} agents of this round shoot at once`}. Before a shoot run \`free -g\` and \`uptime\`. Memory is the gate (earlyoom killed headless Chrome when swap was full, and Bash calls hung): with less than 2 GB available or swap more than 80% used, wait and check every minute, for at most 10 minutes, then stop and report it instead of shooting. Load is advisory: when the 1-minute load is above twice the CPU count, wait for it to drop for at most 10 minutes, then shoot anyway with one browser and say what the load was (shoot.mjs records it in report.json "machine"). Stop every server and browser you started before you return; never use or stop one you did not start (Nadav keeps his own demo server open). No network except the app's local dev server: the demo loads only local files. Scratch goes under ${OUT}/work/, never /tmp (a reboot wipes it). Never commit, push or deploy unless your task says so. Never print a secret value.`

const RUBRIC = `REDESIGN DEMO in ${OUT} (its own git repo). Read first: ${SK}/README.md («Demo rules» and «Column labels»), ${OUT}/BRIEF.md (the design language Nadav approved), ${OUT}/redesign.json (screens, phone size, theme tokens), ${OUT}/DECISIONS-ANSWERED.md (never re-decide an answer; never remove a decided state or feature), ${OUT}/FEATURES-PROPOSED.md, ${OUT}/INVENTORY.md (every screen, state and control of today's app; nothing in it may be lost) and, when it exists, ${OUT}/plan/build-plan.md (its units cite column labels). Today's app, read-only: ${APP}.
Precedence: Nadav's newest answer, then DECISIONS-ANSWERED.md, then the plan, then the notes inside the sections.
«היום» columns are today's app and are never edited. «אחרי · …», «חדש · …», «מצב · …» and «מוצע · <date> · אחרי הליבה · …» are the target. Never rename or remove an existing column label (the plan cites them); a new phone gets a new label.
The standard: every target phone looks like a shipped premium native app, in dark, in light and at 320px. Craft (alignment, spacing rhythm, optical sizes); text (no clipping or overlap, natural correct copy in the app's language, one term per concept); RTL-first with logical properties; contrast 4.5:1 (3:1 for large text); 44px targets; the shared components of parts/00-head.html identical on every screen; data consistent across screens; designed empty, loading, error, offline and permission states; nothing under the tab bar or the home indicator; no internal notes or ids drawn inside a phone.
OWNER DECISIONS STOP THE WORK: a choice only Nadav can make, or a visible change to something he approved (BRIEF.md, a phone he kept) that no item, answer or finding asks for, is never built in advance. Leave that part as it is and return it in "needs" (kind "decision" or "visual", the question, 2-4 options, your recommendation first). The parent asks him and continues from his recorded answer.
Tools, run from ${OUT}: python3 tools/build.py --config redesign.json out/<label>.html (always your own output file) · node tools/shoot.mjs --config redesign.json --in out/<label>.html --dir work/shots/<label>/<theme> --theme <theme> <ids> for each theme in ${THEMES.join(' and ')}, and with --width 320 into …/320-<theme> · python3 tools/check-anchors.py --config redesign.json (read-only). A shoot exits 0 only when its report.json problem lists are empty; its "advisory" leads (contrast, 44px targets) are yours to confirm or dismiss with a reason; labels.json maps phone numbers to column labels.
${MACHINE}`

const SEV = { type: 'string', enum: ['P0', 'P1', 'P2'] }
const FPROPS = { section: { type: 'string' }, phone: { type: 'string' }, severity: SEV, lens: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' }, evidence: { type: 'string' }, track: { type: 'string', enum: ['demo', 'plan'] }, source: { type: 'string' } }
const FREQ = ['section', 'phone', 'severity', 'what', 'fix', 'evidence', 'track']
const FINDING = { type: 'object', properties: FPROPS, required: FREQ }
const OPEN = { type: 'object', properties: { id: { type: 'string' }, ...FPROPS }, required: ['id', ...FREQ] }
const WHY = { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] }
const REQUEST = { type: 'object', properties: { section: { type: 'string' }, file: { type: 'string' }, change: { type: 'string' }, why: { type: 'string' }, source: { type: 'string' } }, required: ['section', 'change', 'why'] }
const NEED = { type: 'object', properties: { kind: { type: 'string', enum: ['decision', 'visual'] }, section: { type: 'string' }, question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' }, source: { type: 'string' } }, required: ['kind', 'section', 'question', 'options', 'recommendation'] }
const REJECT = { type: 'object', properties: { id: { type: 'string' }, source: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'source', 'what', 'why'] }
const FIX = { type: 'object', properties: { fixed: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: REJECT }, requests: { type: 'array', items: REQUEST }, plan: { type: 'array', items: WHY }, needs: { type: 'array', items: NEED }, clean_build: { type: 'boolean' } }, required: ['fixed', 'rejected', 'requests', 'plan', 'needs', 'clean_build'] }
const SPEC = { type: 'object', properties: { items: { type: 'array', items: FINDING }, summary: { type: 'string' } }, required: ['items', 'summary'] }
const AUDIT = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const CONFIRM = { type: 'object', properties: { inputs: { type: 'array', items: { type: 'string' } }, confirmed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, proof: { type: 'string' } }, required: ['id', 'proof'] } }, still_open: { type: 'array', items: OPEN }, regressions: { type: 'array', items: FINDING }, summary: { type: 'string' } }, required: ['inputs', 'confirmed', 'still_open', 'regressions', 'summary'] }
const PASS = { type: 'object', properties: { name: { type: 'string', enum: PASSES }, clean: { type: 'boolean' }, detail: { type: 'string' }, screens: { type: 'array', items: { type: 'string' } } }, required: ['name', 'clean', 'detail', 'screens'] }
const ANCHORS = { type: 'object', properties: { plan_exists: { type: 'boolean' }, ran: { type: 'boolean' }, exit_code: { type: 'integer' }, missing: { type: 'integer' }, wrong: { type: 'integer' }, stale: { type: 'integer' } }, required: ['plan_exists', 'ran', 'exit_code', 'missing', 'wrong', 'stale'] }
const REBUILD = { type: 'object', properties: { build_ok: { type: 'boolean' }, passes: { type: 'array', items: PASS }, anchors: ANCHORS, notes: { type: 'string' } }, required: ['build_ok', 'passes', 'anchors', 'notes'] }
const DONE = { type: 'object', properties: { committed: { type: 'boolean' }, sha: { type: 'string' }, summary: { type: 'string' } }, required: ['committed', 'sha', 'summary'] }
const CLOSE = { type: 'object', properties: { ...DONE.properties, decisions_open: { type: 'integer' } }, required: [...DONE.required, 'decisions_open'] }

const S = { fixed: 0, rejected: [], plan: [], needs: [], laneGone: [], leftRequests: [], errors: [], nextId: 1, sourceOf: {}, applied: new Set(), missed: new Set() }
const answerNo = s => { const m = /^\s*(?:answer|תשובה)?\s*#?\s*(\d+)\s*$/i.exec(String(s || '')); return m ? `answer ${m[1]}` : '' }
// the answers whose items reached an agent that returned (or the plan queue): the close agent closes their questions
const miss = (items, fls) => { for (const f of items) { const a = answerNo(f.source || S.sourceOf[f.id]); if (a) S.missed.add(a) } for (const fl of fls) for (const s of Object.values(fl.sources || {})) { const a = answerNo(s); if (a) S.missed.add(a) } }
const credit = (items, fls) => {
  for (const f of items) { const a = answerNo(f.source || S.sourceOf[f.id]); if (a) S.applied.add(a) }
  for (const fl of fls) for (const s of Object.values(fl.sources || {})) { const a = answerNo(s); if (a) S.applied.add(a) }
}
// Every agent on Opus: after a usage-limit resume on 29.9.2026 agents silently ran on a smaller model.
const run = async (prompt, opts, tries = 2) => {
  for (let t = 0; t < tries; t++) {
    const r = await agent(prompt, { model: 'opus', ...opts, label: t ? `${opts.label}~retry${t}` : opts.label })
    if (r) return r
    log(`[${opts.label}] returned nothing (attempt ${t + 1}/${tries})`)
  }
  return null
}
// At most n agents at once. An exception is recorded (it closes the gates), never swallowed.
const pool = async (xs, n, fn) => {
  const out = new Array(xs.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < xs.length) {
      const i = next++
      try { out[i] = await fn(xs[i], i) } catch (e) { S.errors.push(String(e).slice(0, 200)); log(`item ${i} threw: ${String(e).slice(0, 200)}`) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker))
  return out
}
const checkpoint = (what, ph, count) => A.commit === false ? null : run(`${MACHINE}
CHECKPOINT COMMIT of the output repo ${OUT} after «${what}» (machine restarts and usage cuts have cut rounds before; a commit per phase is what survives). Run git -C ${OUT} status --short. Stage everything .gitignore allows except files over 5 MB (list those). When something is staged, commit it as «chore(redesign): ${R} checkpoint after ${what}». Never push, amend or force. Return the DONE shape (committed false and sha "" when there was nothing to commit).${count ? ' Then run python3 tools/decisions-open.py DECISIONS-OPEN.md and return its "open" as decisions_open (the count of the tool, never your own).' : ''}`, { label: `checkpoint:${what}`, phase: ph || 'Checkpoint', schema: count ? CLOSE : DONE, effort: 'low' })

const key = ids => ids.join('+')
const sid = f => String(f.section || '').trim().replace(/^s-/, '')
const withId = f => {
  const g = f.id ? f : { ...f, id: `F-${R}-${S.nextId++}` }
  if (g.source) S.sourceOf[g.id] = g.source // an item that carries Nadav's answer: a lane may never reject it
  return g
}
const toPlan = fs => S.plan.push(...fs.map(f => ({ what: `${f.section} · ${f.phone} · ${f.what}`, why: `${f.fix} (${f.evidence})` })))
const collect = rs => {
  const ok = rs.filter(Boolean)
  for (const r of ok) {
    S.fixed += (r.fixed || []).length
    S.rejected.push(...(r.rejected || []).map(x => ({ ...x, source: x.source || S.sourceOf[x.id] || '' })))
    S.plan.push(...(r.plan || []))
    S.needs.push(...(r.needs || []))
    for (const x of r.needs || []) { const a = answerNo(x.source); if (a) S.missed.add(a) }
  }
  return ok
}
// Plan-track findings go to the plan session; a section no lane owns ("_shared", parts/*) goes to the shared owner.
const route = items => {
  const lanes = new Map(), shared = [], plan = []
  for (const f of items) {
    if (f.track === 'plan') { plan.push(f); continue }
    const l = LANES.find(x => x.includes(sid(f)))
    if (!l) { shared.push(f); continue }
    if (!lanes.has(key(l))) lanes.set(key(l), [])
    lanes.get(key(l)).push(f)
  }
  return { lanes, shared, plan }
}
const own = ids => ids.map(i => `sections/${i}.html, css/${i}.css, changelog/${i}.md, history/${i}/`).join('; ')
const BUILD_TASK = `BUILD your screens from scratch: sections/<id>.html from ${SK}/templates/section.html, using ONLY the shared components the shared owner just built in parts/00-head.html, with the «היום · <route>» column(s) from today/ ({{IMG:<name>}}), the «אחרי · …» phones of the new design, and one «מצב · …» phone for EVERY state INVENTORY.md lists for the screen. Approved new features get «חדש · מאושר · …» phones; proposals in FEATURES-PROPOSED.md get «מוצע · <date> · אחרי הליבה · <title>» phones with the note under the phone. Keep every control INVENTORY.md lists (it may move, it may not vanish). Where the design needs a choice only Nadav can make, build nothing for that part: return it in "needs".`
const SHARED_INIT = `SHARED INIT (first build): replace the component skeleton of parts/00-head.html with the shared components BRIEF.md names (top bar, tab bar, list group and row, card, buttons, chips, sheet, toast, banner, empty/loading/error/offline states, field), on the tokens of redesign.json, so every screen lane builds on the approved components and none restyles one locally. Add the icons the components use to icons/. Prove them in out/shared-init.html with one test phone per component (dark, light, 320), then remove the test phones. A component BRIEF.md leaves open goes in "needs".`
const lanePrompt = (j, tag, extra) => `${RUBRIC}
FIX LANE ${key(j.ids)} (${R}-${tag}). You own ONLY: ${own(j.ids)}, plus out/${key(j.ids)}-${tag}.html and work/shots/${key(j.ids)}-${tag}/.
HISTORY FIRST: before editing a section, copy sections/<id>.html and css/<id>.css to history/<id>/${R}-${A.nonce}-${tag}/pre/ so Nadav can go back to anything he liked, only when that folder does not exist yet (a retried lane must never overwrite the real "before" with its own half-done edit).
${tag === 'build' ? BUILD_TASK : 'Apply every item below, re-checking each against the current files first. You may reject, with its id and a reason, an item that is no longer true or conflicts with an answered decision, EXCEPT an item with a "source": that is Nadav\'s answer, and it is never rejected; when it conflicts with something, return the conflict in "needs" (kind "decision") and leave that part alone.'}
Every rejection names the item's id and its "source" ("" when it has none); a request or a need that comes from an item with a "source" carries that "source". A change to a file you do not own goes into "requests" (the section id, or "_shared" for parts/*; the file; the exact change; why): never edit it. A change to the plan goes into "plan". ${extra || ''}
ITEMS (FINDING shape): ${JSON.stringify(j.items)}${j.files.length ? `\nALSO read and apply the items in: ${j.files.map(f => `${p(f.file)} (${f.n})`).join(', ')}` : ''}
Build, shoot dark, light and both 320 passes (one browser at a time), Read every changed or added phone at every scroll position, and iterate until it is clean; run check-anchors when the plan exists and list any label you broke with its cause.
Then one dated line per change in changelog/<id>.md («${R} · ${DATE} · …», plain Hebrew), and copy the final shots of changed and added phones to history/<id>/${R}-${A.nonce}-${tag}/after/.
Return the FIX shape; clean_build is true only when every report.json you produced lists nothing.`
const sharedPrompt = (items, file, tag) => `${RUBRIC}
SHARED OWNER (${R}-${tag}): parts/*, icons/ and the theme tokens in redesign.json only. Back up each file to history/_shared/${R}-${A.nonce}-${tag}/pre/ before editing, only when that folder does not exist yet (a retry never overwrites the real "before").
${tag === 'build' ? SHARED_INIT : ''}
Apply these items, re-checking each against the current files; reject, with its id and a reason, any that no longer holds, except an item with a "source" (Nadav's answer: a conflict goes to "needs"): ${JSON.stringify(items)}${file ? `\nALSO the ${file.n} items in ${p(file.file)}.` : ''}
When a shared change needs the sections to adopt new markup, make the shared part and file one request per section with the exact markup change. Build out/shared-${tag}.html, shoot every screen (dark, light, 320; one browser at a time) and confirm nothing regressed anywhere. One line per change in changelog/_shared.md. Return the FIX shape.`

const applyAll = async (items, tag, ph, extra, files) => {
  // items that arrive in files name their answers in args (sources), so a rejection is caught even without an echo
  for (const fl of [...((files && files.lanes) || []), ...(files && files.shared ? [files.shared] : [])]) Object.assign(S.sourceOf, fl.sources || {})
  const r = route(items.map(withId))
  toPlan(r.plan)
  credit(r.plan, [])
  const sharedFile = files && files.shared
  let sh = null
  if (tag === 'build' || r.shared.length || sharedFile) {
    sh = await run(sharedPrompt(r.shared, sharedFile, tag), { label: `${tag}:shared`, phase: ph, schema: FIX })
    if (!sh) { S.laneGone.push(`${tag}:shared`); miss(r.shared, sharedFile ? [sharedFile] : []); log(`${tag}: the shared owner returned nothing`) } else credit(r.shared, sharedFile ? [sharedFile] : [])
  }
  const jobs = LANES.map(ids => ({ ids, items: r.lanes.get(key(ids)) || [], files: ((files && files.lanes) || []).filter(f => ids.includes(f.ids[0])) }))
    .filter(j => tag === 'build' || j.items.length || j.files.length)
  const res = await pool(jobs, SHOOTERS, j => run(lanePrompt(j, tag, extra), { label: `${tag}:${key(j.ids)}`, phase: ph, schema: FIX }))
  jobs.forEach((j, i) => { if (res[i]) credit(j.items, j.files); else miss(j.items, j.files) })
  // a rejection must name an item the agent was given: an unknown id hides which answer it refused
  const strange = (who, given, out, hasFiles) => { if (out && !hasFiles) for (const x of out.rejected || []) if (!given.some(g => g.id === x.id)) S.errors.push(`${who} rejected ${x.id}, an id it was not given`) }
  if (sh) strange(`${tag}:shared`, r.shared, sh, !!sharedFile)
  jobs.forEach((j, i) => strange(`${tag}:${key(j.ids)}`, j.items, res[i], j.files.length > 0))
  const gone = jobs.filter((j, i) => !res[i]).map(j => key(j.ids))
  if (gone.length) { S.laneGone.push(...gone.map(g => `${tag}:${g}`)); log(`${tag}: lanes that returned nothing: ${gone.join(', ')}`) }
  return collect([sh, ...res])
}
const asItems = reqs => reqs.map(q => ({ section: q.section, phone: '', severity: 'P1', lens: 'cross-lane request', what: q.change, fix: `${q.file ? q.file + ': ' : ''}${q.change}`, evidence: q.why, track: q.section === 'plan' ? 'plan' : 'demo', ...(q.source ? { source: q.source } : {}) }))
// Cross-lane requests in two passes: the first pass often files requests of its own. What is left closes the gate.
const requestPasses = async (done, tag, ph) => {
  let reqs = done.flatMap(r => r.requests || [])
  for (let k = 1; k <= 2 && reqs.length; k++) {
    log(`${tag} request pass ${k}: ${reqs.length} requests`)
    const rr = await applyAll(asItems(reqs), `${tag}-req${k}`, ph, 'These are CROSS-LANE REQUESTS other lanes filed for your files: apply each unless it is wrong, and say why.')
    reqs = rr.flatMap(r => r.requests || [])
  }
  if (reqs.length) { log(`${reqs.length} requests left after two passes: the demo gate stays closed until they are handled`); S.leftRequests.push(...reqs); for (const q of reqs) { const a = answerNo(q.source); if (a) S.missed.add(a) } }
}
const rebuildPrompt = tag => `${RUBRIC}
FULL REBUILD (${R}-${tag}). You may write the demo file named by redesign.json "output" and pub/. First make sure nothing under sections/, css/ or parts/ changed in the last 3 minutes (a lane may still be writing); wait if so.
1. python3 tools/build.py --config redesign.json, then python3 tools/publish-prep.py --config redesign.json.
2. Shoot EVERY screen from the built file, one pass at a time: ${THEMES.map(x => `--theme ${x} into work/shots/${R}-${tag}/${x}`).join(', ')}, then --width 320 in ${THEMES.length > 1 ? 'both themes' : 'that theme'} into …/320-<theme>. Then shoot pub/index.html into …/pub (from disk, so a missing asset is a failed request).
3. When plan/build-plan.md exists: python3 tools/check-anchors.py --config redesign.json, and report its exit code and numbers.
4. Write work/shots/${R}-${tag}/INDEX.md mapping every section's phone numbers (ph-<id>-<n>-*.png) to its column labels.
Return the REBUILD shape: exactly one entry per pass named ${PASSES.join(', ')}; clean = the problem lists of its report.json are empty (advisory leads do not count); screens = the "shot" list of that report.json; detail = the non-empty lists. anchors.plan_exists says whether plan/build-plan.md exists.`
// Clean = the build ran, all five passes ran clean over EVERY screen, and check-anchors passed whenever a plan exists.
const rebuild = async (tag, ph) => {
  const rb = await run(rebuildPrompt(tag), { label: `rebuild:${tag}`, phase: ph, schema: REBUILD })
  const why = []
  if (!rb) why.push('returned nothing')
  else {
    if (!rb.build_ok) why.push('build failed')
    for (const name of PASSES) {
      const ps = rb.passes.filter(x => x.name === name)
      if (ps.length !== 1) { why.push(`${name}: ${ps.length} entries`); continue }
      if (!ps[0].clean) why.push(`${name}: not clean`)
      const miss = A.screens.filter(s => !ps[0].screens.includes(s))
      if (miss.length) why.push(`${name}: not shot ${miss.join(', ')}`)
    }
    const an = rb.anchors
    if (an.plan_exists && !(an.ran && an.exit_code === 0 && !an.missing && !an.wrong && !an.stale)) why.push(`anchors: ran ${an.ran}, exit ${an.exit_code}, ${an.missing} missing, ${an.wrong} wrong, ${an.stale} stale`)
  }
  log(`rebuild ${tag}: ${why.length ? `NOT clean: ${why.join('; ')}` : 'clean'}`)
  return { tag, shots: `${R}-${tag}`, built: !!(rb && rb.build_ok), clean: !why.length, why, rb }
}

const LENSES = [
  { key: 'craft', text: 'craft, native feel, flows, every state (empty, loading, error, offline, permission) and accessibility (contrast, 44px targets, accessible names, focus order); every entry in the problem lists of the shots\' report.json files is a finding, and every "advisory" lead (contrast, targets) is reported or dismissed with a reason' },
  { key: 'words', text: 'words, RTL, data consistency across screens, and completeness against the sources: INVENTORY.md (nothing today\'s app has is lost; every component variant visible in the phone its variant map names), DECISIONS-ANSWERED.md (every answer visible where it belongs), FEATURES-PROPOSED.md (no new feature hidden in an «אחרי» phone) and the plan' },
]
const rejectedNote = () => {
  const all = JSON.stringify(S.rejected)
  if (all.length > 12000) log(`the rejected list (${S.rejected.length}) is longer than a prompt slice; verifiers see its first 12000 characters and the earlier-rounds file`)
  return `${A.rejected ? ` Earlier rounds: ${p(A.rejected)}.` : ''} This round so far: ${all.slice(0, 12000)}`
}
const READ_ONLY = 'You made none of the fixes and you are READ-ONLY: never edit a file, never open a browser. Judge from the shots; a phone or pass with no shot is itself a finding.'
const verifyPrompt = (j, shots, rej) => `${RUBRIC}
FRESH VERIFY of round ${R}. ${READ_ONLY} Screens: ${j.g.join(', ')}. LENS: ${j.text}.
Use the shots in ${OUT}/work/shots/${shots}/ (dark, light, 320-dark, 320-light, pub; INDEX.md maps phones to column labels) and the sources.
Report only real defects that a user, a partner or a source check would catch, each with evidence (PNG path and file:line), never matters of taste. Exactly one section id per finding ("_shared" for parts/*); "phone" is the column label. A finding whose fix belongs in the plan rather than the demo has track "plan". Polish that is a real defect counts, as P2.
Do NOT re-report a finding a lane already rejected with a valid reason, unless you bring new evidence that the reason is wrong.${rej}`
const confirmPrompt = (st, k, shots) => `${RUBRIC}
TARGETED CONFIRM ${k} of round ${R}. ${READ_ONLY} Below are findings, each with an id, for ${st.key}; fixes were applied to them. List every id you were given in "inputs". Then account for EACH id exactly once: in "confirmed" (with a one-line proof from the shot and the source line) or in "still_open" (the finding with its id and fresh evidence). An id you do not account for stays open. Then look at every phone those fixes touched (changelog lines «${R} · …» and history/<id>/${R}-*/) and report any NEW defect the fixes caused in "regressions". Do not sweep untouched phones: a full sweep of a large demo never reaches zero, which is why this confirm is bounded. Shots: ${OUT}/work/shots/${shots}/.
FINDINGS: ${st.file ? `the findings with these ids, from ${p(st.file)}: ${JSON.stringify(st.items.map(f => ({ id: f.id, section: f.section })))}` : JSON.stringify(st.items)}`

const confirmSets = items => {
  const r = route(items)
  toPlan(r.plan)
  return [...[...r.lanes.entries()].map(([k, v]) => ({ key: k, items: v })), ...(r.shared.length ? [{ key: '_shared', items: r.shared }] : [])]
}
// Every input id ends confirmed or open; an id the confirm did not return, or returned twice, stays open.
// The input ids are always the script's own (a file set's ids come in args), so an unaccounted finding keeps its section.
const account = (st, c) => {
  const keep = (f, why) => (st.file ? withId({ ...f, phone: f.phone || '', lens: 'confirm', what: f.what || `finding ${f.id} of ${st.file} was not accounted for by the confirm (${why})`, fix: f.fix || 'confirm it again', evidence: f.evidence || st.file, track: 'demo' }) : f)
  if (!c) return st.items.map(f => keep(f, 'the confirm returned nothing'))
  const inputs = st.items.map(f => f.id)
  const open = []
  const conf = new Set(c.confirmed.map(x => x.id))
  for (const f of st.items) {
    const so = c.still_open.filter(x => x.id === f.id)
    if (conf.has(f.id) && !so.length) continue
    if (so.length === 1 && !conf.has(f.id)) { open.push(so[0]); continue }
    open.push(keep(f, so.length ? 'both confirmed and open' : 'missing from the reply'))
  }
  return [...open, ...c.still_open.filter(f => !inputs.includes(f.id)).map(f => withId({ ...f, id: undefined })), ...c.regressions.map(withId)]
}

// ---------------- the round ----------------
let specOk = true, specN = 0, specItems = []
if (from('spec') && A.spec) {
  phase('Spec')
  const sp = await run(`${RUBRIC}
SPEC WRITER, read-only: write nothing. Turn every answer and decision in ${p(A.spec)} into exact demo items: one item per change (an answer that changes nothing, such as keep or already settled, still gets ONE item with its source and fix «no change: <why>», so the run records it), naming the section, the exact column label of the phone (or the new label to add), the exact content, and in "source" the answer number it comes from (a lane may never reject an item with a source). Search every section for every place an answer touches: a renamed term changes everywhere it appears. A change that belongs only in the plan has track "plan".`, { label: 'spec', phase: 'Spec', schema: SPEC, effort: 'xhigh' })
  specOk = !!sp
  specItems = ((sp && sp.items) || []).map(withId)
  specN = specItems.length
  log(sp ? `spec: ${specN} items` : 'spec returned nothing: the answers in args.spec are NOT applied this round')
}

if (from('lanes')) {
  phase('Lanes')
  const tag = A.mode === 'build' ? 'build' : 'lanes'
  const done = await applyAll(specItems, tag, 'Lanes', '', { lanes: A.items || [], shared: A.shared })
  await checkpoint(tag)
  phase('Requests')
  await requestPasses(done, tag, 'Requests')
  await checkpoint('requests')
}

let rb = null, verify = null, open = [], verified = false, foundNone = false, storyRan = false
const confirms = []
if (from('verify')) {
  phase('Rebuild')
  rb = await rebuild('final', 'Rebuild')
  await checkpoint('rebuild')
  if (rb.built) {
    phase('Verify')
    const jobs = []
    for (const g of GROUPS) for (const l of LENSES) jobs.push({ g, ...l })
    if (A.story) jobs.push({ g: A.story.screens, key: 'story', text: `STORY: walk the main journey in ${p(A.story.file)} end to end across these screens; every name, number, time and state must agree from screen to screen, and no step may be missing` })
    else log('no STORY given: the journey is unchecked, so the demo gate stays closed')
    const rej = rejectedNote()
    const ver = await pool(jobs, VERIFIERS, j => run(verifyPrompt(j, rb.shots, rej), { label: `verify:${j.key}:${j.g[0]}`, phase: 'Verify', schema: AUDIT, effort: 'high' }))
    const missing = jobs.filter((j, i) => !ver[i]).map(j => `${j.key}:${j.g[0]}`)
    storyRan = !!A.story && !!ver[jobs.length - 1]
    const found = ver.filter(Boolean).flatMap(v => v.findings).map(withId)
    verify = { found: found.length, blocking: found.filter(f => f.severity !== 'P2').length, plan: found.filter(f => f.track === 'plan').length, missing }
    log(`verify: ${found.length} findings (P0/P1 ${verify.blocking}, plan ${verify.plan})${missing.length ? `; verifiers missing: ${missing.join(', ')}` : ''}`)
    // A missing verifier means nobody looked at those screens: "0 left" would be false, so the round stops here.
    verified = !missing.length
    foundNone = verified && !found.filter(f => f.track !== 'plan').length
    open = found
    const demo = found.filter(f => f.track !== 'plan')
    toPlan(found.filter(f => f.track === 'plan'))
    if (verified && demo.length) {
      phase('Fix')
      const done = await applyAll(demo, 'fix', 'Fix')
      await requestPasses(done, 'fix', 'Fix')
      rb = await rebuild('fix', 'Fix')
      await checkpoint('fix')
    }
    open = demo
  } else {
    log('the build failed: no verify this round; fix the build first (the rebuild notes say why)')
  }
} else {
  // a continuation that starts at the confirms: the findings come from files, the shots must be current
  phase('Rebuild')
  rb = await rebuild('pre-confirm', 'Rebuild')
  verified = rb.built // runs the confirms; whether the full verify (and its STORY) happened comes from priorGates
}

if (verified && rb.built && (open.length || STAGES[START] === 'confirm')) {
  phase('Confirm')
  for (let k = 1; k <= MAXC; k++) {
    const sets = k === 1 && STAGES[START] === 'confirm' ? A.confirm.map(c => ({ key: key(c.lane || [c.findings[0].section]), items: c.findings.map(f => ({ ...f })), file: c.file })) : confirmSets(open)
    if (!sets.length) break
    const conf = await pool(sets, VERIFIERS, st => run(confirmPrompt(st, k, rb.shots), { label: `confirm${k}:${st.key}`, phase: 'Confirm', schema: CONFIRM, effort: 'high' }))
    const miss = sets.filter((s, i) => !conf[i]).map(s => s.key)
    const still = sets.flatMap((st, i) => account(st, conf[i]))
    toPlan(still.filter(f => f.track === 'plan'))
    open = still.filter(f => f.track !== 'plan')
    confirms.push({ round: k, open: open.length, blocking: open.filter(f => f.severity !== 'P2').length, missing: miss })
    log(`confirm ${k}: ${open.length} open (P0/P1 ${open.filter(f => f.severity !== 'P2').length})${miss.length ? `; confirms missing: ${miss.join(', ')}` : ''}`)
    // The last confirm is the gate: what it reports is handed over, never fixed unverified.
    if (!open.length || k === MAXC) break
    const done = await applyAll(open, `c${k}`, 'Confirm')
    await requestPasses(done, `c${k}`, 'Confirm')
    rb = await rebuild(`c${k}`, 'Confirm')
    await checkpoint(`confirm ${k}`)
    if (!rb.built) { log(`the build failed after the fixes of confirm ${k}: the confirms stop, ${open.length} findings stay open`); break }
  }
}

// Gates come from structured fields only, never from words in an agent's prose (a report that contained the word
// "failed" once blocked a ship on 7.10.2026). "checked" = what is left was looked at after the last fixes.
const lastC = confirms[confirms.length - 1]
const checked = verified && (foundNone || (!!lastC && !lastC.missing.length))
// A gate is this run's evidence when its phase ran here, else the prior run's gate (args.priorGates), else false.
const ranLanes = from('lanes'), ranVerify = from('verify')
const rejectedAnswers = S.rejected.filter(x => String(x.source || '').trim())
const work = {
  // this run applied the spec, or the round has none to apply (the guard above refuses a spec start that forgets one)
  specApplied: from('spec') ? (A.spec ? specOk : true) : prior('specApplied'),
  answersApplied: (ranLanes || prior('answersApplied')) && !rejectedAnswers.length,
  lanesComplete: (ranLanes || prior('lanesComplete')) && !S.laneGone.length,
  noErrors: !S.errors.length,
  requestsHandled: (ranLanes || prior('requestsHandled')) && !S.leftRequests.length,
  storyChecked: ranVerify ? storyRan : prior('storyChecked'),
  rebuildClean: !!(rb && rb.clean),
  verifyComplete: ranVerify ? verified : prior('verifyComplete') && verified,
  checkedAfterFixes: checked,
}
const allWork = Object.values(work).every(Boolean)
log(`work gates: ${JSON.stringify(work)}`)

phase('Changes')
const rejectedSet = new Set(rejectedAnswers.map(x => answerNo(x.source)))
const appliedAnswers = [...S.applied].filter(a => !rejectedSet.has(a) && !S.missed.has(a))
const state = { workGates: { ...work, round: R, nonce: A.nonce }, appliedAnswers, verify, confirms, open, rejected: S.rejected, plan: S.plan, needs: S.needs, leftRequests: S.leftRequests, lanesMissing: S.laneGone, errors: S.errors, rebuild: rb && rb.why }
const changes = await run(`${RUBRIC}
ROUND CLOSE for ${R}. This round you own ${OUT}/state/${R}/ (committed, unlike work/), DECISIONS-OPEN.md and the CHANGES file.
1. Write ${OUT}/state/${R}/ from the DATA below, one JSON file each. open.json and work-gates.json describe now: replace them. needs.json, plan.json (for the plan session), rejected.json and requests-left.json accumulate across the runs of this round: read what is there, APPEND the DATA entries (skip exact duplicates) and never truncate. A continuation of this round passes work-gates.json as args.priorGates.
2. DECISIONS-OPEN.md is the one record of owner decisions, and its «מצב» column says «פתוח» until a run applies the answer. (a) Append every item of "needs" as a numbered row with «מצב» «פתוח» (kind, options, recommendation first, the source phone; when DECISIONS-ANSWERED.md seems to answer it already, name that answer in the row: the parent puts it into the next spec). (b) For each answer in "appliedAnswers" (applied by this run), set to «הוכרע · תשובה N» every «פתוח» row that answer N settles: the question its «מאיפה השאלה» names, and any row that names answer N (rule a). Never close a row any other way. (c) Count the rows whose «מצב» is «פתוח» after (a) and (b) and return the count as decisions_open. The parent asks Nadav every open row before the next round.
3. Write CHANGES-${DATE ? DATE.replace(/\./g, '') : R}.md from ${SK}/templates/CHANGES.md: plain Hebrew, grouped by screen, every change of this round (the changelog lines «${R} · …») with its before (pre/) and after paths under history/<id>/${R}-${A.nonce}-*/, the gate numbers in words, one line per finding still open, and EVERY rejected item with its reason (a rejected item that carried Nadav's answer first). It is what Nadav reviews (keep, change or revert) before the next round.
DATA: ${JSON.stringify(state)}
Return the CLOSE shape: committed false (the checkpoint after you commits), and decisions_open.`, { label: 'changes', phase: 'Changes', schema: CLOSE })
const ck = await checkpoint('round close', 'Checkpoint', true)
const noBlocking = !open.filter(f => f.severity !== 'P2').length
// saved = written AND committed (state/ is the only copy a continuation and the plan session can trust)
const saved = !!changes && !!(ck && ck.committed && ck.sha)
// owner decisions: what DECISIONS-OPEN.md says now, in every run; a need raised in this run is open by definition
const decisionsOpen = changes && Number.isInteger(changes.decisions_open) ? changes.decisions_open : null
const ownerQueueEmpty = decisionsOpen === 0 && !!ck && ck.decisions_open === 0 && !S.needs.length
const gates = { ...work, ownerQueueEmpty, stateSaved: saved, demoNoBlocking: allWork && ownerQueueEmpty && saved && noBlocking, demoClean: allWork && ownerQueueEmpty && saved && !open.length }
log(`gates: ${JSON.stringify(gates)}`)
if (open.length > 30) log(`${open.length} findings still open; the result lists the first 30, the rest are in state/${R}/open.json`)
return { gates, spec: specN, verify, confirms, open: open.slice(0, 30), openTotal: open.length, needs: S.needs.length, decisionsOpen, appliedAnswers, planItems: S.plan.length, rejected: S.rejected.length, rejectedAnswers: rejectedAnswers.length, fixed: S.fixed, leftRequests: S.leftRequests.length, lanesMissing: S.laneGone, errors: S.errors, rebuild: rb && { clean: rb.clean, why: rb.why }, changes: changes && changes.summary, commit: ck && ck.sha }
