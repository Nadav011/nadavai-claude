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
//                   lacks or a view, and a core key's viewOf that names a screen outside its core entry; a
//                   part on a do step, a part that names the step's own anchor, and with --inventory a part that is
//                   no known anchor on the tour's screens; a step title over four words or equal to its sentence
//                   or to the tour's title, a tour promise over six words, and at stage "app" a step with no
//                   title or a tour with no promise (at stage "demo" one note each, with the count); it notes
//                   every tour of more than six steps with no chapter break, which is never a finding
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
//                   a reopen too, and so does an opener whose control anchorWindows puts in a window); a do step with no G-20 test named (at stage "demo" these, and a
//                   practice-only step's missing tests, are notes with the count); a resume action other
//                   than reopening a window or selecting the sample record again, or a need that lists
//                   selectSample before a reopen or with no reopen before it; with --inventory, a need whose last
//                   reopen is not the window the inventory's anchorWindows gives for the step's control, a picker
//                   whose window the step before it did not open, a do step after the picker on a control in
//                   another window, a do step other than the opener on a control anchorWindows marks "screen",
//                   a do step in a window the inventory's pickingWindows marks as picking a person whose need
//                   names no selectSample (the picker's own step excepted), and a need that runs selectSample
//                   after a last reopen of a window not marked so;
//                   a `start` key other than
//                   screen, record, view, date and close. With --inventory, which holds recordAnchors (ids
//                   that resolve to the sample's record), bulkAnchors (many at once) and containerAnchors
//                   (elements that hold people's rows, and ids every row carries): a do step at on: "none"
//                   on a record control, or whose result names a record control or a container; a do step at
//                   on: "sample" on a control no list holds; a do step on a bulk control, or whose result
//                   names one; a do step lit on a container (each at any on and any class); and an id in
//                   two of the lists, a listed id with no anchorWindows entry, an entry for an unlisted id, a
//                   window anchorWindows names with no pickingWindows mark, or a mark on a window it does not
//                   name (manifest); a picker whose window pickingWindows marks false, and a do step at
//                   on: "none" whose open or step result names such a window (tour-no-commit). A do step on a
//                   control that another step stops at classed T or P (a stop with no arg covers every arg, a do
//                   step with no arg meets every stop on its id), other than a practice-only step classed P on a
//                   control no step stops at classed T (tour-no-commit). At stage app, a manifest whose tours have
//                   do steps and that names no inOrderRun, or names one whose date is after today or not a day of
//                   the calendar, or, with --inventory, whose key is not this manifest's and inventory's
//                   (--run-key prints it, needs --inventory, and prints none for content that fails its schema,
//                   exit 2); at stage demo, any inOrderRun
//                   (tour-no-commit).
//                   Without --inventory a note counts the do steps not judged
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
import { createHash } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node tour-check.mjs <tours.json> [--inventory <inventory.json>] [--require-stage demo|app] [--json] [--run-key]\n  --run-key prints the key an inOrderRun record carries for this manifest and inventory (it needs --inventory), and exits\n  the app\'s own check: node tour-check.mjs tours.json --inventory inventory.json --require-stage app';
const NOT_COVERED = [
  'tour-no-commit: the engine itself dispatching a click, a submit or a key on a step target (checked by running the tours in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app; the live app then does what was checked only under the live-app conditions there)',
  'tour-no-commit: that a tour\'s start does only what its `start` says, and asks before closing a window that holds unsaved input (checked by running the tours in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app; the live app then does what was checked only under the live-app conditions there)',
  'tour-no-commit: whether a step\'s class is right (a numbered document, a payment and a close for good are always P, a send is T, a save is S); the manifest\'s class is taken as written, so a save or a send written as an unclassed do step passes (the reviewer; at on: "sample" also the step\'s safeTest, which performs the action on the sample record; at on: "none" no test reaches a business-wide save, so an unclassed one there, or one on a switch or a field that saves as it changes, passes and only the reviewer stops it); a practice-only step is always classed P, so an unclassed do step always names a safeTest; a stop step on a bulk control is classed T, and its class is not read either',
  'tour-no-commit: a step classed P that also tells someone (a practice receipt that is also sent) carries one class, P; that its mode test also shows the message is held is the project\'s suite\'s (the checker reads one class)',
  'tour-no-commit: that the practice mode\'s test covers every outbound path (no document number; no documents, payment or messaging provider; no calendar or webhook call): the test is named, not read',
  'tour-shape: a device run left empty, every step of a tour marked for the other device (the reviewer)',
  'tour-shape: two tours that open by themselves on one core screen, or a later chapter that opens by itself (the reviewer)',
  'tour-no-commit: a step sentence that says nothing goes out, or that no one is told, where no test shows it (the reviewer, against the G-20 test or the practice mode\'s test)',
  'tour-no-commit: an inventory that declares no recordAnchors, or too few, leaves on: "none" unjudged with no note (judged by pressing in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app)',
  'tour-inventory: a result that routes to a screen the inventory does not have (only the screens a tour lists are read)',
  'tour-no-commit: that a do step at on: "sample" on a control recordAnchors lists changes only the sample\'s record (a save that also changes a business-wide rule), never a business-wide rule (a service\'s default duration) or many people\'s records (the day\'s list printed), in a window opened on her and in a window that picks a person alike: the inventory\'s reviewer runs every do step of every tour in order, on the sample, practice-only steps inside practice mode, in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app, each tour from a known state of the copy (a switch left set by an earlier run is the shape below), a save whose window holds a switch or a remembered choice that could make it business-wide once with that field in each state, and after each step looks at the sample\'s record (it changed as the step says), at the settings the step\'s window can reach and every list of other people, as the day\'s list (unchanged), and at the recorder, the provider gate and the browser\'s effects (nothing the step caused, or only what the step\'s class says, for the sample alone): a print, an export, a download, a send, a charge, a clipboard write or a navigation out of the app seen there means the control is not a record control, so the run fails and inOrderRun is not written (a send that leaves only when a scheduled job runs is not this look\'s to see: G-20\'s test, which runs the jobs past the latest reminder, catches it); after a run that passes, the reviewer who did it writes the copy\'s name, the date and the key tour-check.mjs --run-key prints into the manifest\'s inOrderRun (tour-anchors, run-not-recorded); in order, because a save\'s effect can depend on a field an earlier step set (a "save as the clinic\'s template" switch set at one step, then her note saved at the next: each control pressed alone changes only her record, and the checker passes the tour), and in the recording copy, because a wrongly listed control pressed in the live app would itself save the business-wide rule or act on real people\'s records; the checker requires only that the control is a record control, nothing in one step or in the inventory tells a save of a business-wide rule from a save of her record (class S says the step saves, not what), across steps it reads one signal, a do step on a control another step stops at classed T or P (stopped-elsewhere), and of the run only that the manifest at stage "app" with do steps names a copy, a day not after today (run-date) and a key that is the digest of this manifest and inventory (run-not-recorded, run-stale, which runs only with --inventory; at stage "demo" a record is a finding, run-at-demo), and the key leaves out the words she reads and a step\'s part (tours.schema.json, inOrderRun.key, names them), so a change to those keeps the record, and covers no bindings, app code or build, so it shows only that the record was written for this exact content, not that the run was done, or done in the recording copy, or after the last change to the app, a control listed in both recordAnchors and bulkAnchors fails anchor-both and its do step do-on-bulk, and the step\'s safeTest shows that nothing leaves, not what changed',
  'tour-no-commit: a stop step followed by a step that depends on that control having been pressed (the manifest does not record what a control opens)',
  'tour-no-commit: that the named tests exist and pass (the project\'s own suite)',
  'tour-no-commit: stopped-elsewhere matches a control by its id and arg: a stop with no arg covers every arg of that id, a do step with no arg every stop on that id (its binding finds the first visible member), and two different args are two controls; the same control under another id (a resolver\'s own id, as patients.sample-charge for the row\'s patients.charge) is not matched (the reviewer makes a do step on such an alias a stop step, classed as the stop on the other id), and a control no step stops at classed T or P is not read (the reviewer)',
  'tour-no-commit: without --inventory, none-on-record, sample-not-record, sample-not-opened, sample-no-need, need-window, picker-window, screen-anchor, do-on-bulk, do-on-container, select-window, picker-mark, none-window, anchor-both, window-missing, window-extra, picking-missing, picking-extra and run-stale: the three lists are in the inventory, and inOrderRun\'s key covers it (the run notes how many do steps it did not judge, and that run-stale did not run)',
  'tour-no-commit: an anchor family whose members differ (one exports or sits on a person\'s record, another only shows): a listed id covers every arg of its family, so a member that was not given its own id passes; such a control gets its own id (the reviewer)',
  'tour-no-commit: that a step marked on: "sample" really reaches the sample\'s record and no other (the bindings, checked in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app: they select by the sample\'s record id, never the first visible row, or, inside a window opened on her, bind the window\'s own control); that the earlier opener opened her record where the step\'s control is reached, and that no step between them left it or opened another record (the reviewer); the checker takes the window each control sits in from the inventory\'s anchorWindows, requires the need\'s last reopen to name it, and trusts the map: that each listed control really sits in the window anchorWindows names, or on the screen itself, is the inventory reviewer\'s check (the inventory\'s reviewer opens each listed control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the window it sits in, or that it sits on the screen itself), and a wrong entry lets a need that reopens the wrong window pass, or, where it says "screen" for a control that sits in a window, lets the step that opens her record through it name no need and press in whatever window is open; that pickingWindows marks a window true exactly when it picks a person is the inventory reviewer\'s check too, and a window wrongly marked false lets a step there name no selectSample where no step at on: "none" names it in an open or step result (none-window) and no picker step sits in it (picker-mark); only the flag, and whether the control is one recordAnchors lists, are read, and recordAnchors holds only ids that resolve to the sample\'s record (a resolver\'s own id, a control in a window opened on her, a control of a window that picks a person (the picker and that window\'s other controls), never, in either window, a control that acts on many people at once or saves a business-wide rule), while an id every row of a list carries is in containerAnchors; such an id listed in recordAnchors by mistake passes (the reviewer, and tour-anchors in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app)',
  'tour-shape: that a key marked viewOf really is a view of that screen (the reviewer)',
  'tour-no-commit: that a need of reopen puts back the tour\'s own record, the sample\'s, and not the last one open, that a window opened on one person counts as open (isOpen) only while it shows the sample\'s record, and that the engine runs a step\'s need each time it reaches the step, not only after a resume or a skip: a reopen is skipped only when its window is already open on her (isOpen; a window that picks a person counts as open only while it is the tour\'s own and every person field it has holds only the sample, or is empty (a person field names whose record the step acts on, a patient or a client, a second one such as a family member or a referrer included, and a field that lists several people holds only the sample when she is the only one in it; a field that names staff, such as the therapist, is not one, and a binding that counts it anyway only makes the reopen run more often)), and selectSample runs after the reopen, and the need lists them in that order: every reopen closes what it replaces without saving it, through that window\'s own close, and where a window\'s own close saves, its reopen is not a need and the step only shows; a reopen of a window that picks a person closes any other window of that kind (an existing appointment\'s edit form included) and opens the tour\'s own afresh with every person field empty, so isOpen holds after it; the tour\'s own is the new window the tour\'s step opened, never an existing record\'s window at the same slot; the need\'s last reopen names the window the inventory\'s anchorWindows gives for the step\'s control; a control anchorWindows marks screen, a resolver\'s own control on the screen itself, is acted on only by the step that opens her record through it; a step that opens her record through a control inside a window reopens that window on her first, as every other step there does (a window opened on one person, such as a patient card, counts as open only while it shows the sample\'s record); the do step before the picker opened the window anchorWindows gives for the picker\'s control, and every later do step\'s control sits in that window until a step that opens her record; selectSample runs only in the tour\'s own window, the one the step\'s reopen just opened or found open on her, and only where that window picks a person (the inventory\'s pickingWindows marks it true): the engine passes it the id of the window the need\'s last reopen names, and it picks her there, asks nothing, never runs in a window that holds an existing record, and reports whether the sample is now picked in the tour\'s own window. After the need\'s reopens the engine checks the last reopen\'s window with isOpen: when the bindings have no such window, or it is not open on her, the step and every later do step of the tour only show, as after a decline. The need asks one thing: before a reopen closes a form that holds her input, it asks, saying her changes there will be lost; when she declines, nothing is closed and selectSample does not run; when she declines, or selectSample does not report the sample picked, the step only shows, and every later do step of the tour only shows too, never pressing, across a resume and on another device, until a later reopen she accepts opens the tour\'s own afresh (and, where the need names selectSample, it reports her picked); and that the engine passes selectSample the window the need\'s last reopen names and treats any answer but yes as a decline, that the bindings\' selectSample refuses (reports no) in a window that picks no person, holds an existing record or is not the tour\'s own, that the engine keeps every later do step of the tour to showing only after a decline or a no, across a resume and on another device, until a reopen she accepts, and that every window\'s own close saves nothing (the checker takes the window a control sits in from the inventory\'s anchorWindows and whether a window picks a person from its pickingWindows, and does not know what a close does); and that while a window is open on her no second window of the same kind, open on someone else, holds the step\'s control where the binding finds it first (the bindings and the engine, checked by running the tours in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app, which then does what was checked only under the live-app conditions there; the reviewer of the bindings checks isOpen against every person field a window has; the suite checks only the example\'s bindings)',
  'tour-anchors: every anchor (the anchors entries and the articles\' too), result, condition, window and state id resolving on its screen (the screen preview (defined in help-system.md, "The tour manifest"), which counts only for what the screen shows), and a step marked on: "sample" resolving to the sample\'s record and no other (the recording copy (defined in help-system.md, "The tour manifest"), with the live-app conditions)); a check or a reviewer that presses or runs anything to check this list does it in the recording copy, and what the screen only shows in the screen preview, never in the live app, where a wrongly listed control pressed would itself save a business-wide rule or act on real people\'s records; a project with no recording copy gives its tours no do steps, and its showing and stop steps light no control (each is a centred card, as the stop-step press test below says), whatever preview it has: building one is the project\'s own work and cost decision; a question only the live app answers (the sample patient exists, is marked, and is the only one marked; which automatic senders are on) is answered there by looking, never by pressing',
  'tour-anchors: that a step\'s part sits inside the element its anchor resolves to, is looked for only there, and is lit instead of the anchor only on a short screen (the screen preview (defined in help-system.md, "The tour manifest"), which counts only for what the screen shows)',
  'tour-shape: whether a step\'s title and a tour\'s promise say the right thing (a title that only rewords the sentence, a promise that names a screen instead of what she can do after the tour): the checker counts their words and catches only a title equal to its sentence or to the tour\'s title (the reviewer)',
  'tour-shape: whether a chapter break sits at a real result (the reviewer)',
  'tour-anchors: a showing or stop step whose lit control responds; a test of the built engine presses the lit control of a stop step and shows that nothing happens (the recording copy (defined in help-system.md, "The tour manifest"), never the live app); until that test has passed there, no step of a tour anyone runs lights a control, whatever its class (T, P or S, or a showing step\'s control, which has none): the checker cannot know whether a project has a recording copy or ran the test, so a manifest whose showing and stop steps carry an anchor passes; until then write each such step with no anchor, a centred card that names the control, and give the anchors back once the test passes (the reviewer)',
  'tour-no-commit: that the inventory\'s three lists are complete: recordAnchors every id that resolves to the sample\'s record (a resolver\'s own id, a control in a window opened on her) and every control of a window that picks a person (the picker and that window\'s other controls), except, in either window, a control that acts on many people at once (a print of the day\'s list), which is in bulkAnchors, and one that saves a business-wide rule (a service\'s default duration), which is in none of the three lists and at which a tour stops: neither is ever in recordAnchors, bulkAnchors every control that acts on many people\'s records at once, containerAnchors every element that holds people\'s rows and every id each row carries; an unlisted one lets the step pass (what a press on a control reaches is judged by pressing in the recording copy (defined in help-system.md, "The tour manifest"), and that an id sits on every row in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app)',
  'tour-no-commit: that what a step at on: "none" lands on through its result, a window (open), a wizard window (step), a screen (route or view) or a custom result, is nobody\'s (a menu, a filter panel), never a person\'s page, card or window: the manifest does not record whose it is (the reviewer); the checker reads only an open or step result that names a window pickingWindows marks false, a window opened on one person (none-window)',
  'tour-no-commit: that a person picker\'s step has a result that checks the sample was picked (a custom result, as appt.sample-picked), that picking saves and sends nothing by itself, and that no do step on that window\'s other controls comes before it: the reviewer, and the bindings (the checker requires that the step before it opened the window anchorWindows gives for the picker\'s control); the checker takes an unclassed pick step with a custom result, after a step at on: "none" that opened a window on the same device under no other condition, as that picker',
  'tour-no-commit: that a step the checker takes as the opener through a recordOpen result naming its own control is a resolver\'s own id (a key of the bindings\' anchors and records, which select by the sample\'s record id), never a window\'s own plain control, though a resolver\'s own id may sit inside a window (her appointment row in a patient card): the reviewer, against the bindings; the checker spares a need only to an opener on a control anchorWindows marks "screen", and holds an opener whose control sits in a window to a need whose last reopen names that window',
  'tour-no-commit: that every window anchorWindows names exists and the bindings can reopen it (a misspelt window id in the map fails need-window on each step on that control until the need names the same id, and then only the bindings show there is no such window): the bindings, and running them in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app (the suite checks the example\'s map against its bindings)',
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
let runKeyOnly = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') continue;
  else if (a === '--run-key') runKeyOnly = true;
  else if (a === '--inventory') { inventoryFile = argv[++i]; if (!inventoryFile) die('--inventory needs a file'); }
  else if (a === '--require-stage') { requireStage = argv[++i]; if (requireStage !== 'demo' && requireStage !== 'app') die('--require-stage needs demo or app'); }
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('-')) die(`unknown option ${a}`);
  else if (manifestFile) die(`one manifest at a time (got ${manifestFile} and ${a})`);
  else manifestFile = a;
}
if (!manifestFile) die('no manifest given');
if (runKeyOnly && !inventoryFile) die('--run-key needs --inventory: the key covers the manifest and its inventory, and a key printed without it never matches the app\'s own check'); // M:run-key-inventory
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
// the key an inOrderRun record carries: a digest of the manifest without the record and of the inventory, leaving out
// only what decides nothing the run presses: the words she reads (a tour's title, jobTitle, promise, area, where and
// finish, a step's title, text, showText and its variants' text, a screen's title in the inventory) and a step's part (what is lit on a
// showing or stop step, which the run never presses; on a do step it is part-do), so a change to those keeps the record
// and any other change, or a record written for other content (the example's), does not match
const omit = (o, ks) => (plain(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k))) : o);
const keyedStep = st => (plain(st) ? { ...omit(st, ['title', 'text', 'showText', 'part']), ...(Array.isArray(st.variants) ? { variants: st.variants.map(v => omit(v, ['text'])) } : {}) } : st);
const keyedTour = t => (plain(t) ? { ...omit(t, ['title', 'jobTitle', 'promise', 'area', 'where', 'finish']), ...(Array.isArray(t.steps) ? { steps: t.steps.map(keyedStep) } : {}) } : t);
const keyedManifest = m => ({ ...omit(m, ['inOrderRun']), ...(Array.isArray(m.tours) ? { tours: m.tours.map(keyedTour) } : {}) });
const keyedInventory = i => (plain(i) && plain(i.screens) ? { ...i, screens: Object.fromEntries(Object.entries(i.screens).map(([k, sc]) => [k, omit(sc, ['title'])])) } : i);
const stable = x => (Array.isArray(x) ? `[${x.map(stable).join(',')}]` : plain(x) ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}` : JSON.stringify(x));
const RUN_KEY = createHash('sha256').update(stable({ manifest: keyedManifest(M), inventory: keyedInventory(INV) })).digest('hex');
// a key is printed only for content of the format: a record written for content the app's own check fails on schema
// could never pass, so --run-key refuses it (exit 2) and names the first place the schema does not hold
const schemaGaps = () => [...validate(TOURS_SCHEMA, M).map(e => `the manifest at ${e.path || '/'}: ${e.message}`), ...(INV ? validate(INV_SCHEMA, INV).map(e => `the inventory at ${e.path || '/'}: ${e.message}`) : [])];
if (runKeyOnly && schemaGaps().length) malformed(`--run-key prints no key for content that does not have the shape of its schema (${schemaGaps()[0]}${schemaGaps().length > 1 ? `, and ${schemaGaps().length - 1} more` : ''}): an inOrderRun record is written only for content the app's own check can pass; fix what the schema names, run the check, and then --run-key`); // M:run-key-schema
if (runKeyOnly) { console.log(RUN_KEY); process.exit(0); }
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
for (const id of new Set(LISTS.flatMap(k => [...listed[k]]))) if (listsOf(id).length > 1) add('manifest', null, 'anchor-both', { path: 'inventory/screens' }, `"${id}" is in ${listsOf(id).join(' and ')} of the inventory: a control is one person's, many people's at once, or a container of people's rows, never two of these; an id every row of a list carries is a container, and only a resolver's own id, a control in a window opened on her, or a control of a window that picks a person (the picker and that window's other controls) is in recordAnchors, never, in either window, one that acts on many people at once (a print of the day's list) or saves a business-wide rule: a control that acts on many people at once is in bulkAnchors alone, and a tour shows it or stops at it`); // M:anchor-both
// the window each control recordAnchors lists sits in (anchorWindows, at the inventory's root): a window id a need can
// reopen, or "screen" for a resolver's own control on the screen itself. The checker trusts the map; the inventory's
// reviewer confirms each entry in the screen preview (what the screen shows), never in the live app
const AW = obj(INV && INV.anchorWindows);
const homeOf = id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(AW, id) && typeof AW[id] === 'string' ? AW[id] : undefined);
if (INV) for (const id of listed.recordAnchors) if (!homeOf(id)) add('manifest', null, 'window-missing', { path: 'inventory/anchorWindows' }, `"${id}" is in recordAnchors and anchorWindows names no window for it: every control recordAnchors lists names the window it sits in, the window id a need reopens to reach it, or "screen" for a resolver's own control on the screen itself (as cal.ended-appointment); the inventory's reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms it`); // M:window-missing
if (INV) for (const id of Object.keys(AW)) if (!listed.recordAnchors.has(id)) add('manifest', null, 'window-extra', { path: `inventory/anchorWindows/${id}` }, `anchorWindows names a window for "${id}", which no recordAnchors lists: the map holds only the controls recordAnchors lists; list it there if it is a control of the sample's record, or remove its entry`); // M:window-extra
// whether each window anchorWindows names picks a person (pickingWindows, at the inventory's root): true for a window
// opened on nobody with a person field (the booking form), false for one opened on one person (her drawer). The
// checker takes it from the inventory, never from the manifest's picker steps, and trusts it
const PW = obj(INV && INV.pickingWindows);
const picks = w => typeof w === 'string' && Object.prototype.hasOwnProperty.call(PW, w) && PW[w] === true;
if (INV) for (const w of new Set(Object.values(AW).filter(v => typeof v === 'string' && v !== 'screen'))) if (typeof (Object.prototype.hasOwnProperty.call(PW, w) ? PW[w] : undefined) !== 'boolean') add('manifest', null, 'picking-missing', { path: 'inventory/pickingWindows' }, `"${w}", a window anchorWindows names, has no pickingWindows mark: mark it true when it picks a person (a window opened on nobody with a person field, as a booking form) or false when it does not (a window opened on one person, as her drawer); the checker requires selectSample in the need of every do step at on: "sample" whose control sits in a window marked true, and the inventory's reviewer opens each window in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms its mark`); // M:picking-missing
if (INV) for (const w of Object.keys(PW)) if (!Object.values(AW).includes(w)) add('manifest', null, 'picking-extra', { path: `inventory/pickingWindows/${w}` }, `pickingWindows marks "${w}", a window no anchorWindows entry names: the marks cover exactly the windows anchorWindows names; if a listed control sits in "${w}", name it in that control\'s anchorWindows entry, and otherwise remove the mark`); // M:picking-extra
// the windows the manifest opens (an open result, a step result) or reopens (a need): a map entry named nowhere else is
// the likelier mistake when a need disagrees with it
const namedWindows = new Set(tours.flatMap(t => arr(t.steps).flatMap(st => (plain(st) ? [plain(st.result) && st.result.kind === 'open' ? st.result.arg : plain(st.result) && st.result.kind === 'step' ? obj(st.result.arg).window : undefined, ...arr(st.need).map(n => (n && n.do === 'reopen' ? n.window : undefined))] : []))));
const knownElsewhere = (w, id) => namedWindows.has(w) || Object.entries(AW).some(([k, v]) => k !== id && v === w);

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
// two wordings are the same when they differ only in spacing or in the punctuation at their end
const sameWords = (a, b) => typeof a === 'string' && typeof b === 'string' && a.replace(/[\s.!?:;,]+$/u, '').replace(/\s+/g, ' ').trim() === b.replace(/[\s.!?:;,]+$/u, '').replace(/\s+/g, ' ').trim();
const coreKeys = new Set(arr(M && M.core).flatMap(c => arr(c && c.screens)));
const noTest = []; // do steps that name no G-20 test: findings at stage app, one note at stage demo
const demoPractice = []; // practice-only steps at stage demo that name their tests later: one note
const demoTitle = []; // steps at stage demo with no title yet: one note
const demoPromise = []; // tours at stage demo with no promise yet: one note
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
// the window a do step's open or step result opened (the picker's window, from the step at on: "none" before it)
const windowOf = p => (p && plain(p.result) ? (p.result.kind === 'open' ? p.result.arg : p.result.kind === 'step' ? obj(p.result.arg).window : undefined) : undefined);
const opensOn = (s, prevDo) => (!opensSample(s, prevDo) ? [] : s.result.kind === 'recordOpen' ? DEVICES : DEVICES.filter(d => !prevDo.when || prevDo.when === d));
// a control's class is what pressing it does, in every tour: every step that stops at a control classed T or P. A stop with
// no arg covers every arg of its id, and a do step with no arg binds the first visible member, so it meets every stop on its id
const STOPS = tours.flatMap(t => arr(t.steps).map((s, si) => ({ s, at: `${t.id}:${si + 1}` }))).filter(({ s }) => s && s.kind === 'stop' && s.anchor && ['T', 'P'].includes(s.class)).map(({ s, at }) => ({ anchor: s.anchor, arg: s.arg, cls: s.class, at }));
const stopsOn = s => STOPS.filter(x => x.anchor === s.anchor && (x.arg === undefined || s.arg === undefined || x.arg === s.arg));
tours.forEach((t, ti) => {
  const steps = arr(t.steps);
  const opened = new Set(); // the devices on which an earlier step of this tour opened her record or picked her
  let prevDo = null; // the latest earlier do step of this tour
  const viaPicker = {}; // per device, whether the latest step that opened her record or picked her was the picker
  const pickerWindow = {}; // per device, the window that picker sits in (anchorWindows)
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
    // the window the step's control sits in, from the inventory's anchorWindows ("screen": a resolver's own control on
    // the screen itself); only an opener on the screen itself is spared a need and the map: an opener whose control
    // sits in a window reopens that window on her first, as every other step there does
    const home = homeOf(s.anchor);
    const inWindow = !!home && home !== 'screen';
    const opensInWindow = opensSample(s, prevDo) && !isPicker && inWindow;
    const inPicking = !isPicker && picks(home); // a step in a window that picks a person names selectSample after its reopen
    const needsSelect = inPicking; // after the picker every step sits in its window (picker-window), marked true (picker-mark)
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && (!opensSample(s, prevDo) || isPicker || inWindow) && (!reopens || (needsSelect && !selects))) add('tour-no-commit', 'G-08', 'sample-no-need', at, `a do step at on: "sample" on "${s.anchor}" that names no need that reopens a window${needsSelect ? ' and selects the sample again' : ''}: a resume or a skip reaches it ${isPicker ? 'without the step that opened its window' : opensInWindow ? `with "${home}", where anchorWindows puts its control, open on whoever it was opened for` : 'without the step that opened her record, or after she opened another record at an earlier step'}${afterPicker ? ', or after she picked another person in the picker\'s window' : inPicking ? `, or with the tour's own "${home}" opened afresh and nobody picked in it (pickingWindows marks "${home}" as picking a person)` : ''}, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen${opensInWindow ? ` ${home}` : ''})${isPicker ? ' alone (she picks herself, so the picker\'s own step names no selectSample)' : opensInWindow ? `, so the engine opens ${home} on her before the step presses in it${inPicking ? ', then selectSample, since it picks a person' : ''} (only an opener on the screen itself, which anchorWindows marks "screen", names no need)` : `, with selectSample as well where that window picks a person${afterPicker ? ', as the picker\'s window does' : inPicking ? `, as "${home}" does` : ''}`}; the engine runs that need each time it reaches the step: the reopen first, only when its window is not open on her, then selectSample, only in the window the reopen opened or found open on her`); // M:sample-no-need
    // the window the need's last reopen names, and the picker's window on the devices the step runs on
    const lastWindow = arr(s.need).filter(n => n && n.do === 'reopen').map(n => n.window).pop();
    const pickerHome = runsOn.map(d => viaPicker[d] && pickerWindow[d]).find(Boolean);
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && home === 'screen' && !(opensSample(s, prevDo) && s.result.kind === 'recordOpen')) add('tour-no-commit', 'G-08', 'screen-anchor', at, `a do step at on: "sample" on "${s.anchor}", which anchorWindows puts on the screen itself ("screen"): only the step that opens her record through a resolver's own control on the screen acts on a "screen" control, and any other step there acts in no window of hers that a need can put back; if the control sits in a window (a form on its own page counts as one), correct its anchorWindows entry to that window (the inventory's reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms it)${opensSample(s, prevDo) && s.result.kind === 'custom' ? '' : `; only if "${s.anchor}" is a resolver's own id that picks her row on the screen (a key of the bindings\' anchors and records), make this the step that opens her record (act open, a recordOpen result naming "${s.anchor}")`}`); // M:screen-anchor
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && inWindow && reopens && lastWindow !== home) add('tour-no-commit', 'G-08', 'need-window', at, `a do step at on: "sample" on "${s.anchor}", which sits in "${home}" (anchorWindows), with a need whose last reopen names "${lastWindow}": that reopen leaves "${home}" as it is, open on whoever it was opened for, a real person if she opened one, and the step acts there${isPicker || afterPicker ? ', while selectSample has no window of hers to pick in' : ''}; ${knownElsewhere(home, s.anchor) ? `name reopen ${home} last${isPicker ? ' (she picks herself, so the picker\'s own step names no selectSample)' : needsSelect ? ', then selectSample' : ''}, or, if the control sits in another window, correct its anchorWindows entry (the inventory\'s reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the window)` : `"${home}" is named nowhere else in the manifest or the inventory\'s anchorWindows, so the anchorWindows entry is the likelier mistake: correct it to the window the control sits in (the inventory\'s reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the window), and do not copy "${home}" into the need`}`); // M:need-window
    if (INV && s.kind === 'do' && s.on === 'sample' && isRecordAnchor(s.anchor) && inWindow && (isPicker ? windowOf(prevDo) !== home : afterPicker && !!pickerHome && home !== pickerHome)) add('tour-no-commit', 'G-08', 'picker-window', at, isPicker ? `the picker "${s.anchor}" sits in "${home}" (anchorWindows), and the step at on: "none" before it opened "${windowOf(prevDo)}": she picks in whatever "${home}" is open, an existing appointment's edit form if one is, and no step opened the tour's own; have the step before the picker open ${home} (an open result, or a step result naming it), or, if the picker sits in another window, correct its anchorWindows entry (the inventory's reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the window)` : `a do step at on: "sample" on "${s.anchor}", which sits in "${home}" (anchorWindows), after the picker, which sits in "${pickerHome}": the picker picked her in ${pickerHome} only, and ${home} is open on whoever it was opened for, a real person if she opened one; first open her record there with a step at on: "sample" whose recordOpen result names its own control (a resolver's own id), then reopen ${home}, or, if the control sits in ${pickerHome}, correct its anchorWindows entry (the inventory's reviewer opens the control in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the window)`); // M:picker-window
    if (INV && isPicker && inWindow && Object.prototype.hasOwnProperty.call(PW, home) && !picks(home)) add('tour-no-commit', 'G-08', 'picker-mark', at, `the picker "${s.anchor}" sits in "${home}" (anchorWindows), which pickingWindows marks false: a picker\'s window is one opened on nobody with a person field, a window that picks a person; if "${home}" is one (a booking form), its mark is wrong: mark it true in pickingWindows (the inventory\'s reviewer opens it in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the mark), and every do step at on: "sample" in it then names selectSample after its reopen; if "${home}" is opened on one person (her drawer, her payment sheet), the mark is right and this step is no picker: the step at on: "none" before it landed on a person\'s window; open her record with a step at on: "sample" whose recordOpen result names a resolver\'s own id (as cal.ended-appointment), keep the mark false, and do not mark the window true: a window wrongly marked true makes every do step at on: "sample" in it, in every tour, only show`); // M:picker-mark
    for (const d of self) if (!s.when || s.when === d) opened.add(d); // M:sample-opener
    for (const d of self) if (!s.when || s.when === d) viaPicker[d] = s.result.kind === 'custom';
    for (const d of self) if (!s.when || s.when === d) pickerWindow[d] = s.result.kind === 'custom' && inWindow ? home : undefined;
    if (s.kind === 'do') prevDo = s;
    const texts = [['text', s.text], ['showText', s.showText], ...arr(s.variants).map((v, vi) => [`variants[${vi}] (${v && v.when})`, v && v.text])];
    for (const [field, text] of texts) if (words(text) > 12) add('tour-shape', 'G-07', 'words', at, `${field} has ${words(text)} words, at most 12: the fix is two steps, never a trimmed one`); // M:words
    // the card shows the tour's name, the step's title (at most four words) and its sentence; a title that repeats either
    // one says nothing new
    if (typeof s.title === 'string' && words(s.title) > 4) add('tour-shape', 'G-07', 'title-words', at, `the step's title has ${words(s.title)} words, at most 4: the title names the step at a glance, and the sentence under it says the rest`); // M:title-words
    if (sameWords(s.title, s.text)) add('tour-shape', 'G-07', 'title-same', at, 'the step\'s title repeats its sentence: the title names the step in at most four words and the sentence under it says what to do; write a shorter title'); // M:title-same-text
    if (sameWords(s.title, t.title)) add('tour-shape', 'G-07', 'title-same', at, `the step's title repeats the tour's name "${t.title}", which the card already shows above it; name what this step is about`); // M:title-same-tour
    if (s.title === undefined && M.stage !== 'demo') add('tour-shape', 'G-07', 'title-missing', at, 'the step has no title: at stage app every step carries one, at most four words, shown above its sentence'); // M:title-missing
    if (s.title === undefined && M.stage === 'demo') demoTitle.push(at); // M:demo-title
    if (s.skip === false) add('tour-shape', 'G-07', 'no-skip', at, 'the step cannot be skipped; every step can be'); // M:no-skip
    if (s.kind === 'do' && !s.result) add('tour-shape', 'G-16', 'do-no-result', at, 'a do step with no result condition: it moves on only when the screen shows the result it names'); // M:do-no-result
    // part: a place inside the step's anchor, lit instead of it on a short screen; only a showing or stop step, whose lit
    // control does not respond, may light less than its whole control
    if (s.kind === 'do' && s.part !== undefined) add('tour-shape', 'G-16', 'part-do', at, `a do step names part "${s.part}": a do step's lit target is the live control she presses, and a part would light less than what responds; drop part (the bindings scroll a tall control into view), since part is only for a showing or a stop step, on which nothing on the screen responds`); // M:part-do
    if (s.part !== undefined && s.part === s.anchor) add('tour-shape', 'G-16', 'part-same', at, `part names the step's own anchor "${s.anchor}": a part is a smaller place inside the anchor, lit instead of it on a short screen; name the place inside it that the step is about, or drop part`); // M:part-same
    const po = obj(s.practiceOnly);
    const missing = ['modeTest', 'stopTest'].filter(k => !po[k]);
    const tp = s.class === 'T' || s.class === 'P';
    // at stage demo a practice-only step may name its tests later (one note); at stage app it names both
    const practiceGap = !!s.practiceOnly && missing.length > 0;
    if (s.kind === 'do' && ((tp && !s.practiceOnly) || (!!s.practiceOnly && s.class !== 'P') || (practiceGap && M.stage !== 'demo'))) add('tour-no-commit', 'G-20', 'do-class', at, s.class === 'T' && s.practiceOnly ? 'a do step classed T tells a real person: it is a stop step, in practice mode too (the mode is for a numbered document, a payment and a close for good, classed P)' : s.practiceOnly && s.class !== 'P' ? `a practice-only do step ${s.class ? `classed ${s.class}` : 'with no class'}: practice mode is only for a numbered document, a payment and a close for good: if it issues a numbered document, takes a payment or closes for good, class it P and keep it practice-only; only any other do step that tells no one drops practiceOnly and names its G-20 safeTest` : s.practiceOnly ? `a practice-only do step without ${missing.join(' and ')}: it is a stop step in the mode too` : `a do step classed ${s.class} is not practice-only: it is a stop step`); // M:do-class
    if (s.kind === 'do' && practiceGap && M.stage === 'demo') demoPractice.push(at); // M:demo-practice
    if (s.kind === 'do' && s.on === undefined) add('tour-no-commit', 'G-08', 'do-no-on', at, 'a do step that does not say whose record it acts on: on: "sample", or on: "none" when it acts on no person\'s record (an empty slot, a filter, a settings tab, a field in a settings form that has its own save); a save of a business-wide setting, including a switch or a field that saves as it changes, is a stop step, never a do step'); // M:do-no-on
    if (s.kind === 'do' && s.on === 'none' && onRecord(s)) add('tour-no-commit', 'G-08', 'none-on-record', at, isRecordAnchor(s.anchor) ? `a do step with on: "none" on "${s.anchor}", which the inventory lists as a control of the sample's record (recordAnchors); the step is at on: "sample", and on a row in a list it is lit through a resolver's own id that picks the sample's row (as cal.ended-appointment), never the row's plain id, which binds the first visible row` : `a do step with on: "none" whose result names a control the inventory lists in recordAnchors, or a container (a list of people's rows, or an id every row carries), so its lit target reaches a person's record; for a step that filters a list or opens a window, name the state (stateEquals) or the window (open) as the result, not a control inside it, and name a window only when it is nobody's (a menu, a filter panel); a list of people, and the plain id every row in it carries, go in containerAnchors, and the step lights the sample's own row at on: "sample" through a resolver's own id`); // M:none-on-record
    if (INV && s.kind === 'do' && s.on === 'none' && windowOf(s) && Object.prototype.hasOwnProperty.call(PW, windowOf(s)) && !picks(windowOf(s))) add('tour-no-commit', 'G-08', 'none-window', at, `a do step at on: "none" whose ${s.result.kind} result opens "${windowOf(s)}", which pickingWindows marks false, a window opened on one person: a step at on: "none" lands only on what is nobody\'s; if "${windowOf(s)}" is opened on nobody with a person field (a booking form a picker fills), its mark is wrong: mark it true in pickingWindows (the inventory\'s reviewer opens it in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the mark); if a step before it opened her record and this step moves inside her window (a control in her drawer that opens her payment sheet, a page of her sheet), it acts on her record: put it at on: "sample", with a need that reopens the window its control sits in, and sample-not-record then says where an unlisted control is listed; if it opens "${windowOf(s)}" on nobody, with no person field (a quick sale), and no later step presses in it, the tour need not open it: make this a next step on its control, which only shows it, and end the tour\'s part in that window there; otherwise open her record with a step at on: "sample" whose recordOpen result names a resolver\'s own id (as cal.ended-appointment), keep the mark false, and do not mark the window true: a window wrongly marked true makes every do step at on: "sample" in it, in every tour, only show`); // M:none-window
    const stops = s.kind === 'do' && s.anchor ? stopsOn(s) : [];
    const stopped = stops.find(x => x.cls === 'T') || stops[0];
    if (stopped && !(s.practiceOnly && s.class === 'P' && stopped.cls === 'P')) add('tour-no-commit', 'G-20', 'stopped-elsewhere', at, `a do step on "${s.anchor}"${s.arg ? ` (${s.arg})` : ''}, which step ${stopped.at} stops at${stopped.arg ? ` (${stopped.arg})` : ''} classed ${stopped.cls} (${stopped.cls === 'T' ? 'it tells a real person' : 'it is permanent or charges'}): a control\'s class is what pressing it does, the same in every tour (a stop with no arg covers every arg of its control, and a do step with no arg meets every stop on it), so this step presses a control the manifest itself says ${stopped.cls === 'T' ? 'tells a real person' : 'is permanent or charges'}; make it a stop step classed ${stopped.cls}${stopped.cls === 'P' ? ', or, only inside practice mode, a practice-only step classed P with its modeTest and stopTest' : ', in practice mode too: a step that tells a real person is never done there'}${!stopped.arg !== !s.arg ? '; if the member this step means is another control than the one stopped at, name the arg on both steps, so each is its own control' : ''}; where pressing it does that only when a field an earlier step set says so (a "notify the patient" switch), it still does in some run, and the step stays a stop step`); // M:stopped-elsewhere
    if (s.kind === 'do' && s.class === 'S' && s.on !== 'sample') add('tour-no-commit', 'G-20', 'save-not-sample', at, 'a do step classed S (it saves) that does not carry on: "sample": a save done in a tour is done on the sample\'s record, on a control that record carries; saving a business-wide rule or a real person\'s record is a stop step'); // M:save-not-sample
    if (INV && s.kind === 'do' && (isBulkAnchor(s.anchor) || isBulkAnchor(resultAnchor(s)))) add('tour-no-commit', 'G-20', 'do-on-bulk', at, `a do step ${isBulkAnchor(s.anchor) ? `on "${s.anchor}"` : `whose result names "${resultAnchor(s)}"`}, which the inventory lists in bulkAnchors (an export, a print, a download or share, an import, or an action on many people's records at once): a tour never does one, whatever its on and its class; it shows that control or stops at it (a stop step there is classed T); for a step that opens a menu or a window, name the window (open) as the result, not a control inside it`); // M:do-on-bulk
    if (INV && s.kind === 'do' && isContainerAnchor(s.anchor)) add('tour-no-commit', 'G-08', 'do-on-container', at, `a do step lit on "${s.anchor}", which the inventory lists in containerAnchors (a list, a column, the calendar grid, or an id every row of a list carries): the lit target of a do step is live, so she could press any person's row inside it, or the first visible row, whatever its on and its class; light the sample's own row or control at on: "sample", through a resolver that picks it and is listed in recordAnchors (its own id, as cal.ended-appointment, never the plain id every row carries, which binds the first visible row), or, for an empty slot, the slot through a resolver (cal.free-slot) at on: "none"`); // M:do-on-container
    if (INV && s.kind === 'do' && s.on === 'sample' && !isRecordAnchor(s.anchor) && !isBulkAnchor(s.anchor) && !isContainerAnchor(s.anchor)) add('tour-no-commit', s.class === 'S' || s.practiceOnly ? 'G-20' : 'G-08', 'sample-not-record', at, `a do step at on: "sample" on "${s.anchor}", which no recordAnchors lists. If pressing it acts on many people at once (a print of the day's list) or saves a business-wide rule (a service's default duration) (find out from the code, or by pressing it in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app), wherever it sits, it is never in recordAnchors and the tour shows it or stops at it, never presses it: list one that acts on many people in bulkAnchors (a stop step at an export or a print is classed T), and make the step a stop step; otherwise, if it sits in a window opened on her (a step before it in the tour opened it on her), or it is a control of a window that picks a person (the picker and that window's other controls), list it in recordAnchors and keep on: "sample"; if it sits on her row in a list, light it through a resolver's own id that picks her row and list that id; only a control that is nobody's record (a tab, a filter, a business-wide setting) changes the step, to on: "none", and a save there (a business-wide setting) is a stop step, never a do step; never answer this finding by setting on: "none" on a person's control${s.practiceOnly ? '; a practice-only step stays on the sample\'s copy' : ''}`); // M:sample-not-record
    if (s.practiceOnly && s.on !== 'sample') add('tour-no-commit', 'G-20', 'practice-not-sample', at, 'a practice-only step without on: "sample": inside the mode the tour runs on the sample record\'s copy, never on a real person\'s'); // M:practice-not-sample
    if (s.kind === 'do' && plain(s.result) && s.result.kind === 'recordOpen' && s.on !== 'sample') add('tour-no-commit', 'G-08', 'record-not-sample', at, 'a do step opens a person\'s record (recordOpen) and does not carry on: "sample": tours run on the sample record, never on real data; if the control is nobody\'s (a search, a button that opens a list), split the step: it filters or opens at on: "none" with a stateEquals or open result (a window that is nobody\'s), and the next step lights the sample\'s own row at on: "sample" through a resolver, with the recordOpen result, or is a stop step'); // M:record-not-sample
    if (s.kind === 'do' && !s.practiceOnly && !s.safeTest) noTest.push(at);
    for (const n of arr(s.need)) if (n && n.do !== 'reopen' && n.do !== 'selectSample') add('tour-no-commit', 'G-08', 'need-action', at, `the resume action "${n.do}" is not one of the two a tour does by itself (reopen a window, select the sample record again)`); // M:need-action
    const selectAt = arr(s.need).findIndex(n => n && n.do === 'selectSample');
    const lastReopen = arr(s.need).map(n => n && n.do).lastIndexOf('reopen');
    if (selectAt > -1 && (lastReopen < 0 || selectAt < lastReopen)) add('tour-no-commit', 'G-08', 'need-order', at, lastReopen < 0 ? 'the need runs selectSample with no reopen before it: selectSample runs only in the tour\'s own window, which the step\'s reopen opens afresh or finds open on her, so without one it would pick her in whatever window is open, an existing record\'s form included; name the reopen of the window the step\'s control sits in before selectSample, or drop selectSample where that window picks no person' : 'the need lists selectSample before a reopen: the engine runs the reopen first, which opens the window afresh, and selectSample then picks her in it, so the need lists them in that order; listed the other way, selectSample would pick her in whatever window is open, an existing record\'s form included; put the reopen first'); // M:need-order
    if (INV && selectAt > -1 && lastReopen > -1 && !picks(lastWindow)) add('tour-no-commit', 'G-08', 'select-window', at, `the need runs selectSample after a last reopen of "${lastWindow}", which the inventory\'s pickingWindows does not mark as picking a person: selectSample picks her only in the tour\'s own window that picks a person and reports no anywhere else, so the step and every later do step of the tour would only show; if "${lastWindow}" picks a person (a window opened on nobody with a person field, as a booking form), its mark is wrong: mark it true in pickingWindows (the inventory\'s reviewer opens it in the screen preview (defined in help-system.md, "The tour manifest"), never in the live app, and confirms the mark); only for a window that really picks no one, drop selectSample from this need`); // M:select-window
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
  if (typeof t.promise === 'string' && words(t.promise) > 6) add('tour-shape', 'G-17', 'promise-words', { tour: t.id, path: `/tours/${ti}/promise` }, `the tour's promise has ${words(t.promise)} words, at most 6: one short line in the tour list on what she can do after it`); // M:promise-words
  if (t.promise === undefined && M.stage !== 'demo') add('tour-shape', 'G-17', 'promise-missing', { tour: t.id, path: `/tours/${ti}` }, 'the tour has no promise: at stage app every tour carries one, at most six words in the tour list on what she can do after it'); // M:promise-missing
  if (t.promise === undefined && M.stage === 'demo') demoPromise.push(t.id); // M:demo-promise
  if (steps.length > 6 && !t.chapter) notes.push({ check: 'tour-shape', tour: t.id, message: `${steps.length} steps and no chapter break; the reviewer checks only that a chapter break, if there is one, sits at a real result, and length alone is never a finding` });
});
if (demoTitle.length) notes.push({ check: 'tour-shape', message: `${demoTitle.length} steps have no title yet; each needs one, at most four words, before the app runs this tour` });
if (demoPromise.length) notes.push({ check: 'tour-shape', message: `${demoPromise.length} tours have no promise yet; each needs one, at most six words, before the app runs this tour` });
if (demoPractice.length) notes.push({ check: 'tour-no-commit', message: `${demoPractice.length} practice-only steps name no mode test or stop test yet; each needs both before the app runs this tour` });
const unjudged = INV ? 0 : tours.reduce((n, t) => n + arr(plain(t) && t.steps).filter(s => plain(s) && s.kind === 'do').length, 0);
if (unjudged) notes.push({ check: 'tour-no-commit', message: `${unjudged} do steps were not judged against the inventory (recordAnchors, bulkAnchors, containerAnchors, anchorWindows, pickingWindows: none-on-record, sample-not-record, sample-not-opened, sample-no-need, need-window, picker-window, screen-anchor, select-window, do-on-bulk, do-on-container), and at stage app inOrderRun\'s key was not compared (run-stale): that needs --inventory` }); // M:none-no-inventory
if (M && M.stage === 'app' && tours.some(t => arr(t.steps).some(s => s && s.kind === 'do')) && !plain(M.inOrderRun)) add('tour-no-commit', 'G-20', 'run-not-recorded', { path: '/inOrderRun' }, 'the manifest is at stage "app" and its tours have do steps, and it names no inOrderRun: before a do step runs for anyone, the inventory\'s reviewer runs every do step of every tour in order on the sample in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app, and after each step looks at her record, at the settings and the lists of other people the step can reach, and at the recorder; only that reviewer, and only after a run that showed no business-wide change, no change to other people and nothing in the recorder that the step\'s class does not allow, writes the record here (inOrderRun: copy, date, and the key tour-check.mjs --run-key prints; the run in full: help-system.md, "The tour manifest"); a project with no recording copy makes every step of its tours a showing or a stop step that lights no control (a centred card: help-system.md, "The tour manifest"), whatever preview it has; a do step is never run in the live app to find out what it does'); // M:run-not-recorded
const REC = M && plain(M.inOrderRun) ? M.inOrderRun : {};
if (M && M.stage === 'demo' && M.inOrderRun !== undefined) add('tour-no-commit', 'G-20', 'run-at-demo', { path: '/inOrderRun' }, 'a manifest at stage "demo" carries inOrderRun: at stage demo the app the run needs does not exist, so the record cannot be true (a manifest started from the example carries the example\'s); remove it, and at stage "app" the reviewer who runs every tour\'s do steps in order in the recording copy writes it after that run'); // M:run-at-demo
const runDay = typeof REC.date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(REC.date) ? REC.date : null;
const realDay = !!runDay && !Number.isNaN(Date.parse(`${runDay}T00:00:00Z`)) && new Date(`${runDay}T00:00:00Z`).toISOString().slice(0, 10) === runDay;
// today is the latest calendar day anywhere (UTC+14), so a reviewer east of the checker who writes her own day is never told it is after today
const today = new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);
if (M && M.stage === 'app' && runDay && (!realDay || runDay > today)) add('tour-no-commit', 'G-20', 'run-date', { path: '/inOrderRun/date' }, `inOrderRun.date "${runDay}" is ${realDay ? 'after today in every time zone' : 'not a day of the calendar'}: the record names the day the reviewer ran every tour\'s do steps in order in the recording copy, a day of the calendar not after today; write that day`); // M:run-date
if (INV && M && M.stage === 'app' && typeof REC.key === 'string' && REC.key !== RUN_KEY) add('tour-no-commit', 'G-20', 'run-stale', { path: '/inOrderRun/key' }, 'the inOrderRun record does not belong to this content: its key is not the one tour-check.mjs --run-key prints for this manifest and inventory, so the manifest or the inventory changed after the run, or the record came with a manifest it was not written for (the example\'s); the reviewer runs every tour\'s do steps in order again in the recording copy (defined in help-system.md, "The tour manifest"), never in the live app, and only after a run that passes writes a new record with the new key; the key shows only that a record was written for this exact content, never that the run was done'); // M:run-stale
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
  // a part is a known anchor on one of the tour's screens (a step's anchor there, or an anchors entry), so the screen
  // preview has it on its list of anchors to find; a step's own part never makes it known
  tours.forEach((t, ti) => arr(t.steps).forEach((s, si) => { if (plain(s) && typeof s.part === 'string' && !screensOf(t).some(k => known(k, s.part))) add('tour-shape', 'G-16', 'part-unknown', { tour: t.id, step: si + 1, path: `/tours/${ti}/steps/${si}` }, `part "${s.part}" is no known anchor on the tour's screens: no step of a tour there points at it and no anchors entry for them lists it; list it in the manifest's anchors with the screens that carry it and what it is, so the screen preview finds it inside the step's anchor`); })); // M:part-unknown
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
