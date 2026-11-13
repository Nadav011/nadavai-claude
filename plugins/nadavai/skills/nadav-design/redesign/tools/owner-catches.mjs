#!/usr/bin/env node
// Count the design problems of a project by who caught them: the gates before ship, Nadav before ship, anyone
// after ship. Reads the "Owner catches" table of the project's MEASURES.md (template:
// redesign/templates/MEASURES.md; `modes/retro.md` runs this tool).
//
// usage: node tools/owner-catches.mjs <MEASURES.md> [--period month|quarter|all] [--json]
//   exit 0: counted, every row well formed; 1: counted, and some rows are malformed (listed, never counted);
//   2: usage, no file, or no "Owner catches" table in it.
//
// A row is one problem (a gate row may carry a count: one DoD run that found 7 look findings on a screen is one
// row with count 7). An owner or user row is the "escaped defect" of the usual testing definition: a defect the
// test level that was supposed to find that type of defect did not find. Its `gate` cell names that gate, or
// `none` when no gate covers the class (a gap in the gates, counted apart). The share the gates caught is
// gates-before over (gates-before + owner-before + after), the defect detection percentage adapted to design.
//
// Each condition that rejects or counts a row is one line ending in `// M:<code>`: the skill's tests
// (redesign/tests/run.mjs) delete that line and check that a test fails, so no condition is untested.
import fs from 'fs';

const CLASSES = ['reference', 'dropped', 'comfort', 'look', 'copy', 'process'];
const FINDERS = ['gate', 'owner', 'user'];
const WHEN = ['before', 'after'];
const HEADER = ['date', 'screen', 'class', 'found by', 'when', 'count', 'gate', 'words'];
const USAGE = 'usage: node tools/owner-catches.mjs <MEASURES.md> [--period month|quarter|all] [--json]';

const argv = process.argv.slice(2);
const die = msg => { process.stderr.write(`${msg}\n${USAGE}\n`); process.exit(2); };
if (argv.includes('-h') || argv.includes('--help')) { process.stdout.write(`${USAGE}\n`); process.exit(0); }
const json = argv.includes('--json');
let period = 'month';
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--json') continue;
  if (argv[i] === '--period') { period = argv[++i]; continue; }
  if (argv[i].startsWith('--')) die(`unknown option ${argv[i]}`);
  files.push(argv[i]);
}
if (files.length !== 1) die('give one MEASURES.md');
if (!['month', 'quarter', 'all'].includes(period)) die(`--period is month, quarter or all, not ${period}`);
let text;
try { text = fs.readFileSync(files[0], 'utf8'); } catch (e) { die(`cannot read ${files[0]}: ${e.message}`); }

// A cell may hold a pipe written as \| (a quote of his that has one).
const cellsOf = line => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
const lines = text.split('\n');
const start = lines.findIndex(l => l.trim().startsWith('|') && cellsOf(l).map(c => c.toLowerCase()).join('|') === HEADER.join('|'));
if (start < 0) die(`${files[0]} has no "Owner catches" table (a row of exactly: | ${HEADER.join(' | ')} |)`);

const validDate = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const periodOf = date => (period === 'all' ? 'all' : period === 'month' ? date.slice(0, 7) : `${date.slice(0, 4)}-Q${Math.floor((+date.slice(5, 7) - 1) / 3) + 1}`);

const rows = [];
const malformed = [];
for (let i = start + 1; i < lines.length; i++) {
  const raw = lines[i];
  if (!raw.trim().startsWith('|')) break; // the table ends at its first line that is not a row
  const c = cellsOf(raw);
  if (c.every(x => /^:?-+:?$/.test(x))) continue; // the separator row
  const n = i + 1;
  const bad = why => malformed.push({ line: n, why, row: raw.trim().slice(0, 160) });
  if (c.length !== HEADER.length) { bad(`${c.length} cells, not ${HEADER.length}`); continue; } // M:cells
  const [date, screen, cls, finder, when, countCell, gate, words] = c;
  if (!validDate(date)) { bad(`date "${date}" is not a real YYYY-MM-DD date`); continue; } // M:date
  if (!screen) { bad('no screen'); continue; } // M:screen
  if (!CLASSES.includes(cls)) { bad(`class "${cls}" is not one of ${CLASSES.join(', ')}`); continue; } // M:class
  if (!FINDERS.includes(finder)) { bad(`found by "${finder}" is not one of ${FINDERS.join(', ')}`); continue; } // M:finder
  if (!WHEN.includes(when)) { bad(`when "${when}" is not before or after (ship)`); continue; } // M:when
  if (!/^[1-9]\d*$/.test(countCell)) { bad(`count "${countCell}" is not a whole number of at least 1`); continue; } // M:count
  const count = Number(countCell);
  if (finder !== 'gate' && count !== 1) { bad(`an ${finder} row is one problem: split a count of ${count} into ${count} rows, each with its own words`); continue; } // M:one-per-row
  if (!gate) { bad('no gate: name the gate that caught it, or for an owner or user row the gate that should have caught it, or none'); continue; } // M:gate
  if (finder === 'gate' && gate === 'none') { bad('a gate row names the gate that caught it, never none'); continue; } // M:gate-none
  if (finder !== 'gate' && !words) { bad(`an ${finder} row keeps what was said, in the words used`); continue; } // M:words
  rows.push({ line: n, date, screen, cls, finder, when, count, gate, words });
}

