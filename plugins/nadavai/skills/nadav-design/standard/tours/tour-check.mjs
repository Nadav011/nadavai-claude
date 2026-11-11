#!/usr/bin/env node
// The tour manifest's checks that need no browser (nadav-design `standard/experience.md`, "The
// automated checks"; the format is in `standard/help-system.md`, "The tour manifest").
//
//   manifest        the file has the shape of tours.schema.json (and inventory.schema.json), tour ids
//                   are unique, a job's chapters run 1..n, a tour opens by itself only on its own screens
//   tour-shape      a step over twelve words, a step with no skip, a do step with no result, a chapter
//                   that ends neither at a result nor at a stop step, a tour that opens by itself on a
//                   screen that is not a core screen, more than five core screens; it notes every tour of
//                   more than six steps with no chapter break, which is never a finding
//   tour-no-commit  the part read from data: a do step classed T or P that is not practice-only with
//                   both its tests named, a do step with no G-20 test named (at stage "demo" one note
//                   with the count instead), a resume action other than reopening a window or selecting
//                   the sample record again, a `start` that asks for more than screen, view and close
//   tour-inventory  with --inventory: a screen the menu reaches, or a numbered task of an article, with
//                   no tour and no written reason (an extra task of the manifest too)
//   help-refs       with --inventory: an article task naming an anchor no tour step and no `anchors`
//                   entry knows, or naming a tour that does not exist or does not list that task there
//
// Not covered here, because it needs the running app or the project's suite: that the engine itself
// never dispatches a click, a submit or a key on a step target; that every anchor, result, condition,
// window and state id resolves on its screen (`tour-anchors`); that a step's class is right; a stop
// step followed by a step that depends on that control having been pressed; that the named tests
// exist and pass; and whether a chapter break sits at a real result (the reviewer).
//
// usage: node tour-check.mjs <tours.json> [--inventory <inventory.json>] [--json]
// exit: 0 no findings, 1 findings, 2 usage or an input that cannot be read. Steps count from 1.
// Each condition is one line ending in `// M:<code>`, the code its findings carry: the skill's tests
// (redesign/tests/run.mjs, TOUR-*) delete that line and show that the finding's fixture then passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node tour-check.mjs <tours.json> [--inventory <inventory.json>] [--json]';
const NOT_COVERED = [
  'tour-no-commit: the engine itself dispatching a click, a submit or a key on a step target (the running app)',
  'tour-no-commit: that a tour\'s start does only what its `start` says, and asks before closing a window that holds unsaved input (the running app)',
  'tour-no-commit: whether a step\'s class is right (a numbered document, a payment and a close for good are always T or P); the manifest\'s class is taken as written',
  'tour-no-commit: a stop step followed by a step that depends on that control having been pressed (the manifest does not record what a control opens)',
  'tour-no-commit: that the named tests exist and pass (the project\'s own suite)',
  'tour-anchors: every anchor, result, condition, window and state id resolving on its screen (the running app)',
  'tour-shape: whether a chapter break sits at a real result (the reviewer)',
];

function die(msg) {
  console.error(`tour-check: ${msg}\n${USAGE}`);
  process.exit(2);
}
function readJson(file, what) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { die(`cannot read ${what} ${file}: ${e.code || e.message}`); }
  try { return JSON.parse(text); } catch (e) { die(`${what} ${file} is not JSON: ${e.message}`); }
}

// ---------- a small validator for the part of JSON Schema the two schema files use ----------
function validate(root, value) {
  const out = [];
  const ref = r => r.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root);
  const typeOk = (v, t) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number'
    : t === 'array' ? Array.isArray(v) : t === 'null' ? v === null
    : t === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v) : typeof v === t);
  const walk = (s, v, p, errs) => {
    if (!s || s === true) return;
    if (s.$ref) walk(ref(s.$ref), v, p, errs);
    if (s.type && ![].concat(s.type).some(t => typeOk(v, t))) { errs.push({ path: p, message: `should be ${[].concat(s.type).join(' or ')}` }); return; }
    if ('const' in s && v !== s.const) errs.push({ path: p, message: `should be ${JSON.stringify(s.const)}` });
    if (s.enum && !s.enum.includes(v)) errs.push({ path: p, message: `should be one of ${s.enum.join(', ')}` });
    if (typeof v === 'string') {
      if (s.minLength && v.length < s.minLength) errs.push({ path: p, message: 'should not be empty' });
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) errs.push({ path: p, message: `"${v}" does not match ${s.pattern}` });
    }
    if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) errs.push({ path: p, message: `should be at least ${s.minimum}` });
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errs.push({ path: p, message: `should have at least ${s.minItems} item(s)` });
      if (s.maxItems !== undefined && v.length > s.maxItems) errs.push({ path: p, message: `should have at most ${s.maxItems} item(s)` });
      if (s.items) v.forEach((x, i) => walk(s.items, x, `${p}/${i}`, errs));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of s.required || []) if (!(k in v)) errs.push({ path: p, message: `"${k}" is missing` });
      for (const [k, x] of Object.entries(v)) {
        if (s.propertyNames) walk(s.propertyNames, k, `${p}/${k}`, errs);
        if (s.properties && k in s.properties) walk(s.properties[k], x, `${p}/${k}`, errs);
        else if (s.additionalProperties === false) errs.push({ path: p, message: `"${k}" is not a field of this format` });
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(s.additionalProperties, x, `${p}/${k}`, errs);
      }
    }
    for (const sub of s.allOf || []) walk(sub, v, p, errs);
    if (s.anyOf && !s.anyOf.some(sub => { const e = []; walk(sub, v, p, e); return !e.length; })) errs.push({ path: p, message: 'matches none of the shapes this field allows' });
    if (s.if) { const e = []; walk(s.if, v, p, e); if (!e.length && s.then) walk(s.then, v, p, errs); }
  };
  walk(root, value, '', out);
  return out;
}

