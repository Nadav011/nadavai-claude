#!/usr/bin/env node
// The tour manifest's checks that need no browser (nadav-design `standard/experience.md`, "The
// automated checks"; the format is in `standard/help-system.md`, "The tour manifest").
//
//   manifest        the file has the shape of tours.schema.json (and inventory.schema.json), tour ids
//                   are unique, a job's chapters run 1..n, a tour opens by itself and starts only on its
//                   own screens; with --require-stage, a manifest at another stage (the app's own check
//                   run passes --inventory and --require-stage app; app without --inventory is a usage error)
//   tour-shape      a step over twelve words, a step with no skip, a do step with no result, a chapter
//                   that can end (on the phone or the computer) neither at a result nor at a stop step, a
//                   tour that opens by itself on a screen that is not core, more than five core screens
//                   (views count as one screen where inventory.json marks them viewOf it; without the
//                   inventory, more than five entries), a viewOf that names itself, a screen the inventory
//                   lacks or a view, and a core key's viewOf that names a screen outside its core entry; it
//                   notes every tour of more than six steps with no chapter break, which is never a finding
//   tour-no-commit  the part read from data: a do step that does not say on: "sample" or on: "none"; a
//                   do step classed T (in practice mode too) or P that is not practice-only, a practice-only
//                   step that is not classed P, and at stage "app" one without both tests; a practice-only
//                   step without on: "sample"; a do step classed S without on: "sample"; a do step that opens
//                   a record (result recordOpen) without on: "sample"; with --inventory a do step at
//                   on: "sample" on a recordAnchors control with no earlier step in its tour that opened her
//                   record (a recordOpen result naming its own control) or picked her (an unclassed pick
//                   with a custom result after a step at on: "none" that opened its window on that device,
//                   under no other condition), on each device the step runs on, or that names no need that
//                   reopens a window (after the picker, and selects the sample again; the picker itself names
//                   a reopen too); a do step with no G-20 test named (at stage "demo" these, and a
//                   practice-only step's missing tests, are notes with the count); a resume action other
//                   than reopening a window or selecting the sample record again; a `start` key other than
//                   screen, record, view, date and close. With --inventory, which holds recordAnchors (ids
//                   that resolve to the sample's record), bulkAnchors (many at once) and containerAnchors
//                   (elements that hold people's rows, and ids every row carries): a do step at on: "none"
//                   on a record control, or whose result names a record control or a container; a do step at
//                   on: "sample" on a control no list holds; a do step on a bulk control, or whose result
//                   names one; a do step lit on a container (each at any on and any class); and an id in
//                   two of the lists (manifest). Without --inventory a note counts the do steps not judged
//   tour-inventory  with --inventory: a screen the menu reaches, or a numbered task of an article, with
//                   no tour and no written reason (an extra task of the manifest too); a tour whose screens
//                   name a screen the inventory does not have, or that stands on no screen of its own or of
//                   its job
//   help-refs       with --inventory: an article task naming an anchor (with its arg) that no tour on that
//                   screen points at or names as a result and no `anchors` entry for that screen lists, or
//                   naming a tour that does not exist or does not list that task there
//
// Not covered here: every item of NOT_COVERED below, which each run prints after its findings (the
// running app's, the project suite's and the reviewer's), so the two never drift apart.
//
// usage: node tour-check.mjs <tours.json> [--inventory <inventory.json>] [--require-stage demo|app] [--json]
// The app's own check: node tour-check.mjs tours.json --inventory inventory.json --require-stage app
// exit: 0 no findings, 1 findings, 2 usage, an input that cannot be read, or one whose shape the checks
// cannot walk (a tour or a step that is not an object). Steps count from 1.
// Each condition is one line ending in `// M:<code>`, the code its findings carry: the skill's tests
// (redesign/tests/run.mjs, TOUR-*) delete that line and show that the finding's fixture then passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node tour-check.mjs <tours.json> [--inventory <inventory.json>] [--require-stage demo|app] [--json]\n  the app\'s own check: node tour-check.mjs tours.json --inventory inventory.json --require-stage app';
const NOT_COVERED = [
  'tour-no-commit: the engine itself dispatching a click, a submit or a key on a step target (the running app)',
  'tour-no-commit: that a tour\'s start does only what its `start` says, and asks before closing a window that holds unsaved input (the running app)',
  'tour-no-commit: whether a step\'s class is right (a numbered document, a payment and a close for good are always P, a send is T, a save is S); the manifest\'s class is taken as written, so a save or a send written as an unclassed do step passes (the reviewer; at on: "sample" also the step\'s safeTest, which performs the action on the sample record; at on: "none" no test reaches a business-wide save, so an unclassed one there, or one on a switch or a field that saves as it changes, passes and only the reviewer stops it); a practice-only step is always classed P, so an unclassed do step always names a safeTest; a stop step on a bulk control is classed T, and its class is not read either',
  'tour-no-commit: a step classed P that also tells someone (a practice receipt that is also sent) carries one class, P; that its mode test also shows the message is held is the project\'s suite\'s (the checker reads one class)',
  'tour-no-commit: that the practice mode\'s test covers every outbound path (no document number; no documents, payment or messaging provider; no calendar or webhook call): the test is named, not read',
  'tour-shape: a device run left empty, every step of a tour marked for the other device (the reviewer)',
  'tour-shape: two tours that open by themselves on one core screen, or a later chapter that opens by itself (the reviewer)',
  'tour-no-commit: a step sentence that says nothing goes out, or that no one is told, where no test shows it (the reviewer, against the G-20 test or the practice mode\'s test)',
  'tour-no-commit: an inventory that declares no recordAnchors, or too few, leaves on: "none" unjudged with no note (the running app)',
  'tour-inventory: a result that routes to a screen the inventory does not have (only the screens a tour lists are read)',
  'tour-no-commit: that a do step at on: "sample" on a control recordAnchors lists changes only the sample\'s record (a save that also changes a business-wide rule): the running app (tour-anchors); the checker requires only that the control is a record control, and the step\'s safeTest shows that nothing leaves, not what changed',
  'tour-no-commit: a stop step followed by a step that depends on that control having been pressed (the manifest does not record what a control opens)',
  'tour-no-commit: that the named tests exist and pass (the project\'s own suite)',
  'tour-no-commit: without --inventory, none-on-record, sample-not-record, sample-not-opened, sample-no-need, do-on-bulk, do-on-container and anchor-both: the three lists are in the inventory (the run notes how many do steps it did not judge)',
  'tour-no-commit: an anchor family whose members differ (one exports or sits on a person\'s record, another only shows): a listed id covers every arg of its family, so a member that was not given its own id passes; such a control gets its own id (the reviewer)',
  'tour-no-commit: that a step marked on: "sample" really reaches the sample\'s record and no other (the bindings, in the running app: they select by the sample\'s record id, never the first visible row, or, inside a window opened on her, bind the window\'s own control); that the earlier opener opened the window the step\'s control sits in, that the step\'s need reopens that window, and that no step between them left it or opened another record (the reviewer); only the flag, and whether the control is one recordAnchors lists, are read, and recordAnchors holds only ids that resolve to the sample\'s record (a resolver\'s own id, a control in a window opened on her), while an id every row of a list carries is in containerAnchors; such an id listed in recordAnchors by mistake passes (the reviewer, and tour-anchors in the running app)',
  'tour-shape: that a key marked viewOf really is a view of that screen (the reviewer)',
  'tour-no-commit: that a need of reopen puts back the tour\'s own record, the sample\'s, and not the last one open, that a window opened on one person counts as open (isOpen) only while it shows the sample\'s record, and that the engine runs a step\'s need each time it reaches the step, not only after a resume or a skip: a reopen is skipped only when its window is already open on her (isOpen; a window that picks a person counts as open only while it is the tour\'s own and holds the sample or no one), and selectSample always runs, asking first when she picked someone since; and that while a window is open on her no second window of the same kind, open on someone else, holds the step\'s control where the binding finds it first (the bindings and the engine, in the running app; the suite checks only the example\'s bindings)',
  'tour-anchors: every anchor (the anchors entries and the articles\' too), result, condition, window and state id resolving on its screen, and a step marked on: "sample" resolving to the sample\'s record and no other (the running app)',
  'tour-shape: whether a chapter break sits at a real result (the reviewer)',
  'tour-anchors: a showing or stop step whose lit control responds; a test of the built engine presses the lit control of a stop step and shows that nothing happens (the running app)',
  'tour-no-commit: that the inventory\'s three lists are complete: recordAnchors every id that resolves to the sample\'s record (a resolver\'s own id, a control in a window opened on her), bulkAnchors every control that acts on many people\'s records at once, containerAnchors every element that holds people\'s rows and every id each row carries; an unlisted one lets the step pass (the running app)',
  'tour-no-commit: that what a step at on: "none" lands on through its result, a window (open), a wizard window (step), a screen (route or view) or a custom result, is nobody\'s (a menu, a filter panel), never a person\'s page, card or window: the manifest does not record whose it is (the reviewer)',
  'tour-no-commit: that a person picker\'s step has a result that checks the sample was picked (a custom result, as appt.sample-picked), that picking saves and sends nothing by itself, and that no do step on that window\'s other controls comes before it, and that the step before it opened the picker\'s own window: the reviewer, and the bindings; the checker takes an unclassed pick step with a custom result, after a step at on: "none" that opened a window on the same device under no other condition, as that picker',
  'tour-no-commit: that a step the checker takes as the opener through a recordOpen result naming its own control is a resolver\'s own id (a key of the bindings\' anchors and records, which select by the sample\'s record id), never a control inside a window (the reviewer, against the bindings)',
];