const blank = () => ({ gate_before: 0, owner_before: 0, after: 0, after_owner: 0, after_user: 0, after_gate: 0 });
const add = (t, r) => {
  if (r.when === 'before' && r.finder === 'gate') t.gate_before += r.count; // M:count-gate
  if (r.when === 'before' && r.finder !== 'gate') t.owner_before += r.count; // M:count-owner
  if (r.when === 'after') { t.after += r.count; t[`after_${r.finder}`] += r.count; } // M:count-after
};
const share = t => {
  const all = t.gate_before + t.owner_before + t.after;
  return all ? Math.round((1000 * t.gate_before) / all) / 10 : null; // M:share
};
const periods = {};
const screens = {};
const total = blank();
for (const r of rows) {
  const p = (periods[periodOf(r.date)] ??= { ...blank(), classes: Object.fromEntries(CLASSES.map(k => [k, blank()])) });
  add(p, r);
  add(p.classes[r.cls], r);
  add((screens[r.screen] ??= blank()), r);
  add(total, r);
}
for (const p of Object.values(periods)) {
  p.share = share(p);
  for (const k of CLASSES) p.classes[k].share = share(p.classes[k]);
}
total.share = share(total);
for (const s of Object.values(screens)) s.share = share(s);
const escapes = rows.filter(r => r.finder !== 'gate'); // M:escapes
const noGate = escapes.filter(r => r.gate === 'none');
const byGate = {};
for (const r of escapes) if (r.gate !== 'none') byGate[r.gate] = (byGate[r.gate] ?? 0) + 1;

const out = {
  file: files[0],
  period,
  rows: rows.length,
  total,
  periods: Object.fromEntries(Object.entries(periods).sort(([a], [b]) => a.localeCompare(b))),
  screens,
  escaped: { count: escapes.length, no_gate: noGate.length, by_gate: byGate },
  malformed,
};

if (json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`, () => process.exit(malformed.length ? 1 : 0));
else {
  const pct = s => (s === null ? 'none counted' : `${s}%`);
  const tri = t => `gates before ship ${t.gate_before}, owner before ship ${t.owner_before}, after ship ${t.after}`;
  const o = [`owner-catches: ${files[0]}: ${rows.length} rows counted, ${malformed.length} malformed`];
  o.push(`all: ${tri(total)} (owner ${total.after_owner}, user ${total.after_user}, gate ${total.after_gate}); the gates caught ${pct(total.share)}`);
  for (const [key, p] of Object.entries(out.periods)) {
    o.push(`period ${key}: ${tri(p)}; the gates caught ${pct(p.share)}`);
    for (const k of CLASSES) {
      const c = p.classes[k];
      if (c.gate_before + c.owner_before + c.after) o.push(`  ${k.padEnd(9)} gates ${c.gate_before}, owner ${c.owner_before}, after ${c.after}; caught ${pct(c.share)}`);
    }
  }
  o.push('per screen:');
  for (const [s, t] of Object.entries(screens).sort(([a], [b]) => a.localeCompare(b))) o.push(`  ${s}: ${tri(t)}; caught ${pct(t.share)}`);
  o.push(`escaped (found by the owner or a user): ${escapes.length}; ${noGate.length} in a class no gate covers${Object.keys(byGate).length ? `; by the gate that should have caught them: ${Object.entries(byGate).map(([g, k]) => `${g} ${k}`).join(', ')}` : ''}`);
  if (malformed.length) {
    o.push('malformed rows (not counted; fix each):');
    for (const m of malformed) o.push(`  line ${m.line}: ${m.why}`);
  }
  process.stdout.write(`${o.join('\n')}\n`, () => process.exit(malformed.length ? 1 : 0));
}