// ---------- arguments ----------
const argv = process.argv.slice(2);
let manifestFile = null;
let inventoryFile = null;
let asJson = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') asJson = true;
  else if (a === '--inventory') { inventoryFile = argv[++i]; if (!inventoryFile) die('--inventory needs a file'); }
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('-')) die(`unknown option ${a}`);
  else if (manifestFile) die(`one manifest at a time (got ${manifestFile} and ${a})`);
  else manifestFile = a;
}
if (!manifestFile) die('no manifest given');

const M = readJson(manifestFile, 'manifest');
const INV = inventoryFile ? readJson(inventoryFile, 'inventory') : null;
const TOURS_SCHEMA = readJson(path.join(HERE, 'tours.schema.json'), 'schema');
const INV_SCHEMA = readJson(path.join(HERE, 'inventory.schema.json'), 'schema');

const arr = x => (Array.isArray(x) ? x : []);
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const tours = arr(M && M.tours);
const findings = [];
const notes = [];
// where: { tour, step } for a tour or a step (step counts from 1), { screen, task } for the inventory
const add = (check, rule, code, where, message) => findings.push({ check, rule, code, ...where, message });
const atPath = p => {
  const m = /^\/tours\/(\d+)(?:\/steps\/(\d+))?/.exec(p);
  if (!m) return { path: p || '/' };
  const t = tours[+m[1]];
  return { tour: (t && typeof t.id === 'string' && t.id) || `#${+m[1] + 1}`, ...(m[2] !== undefined ? { step: +m[2] + 1 } : {}), path: p };
};

// ---------- manifest: the format ----------
for (const e of validate(TOURS_SCHEMA, M)) add('manifest', null, 'schema', atPath(e.path), `${e.path || '/'}: ${e.message}`); // M:schema
if (INV) for (const e of validate(INV_SCHEMA, INV)) add('manifest', null, 'schema-inventory', { path: `inventory${e.path}` }, `inventory ${e.path || '/'}: ${e.message}`); // M:schema-inventory

const byId = new Map();
tours.forEach((t, ti) => {
  if (byId.has(t.id)) add('manifest', null, 'duplicate-id', { tour: t.id, path: `/tours/${ti}` }, `tour id "${t.id}" is used twice; a start by id reaches only the first`); // M:duplicate-id
  if (!byId.has(t.id)) byId.set(t.id, t);
  for (const k of arr(t.auto)) if (!arr(t.screens).includes(k)) add('manifest', null, 'auto-screen', { tour: t.id, path: `/tours/${ti}/auto` }, `opens by itself on "${k}", which is not one of its screens`); // M:auto-screen
  arr(t.steps).forEach((s, si) => {
    if (s && s.practiceOnly && s.kind !== 'do') add('manifest', null, 'practice-kind', { tour: t.id, step: si + 1, path: `/tours/${ti}/steps/${si}` }, `practiceOnly is for a do step (this one is "${s.kind}")`); // M:practice-kind
  });
});
// a job's chapters: every chapter carries job, jobTitle and chapter; one "of" and one title; 1..of once each
const jobs = new Map();
tours.forEach((t, ti) => {
  if (!t.job && !t.chapter && !t.jobTitle) return;
  const key = t.job || `(no job: ${t.id})`;
  if (!jobs.has(key)) jobs.set(key, []);
  jobs.get(key).push({ t, ti });
});
for (const [job, list] of jobs) {
  const why = [];
  if (list.some(({ t }) => !t.job || !t.jobTitle || !Array.isArray(t.chapter))) why.push('every chapter needs job, jobTitle and chapter');
  const ofs = new Set(list.map(({ t }) => arr(t.chapter)[1]));
  const titles = new Set(list.map(({ t }) => t.jobTitle));
  if (ofs.size > 1) why.push(`its chapters disagree on how many there are (${[...ofs].join(', ')})`);
  if (titles.size > 1) why.push('its chapters carry different job titles');
  const of = [...ofs][0];
  const ns = list.map(({ t }) => arr(t.chapter)[0]).sort((a, b) => a - b);
  if (ofs.size === 1 && Number.isInteger(of) && ns.join(',') !== Array.from({ length: of }, (_, i) => i + 1).join(',')) why.push(`chapters ${ns.join(', ')} of ${of}: each of 1..${of} once`);
  if (why.length) add('manifest', null, 'chapter-set', { tour: list[0].t.id, path: `/tours/${list[0].ti}` }, `job "${job}": ${why.join('; ')}`); // M:chapter-set
}