function die(msg) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg, usage: USAGE, findings: [], notes: [] }, null, 2));
  else console.error(`tour-check: ${msg}\n${USAGE}`);
  process.exit(2);
}
// a file that cannot be read or is not JSON: exit 2, said as JSON under --json
function unreadable(msg) {
  if (!asJson) die(msg);
  console.log(JSON.stringify({ ok: false, error: msg, manifest: manifestFile, inventory: inventoryFile, findings: [], notes: [] }, null, 2));
  process.exit(2);
}
function readJson(file, what) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { unreadable(`cannot read ${what} ${file}: ${e.code || e.message}`); }
  try { return JSON.parse(text); } catch (e) { unreadable(`${what} ${file} is not JSON: ${e.message}`); }
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
let asJson = argv.includes('--json'); // known before any usage error, so that one is JSON too
let requireStage = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') continue;
  else if (a === '--inventory') { inventoryFile = argv[++i]; if (!inventoryFile) die('--inventory needs a file'); }
  else if (a === '--require-stage') { requireStage = argv[++i]; if (requireStage !== 'demo' && requireStage !== 'app') die('--require-stage needs demo or app'); }
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('-')) die(`unknown option ${a}`);
  else if (manifestFile) die(`one manifest at a time (got ${manifestFile} and ${a})`);
  else manifestFile = a;
}
if (!manifestFile) die('no manifest given');
if (requireStage === 'app' && !inventoryFile) die('--require-stage app needs --inventory: the app\'s check judges every do step against recordAnchors, bulkAnchors and containerAnchors and runs tour-inventory and help-refs, and none of that runs without it'); // M:stage-app-inventory

const M = readJson(manifestFile, 'manifest');
const INV = inventoryFile ? readJson(inventoryFile, 'inventory') : null;
const TOURS_SCHEMA = readJson(path.join(HERE, 'tours.schema.json'), 'schema');
const INV_SCHEMA = readJson(path.join(HERE, 'inventory.schema.json'), 'schema');

const arr = x => (Array.isArray(x) ? x : []);
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = x => (plain(x) ? x : {});
// an input whose shape the checks cannot walk: exit 2 with the reason (as JSON under --json), never a stack trace
function malformed(msg) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg, manifest: manifestFile, inventory: inventoryFile, findings: [], notes: [] }, null, 2));
  else console.error(`tour-check: ${msg}`);
  process.exit(2);
}
if (!plain(M)) malformed(`the manifest ${manifestFile} is not a JSON object`);
if ('tours' in M && !Array.isArray(M.tours)) malformed('"tours" is not a list');
arr(M.tours).forEach((t, i) => {
  if (!plain(t)) malformed(`tour ${i + 1} is not an object`);
  if ('steps' in t && !Array.isArray(t.steps)) malformed(`tour ${i + 1} ("${t.id}"): "steps" is not a list`);
  arr(t.steps).forEach((s, j) => { if (!plain(s)) malformed(`tour ${i + 1} ("${t.id}") step ${j + 1} is not an object`); });
});
if (INV && !plain(INV)) malformed(`the inventory ${inventoryFile} is not a JSON object`);
process.on('uncaughtException', e => malformed(`the input's shape stopped the checks (${e.message}); fix what the schema names first`));
const tours = arr(M.tours);
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
// an id is one person's control, a control that acts on many at once, or an element that holds people's rows: one list,
// on whichever screens it appears
const LISTS = ['recordAnchors', 'bulkAnchors', 'containerAnchors'];
const listed = Object.fromEntries(LISTS.map(k => [k, new Set(Object.values(obj(INV && INV.screens)).flatMap(sc => arr(obj(sc)[k])))]));
const listsOf = id => LISTS.filter(k => listed[k].has(id));
for (const id of new Set(LISTS.flatMap(k => [...listed[k]]))) if (listsOf(id).length > 1) add('manifest', null, 'anchor-both', { path: 'inventory/screens' }, `"${id}" is in ${listsOf(id).join(' and ')} of the inventory: a control is one person's, many people's at once, or a container of people's rows, never two of these; an id every row of a list carries is a container, and only a resolver's own id or a control in a window opened on her is in recordAnchors`); // M:anchor-both