// ---------- tour-shape and tour-no-commit ----------
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const coreKeys = new Set(arr(M && M.core).flatMap(c => arr(c && c.screens)));
const noTest = []; // do steps that name no G-20 test: findings at stage app, one note at stage demo
const START_KEYS = ['screen', 'view', 'close'];
if (arr(M && M.core).length > 5) add('tour-shape', 'G-21', 'core-count', { path: '/core' }, `${M.core.length} core screens, at most five`); // M:core-count
const okEnd = s => !!s && (s.kind === 'stop' || (s.kind === 'do' && !!s.result));
tours.forEach((t, ti) => {
  const steps = arr(t.steps);
  steps.forEach((s, si) => {
    if (!s || typeof s !== 'object') return;
    const at = { tour: t.id, step: si + 1, path: `/tours/${ti}/steps/${si}` };
    const texts = [['text', s.text], ['showText', s.showText], ...arr(s.variants).map((v, vi) => [`variants[${vi}] (${v && v.when})`, v && v.text])];
    for (const [field, text] of texts) if (words(text) > 12) add('tour-shape', 'G-07', 'words', at, `${field} has ${words(text)} words, at most 12: the fix is two steps, never a trimmed one`); // M:words
    if (s.skip === false) add('tour-shape', 'G-07', 'no-skip', at, 'the step cannot be skipped; every step can be'); // M:no-skip
    if (s.kind === 'do' && !s.result) add('tour-shape', 'G-16', 'do-no-result', at, 'a do step with no result condition: it moves on only when the screen shows the result it names'); // M:do-no-result
    const po = obj(s.practiceOnly);
    const missing = ['modeTest', 'stopTest'].filter(k => !po[k]);
    if (s.kind === 'do' && (s.class === 'T' || s.class === 'P') && (!s.practiceOnly || missing.length)) add('tour-no-commit', 'G-20', 'do-class', at, `a do step classed ${s.class} ${s.practiceOnly ? `is practice-only without ${missing.join(' and ')}` : 'is not practice-only'}: it is a stop step`); // M:do-class
    if (s.kind === 'do' && !s.safeTest && !po.modeTest) noTest.push(at);
    for (const n of arr(s.need)) if (n && n.do !== 'reopen' && n.do !== 'selectSample') add('tour-no-commit', 'G-08', 'need-action', at, `the resume action "${n.do}" is not one of the two a tour does by itself (reopen a window, select the sample record again)`); // M:need-action
  });
  if (t.chapter) {
    const last = steps[steps.length - 1];
    const lastAlways = [...steps].reverse().find(s => s && !s.when);
    for (const s of new Set([last, lastAlways])) if (s && !okEnd(s)) add('tour-shape', 'G-07', 'chapter-end', { tour: t.id, step: steps.indexOf(s) + 1, path: `/tours/${ti}/steps/${steps.indexOf(s)}` }, `chapter ${arr(t.chapter).join(' of ')} ends at a "${s.kind}" step${s.kind === 'do' ? ' with no result' : ''}, neither at a result nor at a stop step`); // M:chapter-end
  }
  for (const k of Object.keys(obj(t.start))) if (!START_KEYS.includes(k)) add('tour-no-commit', 'G-08', 'start-key', { tour: t.id, path: `/tours/${ti}/start` }, `start asks for "${k}"; a tour that starts only goes to its screen, sets the view and closes a window that holds no unsaved input`); // M:start-key
  for (const k of arr(t.auto)) if (!coreKeys.has(k)) add('tour-shape', 'G-21', 'auto-not-core', { tour: t.id, path: `/tours/${ti}/auto` }, `opens by itself on "${k}", which is not a core screen`); // M:auto-not-core
  if (steps.length > 6 && !t.chapter) notes.push({ check: 'tour-shape', tour: t.id, message: `${steps.length} steps and no chapter break; the reviewer checks only that a chapter break, if there is one, sits at a real result, and length alone is never a finding` });
});
if (M && M.stage === 'demo' && noTest.length) { notes.push({ check: 'tour-no-commit', message: `${noTest.length} do steps name no G-20 test; each needs one before the app runs this tour` }); noTest.length = 0; } // M:demo-stage
for (const at of noTest) add('tour-no-commit', 'G-20', 'do-no-safe-test', at, 'a do step names no test of G-20 (safeTest, or the practice mode\'s modeTest): it is a stop step'); // M:do-no-safe-test