// a tour's screens; a chapter also stands on the screens of its job's other chapters
const screensOf = t => [...new Set([...arr(t.screens), ...(t.job ? tours.filter(x => x.job === t.job).flatMap(x => arr(x.screens)) : [])])];
const byId = new Map();
tours.forEach((t, ti) => {
  if (byId.has(t.id)) add('manifest', null, 'duplicate-id', { tour: t.id, path: `/tours/${ti}` }, `tour id "${t.id}" is used twice; a start by id reaches only the first`); // M:duplicate-id
  if (!byId.has(t.id)) byId.set(t.id, t);
  for (const k of arr(t.auto)) if (!arr(t.screens).includes(k)) add('manifest', null, 'auto-screen', { tour: t.id, path: `/tours/${ti}/auto` }, `opens by itself on "${k}", which is not one of its screens`); // M:auto-screen
  if (plain(t.start) && t.start.screen && !screensOf(t).includes(t.start.screen)) add('manifest', null, 'start-screen', { tour: t.id, path: `/tours/${ti}/start` }, `starts on "${t.start.screen}", which is not one of its screens`); // M:start-screen
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
const demoPractice = []; // practice-only steps at stage demo that name their tests later: one note
// a control the inventory lists as resolving to the sample's record (recordAnchors), on any screen of the inventory:
// anchor ids are global, and a tour reaches screens it does not list (a route, a chapter with screens [])
const isRecordAnchor = id => !!id && Object.values(obj(INV && INV.screens)).some(sc => arr(obj(sc).recordAnchors).includes(id));
// a control that exports, prints, downloads, shares or otherwise acts on many people's records at once (bulkAnchors)
const isBulkAnchor = id => !!id && Object.values(obj(INV && INV.screens)).some(sc => arr(obj(sc).bulkAnchors).includes(id));
// an element that holds people's rows or records (containerAnchors: a list, a column, the calendar grid)
const isContainerAnchor = id => !!id && Object.values(obj(INV && INV.screens)).some(sc => arr(obj(sc).containerAnchors).includes(id));
// the anchor a result names (present, fieldChanged, recordOpen), or undefined
const resultAnchor = s => (plain(s.result) && ['present', 'fieldChanged', 'recordOpen'].includes(s.result.kind) ? (typeof s.result.arg === 'string' ? s.result.arg : obj(s.result.arg).anchor) : undefined);
// the step's own control, or the control its result names (present, fieldChanged): a do step whose result is a person's
// control, or a container of people's rows, has let her reach a person's record
const onRecord = s => isRecordAnchor(s.anchor) || (plain(s.result) && ['present', 'fieldChanged'].includes(s.result.kind) && (isRecordAnchor(typeof s.result.arg === 'string' ? s.result.arg : obj(s.result.arg).anchor) || isContainerAnchor(typeof s.result.arg === 'string' ? s.result.arg : obj(s.result.arg).anchor)));
const START_KEYS = [
  'screen',
  'record', // M:start-record
  'view',
  'date',
  'close',
];
// A key counts as another screen only through a viewOf in inventory.json that names another screen of the inventory,
// not itself a view, in the same core entry as the key. Any other viewOf is a finding, and its key counts on its own.
// Whether the key really is a view of that screen is the reviewer's.
const invScreens = obj(INV && INV.screens);
const coreList = arr(M.core).filter(plain);
const viewOfKey = k => obj(invScreens[k]).viewOf;
const badView = k => {
  const v = viewOfKey(k);
  if (v === k) return 'names the key itself';
  if (!plain(invScreens[v])) return `names "${v}", which the inventory does not have`; // M:view-phantom
  if (typeof viewOfKey(v) === 'string') return `names "${v}", which is itself a view of "${viewOfKey(v)}"`;
  if (coreKeys.has(k) && !coreList.some(c => arr(c.screens).includes(k) && arr(c.screens).includes(v))) return `names "${v}", which is not in the same core entry as "${k}"`;
  return null;
};
const views = Object.keys(invScreens).filter(k => typeof viewOfKey(k) === 'string');
for (const k of views) if (badView(k)) add('tour-shape', 'G-21', 'view-of', { screen: k, path: `inventory/screens/${k}/viewOf` }, `viewOf ${badView(k)}; a key is a view only of another screen of the inventory that is not a view, in the same core entry`); // M:view-of
const folds = new Set(views);
for (const k of views) if (badView(k)) folds.delete(k); // M:view-own
const fold = k => (folds.has(k) ? viewOfKey(k) : k);
const coreScreens = new Set([...coreKeys].map(fold));
// without the inventory no view can be folded: more than five entries is still more than five screens, while more
// than five keys in at most five entries is a note
const coreCount = INV ? coreScreens.size : coreList.length;
if (coreCount > 5) add('tour-shape', 'G-21', 'core-count', { path: '/core' }, INV ? `${coreCount} core screens (${[...coreScreens].join(', ')}), at most five; keys of one core entry count as one screen only where inventory.json marks them viewOf it` : `${coreCount} core entries, so more than five core screens`); // M:core-count
if (!INV && coreCount <= 5 && coreKeys.size > 5) notes.push({ check: 'tour-shape', message: `${coreKeys.size} core keys in ${coreCount} entries: whether that is more than five core screens needs --inventory, which marks the keys that are views of one screen` });
const okEnd = s => !!s && (s.kind === 'stop' || (s.kind === 'do' && !!s.result));
// a do step at on: "sample" that opens her record or picks her: the steps after it in the tour act in a window opened
// on her, so a do step at on: "sample" on a control recordAnchors lists comes after one (a control no list holds is
// sample-not-record already, a bulk or container control its own finding). It opens her record when its recordOpen
// result names its own control (a resolver's own id); it picks her when it is the picker exception's own shape, an
// unclassed pick step with a custom result whose latest earlier do step opened a window at on: "none" (open or step).
// One under a condition other than the device opens it only where the condition holds
const opensSample = (s, prevDo) => s.kind === 'do' && s.on === 'sample' && plain(s.result) && ((s.result.kind === 'recordOpen' && resultAnchor(s) === s.anchor) || (s.result.kind === 'custom' && s.act === 'pick' && !s.class && !!prevDo && prevDo.on === 'none' && plain(prevDo.result) && ['open', 'step'].includes(prevDo.result.kind)));
const DEVICES = ['phone', 'desktop'];
// the devices on which a step of that shape opens her record or picks her: the picker only where the step that opened
// its window surely ran (it has no when, or that device's), since on another device or under a condition no window is open
const opensOn = (s, prevDo) => (!opensSample(s, prevDo) ? [] : s.result.kind === 'recordOpen' ? DEVICES : DEVICES.filter(d => !prevDo.when || prevDo.when === d));
tours.forEach((t, ti) => {
  const steps = arr(t.steps);
  const opened = new Set(); // the devices on which an earlier step of this tour opened her record or picked her
  let prevDo = null; // the latest earlier do step of this tour
  const viaPicker = {}; // per device, whether the latest step that opened her record or picked her was the picker
  steps.forEach((s, si) => {
    if (!s || typeof s !== 'object') return;
    const at = { tour: t.id, step: si + 1, path: `/tours/${ti}/steps/${si}` };
    const runsOn = DEVICES.filter(d => !s.when || s.when === d || !DEVICES.includes(s.when));
    const self = opensOn(s, prevDo);
    const unopened = runsOn.filter(d => !opened.has(d) && !self.includes(d));
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && unopened.length) add('tour-no-commit', 'G-08', 'sample-not-opened', at, `a do step at on: "sample" on "${s.anchor}" with no earlier step in this tour that opened the sample's record (a do step at on: "sample" whose recordOpen result names its own control, a resolver's own id) or picked her (an unclassed pick step, after the step at on: "none" that opened its window on that device, under no other condition, whose custom result checks the sample was picked)${unopened.length < 2 ? `, on the ${unopened[0]}` : ''}: a control in a window acts on whichever record that window shows, a real person's when the tour starts over it; put the step that opens her record or picks her before this one, or, when this step itself opens her record through a resolver's own id, give it the recordOpen result that names that id`); // M:sample-not-opened
    const isPicker = opensSample(s, prevDo) && s.result.kind === 'custom';
    const afterPicker = !opensSample(s, prevDo) && runsOn.some(d => viaPicker[d]);
    const reopens = arr(s.need).some(n => n && n.do === 'reopen');
    const selects = arr(s.need).some(n => n && n.do === 'selectSample');
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && (!opensSample(s, prevDo) || isPicker) && (!reopens || (afterPicker && !selects))) add('tour-no-commit', 'G-08', 'sample-no-need', at, `a do step at on: "sample" on "${s.anchor}" that names no need that reopens a window${afterPicker ? ' and selects the sample again' : ''}: a resume or a skip reaches it ${isPicker ? 'without the step that opened its window' : 'without the step that opened her record, or after she opened another record at an earlier step'}${afterPicker ? ', or after she picked another person in the picker\'s window' : ''}, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen)${afterPicker ? ', and selectSample, as every step after the picker does' : ', adding selectSample where that window picks a person'}; the engine runs that need each time it reaches the step: a reopen only when its window is not open on her, and selectSample always`); // M:sample-no-need
    for (const d of self) if (!s.when || s.when === d) opened.add(d); // M:sample-opener
    for (const d of self) if (!s.when || s.when === d) viaPicker[d] = s.result.kind === 'custom';
    if (s.kind === 'do') prevDo = s;
    const texts = [['text', s.text], ['showText', s.showText], ...arr(s.variants).map((v, vi) => [`variants[${vi}] (${v && v.when})`, v && v.text])];
    for (const [field, text] of texts) if (words(text) > 12) add('tour-shape', 'G-07', 'words', at, `${field} has ${words(text)} words, at most 12: the fix is two steps, never a trimmed one`); // M:words
    if (s.skip === false) add('tour-shape', 'G-07', 'no-skip', at, 'the step cannot be skipped; every step can be'); // M:no-skip
    if (s.kind === 'do' && !s.result) add('tour-shape', 'G-16', 'do-no-result', at, 'a do step with no result condition: it moves on only when the screen shows the result it names'); // M:do-no-result
    const po = obj(s.practiceOnly);
    const missing = ['modeTest', 'stopTest'].filter(k => !po[k]);
    const tp = s.class === 'T' || s.class === 'P';
    // at stage demo a practice-only step may name its tests later (one note); at stage app it names both
    const practiceGap = !!s.practiceOnly && missing.length > 0;
    if (s.kind === 'do' && ((tp && !s.practiceOnly) || (!!s.practiceOnly && s.class !== 'P') || (practiceGap && M.stage !== 'demo'))) add('tour-no-commit', 'G-20', 'do-class', at, s.class === 'T' && s.practiceOnly ? 'a do step classed T tells a real person: it is a stop step, in practice mode too (the mode is for a numbered document, a payment and a close for good, classed P)' : s.practiceOnly && s.class !== 'P' ? `a practice-only do step ${s.class ? `classed ${s.class}` : 'with no class'}: practice mode is only for a numbered document, a payment and a close for good: if it issues a numbered document, takes a payment or closes for good, class it P and keep it practice-only; only any other do step that tells no one drops practiceOnly and names its G-20 safeTest` : s.practiceOnly ? `a practice-only do step without ${missing.join(' and ')}: it is a stop step in the mode too` : `a do step classed ${s.class} is not practice-only: it is a stop step`); // M:do-class
    if (s.kind === 'do' && practiceGap && M.stage === 'demo') demoPractice.push(at); // M:demo-practice
    if (s.kind === 'do' && s.on === undefined) add('tour-no-commit', 'G-08', 'do-no-on', at, 'a do step that does not say whose record it acts on: on: "sample", or on: "none" when it acts on no person\'s record (an empty slot, a filter, a settings tab, a field in a settings form that has its own save); a save of a business-wide setting, including a switch or a field that saves as it changes, is a stop step, never a do step'); // M:do-no-on
    if (s.kind === 'do' && s.on === 'none' && onRecord(s)) add('tour-no-commit', 'G-08', 'none-on-record', at, isRecordAnchor(s.anchor) ? `a do step with on: "none" on "${s.anchor}", which the inventory lists as a control of the sample's record (recordAnchors); the step is at on: "sample", and on a row in a list it is lit through a resolver's own id that picks the sample's row (as cal.ended-appointment), never the row's plain id, which binds the first visible row` : `a do step with on: "none" whose result names a control the inventory lists in recordAnchors, or a container (a list of people's rows, or an id every row carries), so its lit target reaches a person's record; for a step that filters a list or opens a window, name the state (stateEquals) or the window (open) as the result, not a control inside it, and name a window only when it is nobody's (a menu, a filter panel); a list of people, and the plain id every row in it carries, go in containerAnchors, and the step lights the sample's own row at on: "sample" through a resolver's own id`); // M:none-on-record
    if (s.kind === 'do' && s.class === 'S' && s.on !== 'sample') add('tour-no-commit', 'G-20', 'save-not-sample', at, 'a do step classed S (it saves) that does not carry on: "sample": a save done in a tour is done on the sample\'s record, on a control that record carries; saving a business-wide rule or a real person\'s record is a stop step'); // M:save-not-sample
    if (INV && s.kind === 'do' && (isBulkAnchor(s.anchor) || isBulkAnchor(resultAnchor(s)))) add('tour-no-commit', 'G-20', 'do-on-bulk', at, `a do step ${isBulkAnchor(s.anchor) ? `on "${s.anchor}"` : `whose result names "${resultAnchor(s)}"`}, which the inventory lists in bulkAnchors (an export, a print, a download or share, an import, or an action on many people's records at once): a tour never does one, whatever its on and its class; it shows that control or stops at it (a stop step there is classed T); for a step that opens a menu or a window, name the window (open) as the result, not a control inside it`); // M:do-on-bulk
    if (INV && s.kind === 'do' && isContainerAnchor(s.anchor)) add('tour-no-commit', 'G-08', 'do-on-container', at, `a do step lit on "${s.anchor}", which the inventory lists in containerAnchors (a list, a column, the calendar grid, or an id every row of a list carries): the lit target of a do step is live, so she could press any person's row inside it, or the first visible row, whatever its on and its class; light the sample's own row or control at on: "sample", through a resolver that picks it and is listed in recordAnchors (its own id, as cal.ended-appointment, never the plain id every row carries, which binds the first visible row), or, for an empty slot, the slot through a resolver (cal.free-slot) at on: "none"`); // M:do-on-container
    if (INV && s.kind === 'do' && s.on === 'sample' && !isRecordAnchor(s.anchor) && !isBulkAnchor(s.anchor) && !isContainerAnchor(s.anchor)) add('tour-no-commit', s.class === 'S' || s.practiceOnly ? 'G-20' : 'G-08', 'sample-not-record', at, `a do step at on: "sample" on "${s.anchor}", which no recordAnchors lists. If it sits in a window opened on her (a step before it in the tour opened it on her), list it in recordAnchors and keep on: "sample"; if it sits on her row in a list, light it through a resolver's own id that picks her row and list that id; only a control that is nobody's record (a tab, a filter, a business-wide setting) changes the step, to on: "none", and a save there (a business-wide setting) is a stop step, never a do step; never answer this finding by setting on: "none" on a person's control${s.practiceOnly ? '; a practice-only step stays on the sample\'s copy' : ''}`); // M:sample-not-record
    if (s.practiceOnly && s.on !== 'sample') add('tour-no-commit', 'G-20', 'practice-not-sample', at, 'a practice-only step without on: "sample": inside the mode the tour runs on the sample record\'s copy, never on a real person\'s'); // M:practice-not-sample
    if (s.kind === 'do' && plain(s.result) && s.result.kind === 'recordOpen' && s.on !== 'sample') add('tour-no-commit', 'G-08', 'record-not-sample', at, 'a do step opens a person\'s record (recordOpen) and does not carry on: "sample": tours run on the sample record, never on real data; if the control is nobody\'s (a search, a button that opens a list), split the step: it filters or opens at on: "none" with a stateEquals or open result (a window that is nobody\'s), and the next step lights the sample\'s own row at on: "sample" through a resolver, with the recordOpen result, or is a stop step'); // M:record-not-sample
    if (s.kind === 'do' && !s.practiceOnly && !s.safeTest) noTest.push(at);
    for (const n of arr(s.need)) if (n && n.do !== 'reopen' && n.do !== 'selectSample') add('tour-no-commit', 'G-08', 'need-action', at, `the resume action "${n.do}" is not one of the two a tour does by itself (reopen a window, select the sample record again)`); // M:need-action
  });
  if (t.chapter) {
    // every run of the chapter, on the phone and on the computer, ends at a result or a stop step: walk back from
    // the end over the steps of that device; a step under a condition may be the last, so the walk goes on to the
    // first step that certainly runs there
    const bad = new Set();
    for (const d of ['phone', 'desktop']) {
      for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i];
        if (s.when === (d === 'phone' ? 'desktop' : 'phone')) continue; // M:walk-skip
        if (!okEnd(s)) bad.add(i);
        if (!s.when || s.when === d) break; // M:walk-stop
      }
    }
    for (const i of [...bad].sort((a, b) => a - b)) add('tour-shape', 'G-07', 'chapter-end', { tour: t.id, step: i + 1, path: `/tours/${ti}/steps/${i}` }, `chapter ${arr(t.chapter).join(' of ')} can end at this "${steps[i].kind}" step${steps[i].kind === 'do' ? ' with no result' : ''}, neither at a result nor at a stop step`); // M:chapter-end
  }
  for (const k of Object.keys(obj(t.start))) if (!START_KEYS.includes(k)) add('tour-no-commit', 'G-08', 'start-key', { tour: t.id, path: `/tours/${ti}/start` }, `start asks for "${k}"; a tour that starts only goes to its screen and the sample record, sets the view and the date, and closes a window that holds no unsaved input`); // M:start-key
  for (const k of arr(t.auto)) if (!coreKeys.has(k)) add('tour-shape', 'G-21', 'auto-not-core', { tour: t.id, path: `/tours/${ti}/auto` }, `opens by itself on "${k}", which is not a core screen`); // M:auto-not-core
  if (steps.length > 6 && !t.chapter) notes.push({ check: 'tour-shape', tour: t.id, message: `${steps.length} steps and no chapter break; the reviewer checks only that a chapter break, if there is one, sits at a real result, and length alone is never a finding` });
});
if (demoPractice.length) notes.push({ check: 'tour-no-commit', message: `${demoPractice.length} practice-only steps name no mode test or stop test yet; each needs both before the app runs this tour` });
const unjudged = INV ? 0 : tours.reduce((n, t) => n + arr(plain(t) && t.steps).filter(s => plain(s) && s.kind === 'do').length, 0);
if (unjudged) notes.push({ check: 'tour-no-commit', message: `${unjudged} do steps were not judged against the inventory (recordAnchors, bulkAnchors, containerAnchors: none-on-record, sample-not-record, sample-not-opened, sample-no-need, do-on-bulk, do-on-container): that needs --inventory` }); // M:none-no-inventory
if (requireStage && M.stage !== requireStage) add('manifest', null, 'stage-required', { path: '/stage' }, `the manifest is at stage "${M.stage}", and this run requires "${requireStage}"`); // M:stage-required
if (M && M.stage === 'demo' && noTest.length) { notes.push({ check: 'tour-no-commit', message: `${noTest.length} do steps name no G-20 test; each needs one before the app runs this tour` }); noTest.length = 0; } // M:demo-stage
for (const at of noTest) add('tour-no-commit', 'G-20', 'do-no-safe-test', at, 'a do step names no test of G-20 (safeTest, or the practice mode\'s modeTest): it is a stop step'); // M:do-no-safe-test