// ---------- tour-inventory and help-refs ----------
if (INV) {
  const noTour = obj(M && M.noTour);
  const screenWhy = obj(noTour.screens);
  const taskWhy = arr(noTour.tasks);
  const known = new Set(Object.keys(obj(M && M.anchors)));
  const refId = a => (typeof a === 'string' ? a : a && a.anchor);
  for (const t of tours) for (const s of arr(t.steps)) {
    if (s && s.anchor) known.add(s.anchor);
    const r = s && s.result;
    if (r && ['present', 'fieldChanged', 'recordOpen'].includes(r.kind)) known.add(refId(r.arg));
  }
  const toursOn = key => tours.filter(t => arr(t.screens).includes(key));
  const covered = (key, task) => toursOn(key).some(t => arr(t.tasks).includes(task)) || !!screenWhy[key] || taskWhy.some(x => x && x.screen === key && x.task === task);
  const needTour = (key, task, where) => {
    if (!covered(key, task)) add('tour-inventory', 'G-19', 'task-no-tour', where, `"${task}" has no tour and no written reason`); // M:task-no-tour
  };
  for (const [key, sc] of Object.entries(obj(INV.screens))) {
    if (sc && sc.menu === true && !toursOn(key).length && !screenWhy[key]) add('tour-inventory', 'G-19', 'screen-no-tour', { screen: key, path: `inventory/screens/${key}` }, 'the menu reaches this screen, and it has no tour and no written reason'); // M:screen-no-tour
    arr(sc && sc.tasks).forEach((task, i) => {
      if (!task || typeof task.text !== 'string') return;
      const where = { screen: key, task: i + 1, path: `inventory/screens/${key}/tasks/${i}` };
      needTour(key, task.text, where);
      for (const a of arr(task.anchors)) if (!known.has(refId(a))) add('help-refs', 'G-02, G-19', 'article-anchor', where, `the article names the control "${refId(a)}", which no tour step and no anchors entry knows`); // M:article-anchor
      const named = task.tour && byId.get(task.tour);
      if (task.tour && (!named || !arr(named.screens).includes(key) || !arr(named.tasks).includes(task.text))) add('help-refs', 'G-02, G-19', 'article-tour', where, named ? `the article names tour "${task.tour}", which does not list "${task.text}" on ${key}` : `the article names tour "${task.tour}", which does not exist`); // M:article-tour
    });
  }
  arr(M && M.extraTasks).forEach((x, i) => { if (x && x.screen && x.task) needTour(x.screen, x.task, { screen: x.screen, path: `/extraTasks/${i}` }); });
}

// ---------- report ----------
const checks = ['manifest', 'tour-shape', 'tour-no-commit', ...(INV ? ['tour-inventory', 'help-refs'] : [])];
const counts = Object.fromEntries(checks.map(c => [c, findings.filter(f => f.check === c).length]));
const stepCount = tours.reduce((n, t) => n + arr(t.steps).length, 0);
if (asJson) {
  console.log(JSON.stringify({ ok: !findings.length, manifest: manifestFile, inventory: inventoryFile, tours: tours.length, steps: stepCount, counts, findings, notes, notCovered: NOT_COVERED }, null, 2));
} else {
  const loc = f => (f.tour ? `${f.tour}${f.step ? ` step ${f.step}` : ''}` : f.screen ? `screen ${f.screen}${f.task ? ` task ${f.task}` : ''}` : f.path);
  for (const f of findings) console.log(`FAIL ${f.check} ${f.rule || '-'} ${loc(f)}: ${f.message}`);
  for (const n of notes) console.log(`NOTE ${n.check}${n.tour ? ` ${n.tour}` : ''}: ${n.message}`);
  if (!INV) console.log('NOTE tour-inventory and help-refs did not run: no --inventory');
  console.log(`tour-check: ${tours.length} tours, ${stepCount} steps, ${findings.length} finding(s) (${checks.map(c => `${c} ${counts[c]}`).join(', ')})`);
  console.log(`not covered here:\n${NOT_COVERED.map(x => `  - ${x}`).join('\n')}`);
}
process.exit(findings.length ? 1 : 0);