// ---------- tour-inventory and help-refs ----------
if (INV) {
  const noTour = obj(M && M.noTour);
  const screenWhy = obj(noTour.screens);
  const taskWhy = arr(noTour.tasks);
  // the anchors known on each screen: those the steps of a tour on that screen point at (with the args they use), and
  // the manifest's anchors entries for that screen (any arg, unless the entry lists its args)
  const refId = a => (typeof a === 'string' ? a : a && a.anchor);
  const ANY = Symbol('any arg');
  const knownOn = new Map();
  const know = (k, id, arg) => {
    if (!knownOn.has(k)) knownOn.set(k, new Map());
    const m = knownOn.get(k);
    if (!m.has(id)) m.set(id, new Set());
    if (arg !== undefined) m.get(id).add(arg);
  };
  for (const t of tours) for (const k of screensOf(t)) for (const s of arr(t.steps)) {
    if (s.anchor) know(k, s.anchor, s.arg);
    const r = s.result;
    if (plain(r) && ['present', 'fieldChanged', 'recordOpen'].includes(r.kind) && refId(r.arg)) know(k, refId(r.arg), plain(r.arg) ? r.arg.arg : undefined);
  }
  for (const [id, e] of Object.entries(obj(M.anchors))) for (const k of arr(obj(e).screens)) {
    know(k, id);
    for (const a of Array.isArray(obj(e).args) ? e.args : [ANY]) know(k, id, a); // M:anchor-args
  }
  const known = (k, a) => {
    const args = knownOn.has(k) && knownOn.get(k).get(refId(a));
    if (!args) return false;
    return !plain(a) || a.arg === undefined || args.has(ANY) || args.has(a.arg);
  };
  const named = a => `"${refId(a)}"${plain(a) && a.arg !== undefined ? ` with arg "${a.arg}"` : ''}`;
  const toursOn = key => tours.filter(t => arr(t.screens).includes(key));
  const covered = (key, task) => toursOn(key).some(t => arr(t.tasks).includes(task)) || !!screenWhy[key] || taskWhy.some(x => x && x.screen === key && x.task === task);
  const needTour = (key, task, where) => {
    if (!covered(key, task)) add('tour-inventory', 'G-19', 'task-no-tour', where, `"${task}" has no tour and no written reason`); // M:task-no-tour
  };
  tours.forEach((t, ti) => {
    // auto and start.screen are already among the tour's or its job's screens (auto-screen, start-screen)
    if (!screensOf(t).length) add('tour-inventory', 'G-19', 'screen-none', { tour: t.id, path: `/tours/${ti}/screens` }, 'names no screen, nor does its job: where it stands, and so its articles, tasks and recordAnchors, cannot be judged'); // M:screen-none
    for (const k of new Set(arr(t.screens))) if (!plain(obj(INV.screens)[k])) add('tour-inventory', 'G-19', 'screen-unknown', { tour: t.id, path: `/tours/${ti}` }, `stands on "${k}", which the inventory does not have: its articles, tasks and recordAnchors cannot be judged`); // M:screen-unknown
  });
  for (const [key, sc] of Object.entries(obj(INV.screens))) {
    if (sc && sc.menu === true && !toursOn(key).length && !screenWhy[key]) add('tour-inventory', 'G-19', 'screen-no-tour', { screen: key, path: `inventory/screens/${key}` }, 'the menu reaches this screen, and it has no tour and no written reason'); // M:screen-no-tour
    arr(sc && sc.tasks).forEach((task, i) => {
      if (!task || typeof task.text !== 'string') return;
      const where = { screen: key, task: i + 1, path: `inventory/screens/${key}/tasks/${i}` };
      needTour(key, task.text, where);
      for (const a of arr(task.anchors)) if (!known(key, a)) add('help-refs', 'G-02, G-19', 'article-anchor', where, `the article on ${key} names the control ${named(a)}, which no tour on ${key} points at or names as a result and no anchors entry for ${key} lists`); // M:article-anchor
      const tour = task.tour && byId.get(task.tour);
      if (task.tour && (!tour || !arr(tour.screens).includes(key) || !arr(tour.tasks).includes(task.text))) add('help-refs', 'G-02, G-19', 'article-tour', where, tour ? `the article names tour "${task.tour}", which does not list "${task.text}" on ${key}` : `the article names tour "${task.tour}", which does not exist`); // M:article-tour
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
