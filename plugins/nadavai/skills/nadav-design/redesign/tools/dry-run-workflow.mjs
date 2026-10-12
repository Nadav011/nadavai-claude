// Dry-run a Workflow script with every agent() mocked, before launching it for real.
//
// usage: node dry-run-workflow.mjs <script.js> [args.json] [--empty] [--throw <label regex>]
//
// Each agent() call returns an object built from its own schema: one item in every array (or none with --empty),
// true for booleans, 0 for integers, the first value of every enum; a call without a schema returns a string. An array
// whose items require an `id` stays empty: an id refers to something the script handed out, and a mock cannot know it
// (an invented one would only test the script's own refusal of unknown ids).
// That walks the script's loops and gates in a second, so a syntax error, a misspelled field or a loop that never
// ends shows up here instead of hours into a real run. It also enforces the Workflow contract and two redesign rules:
//   - `export const meta = {...}` is a pure literal (no calls, spreads, computed keys, identifiers or interpolation),
//     and every phase() title appears in meta.phases;
//   - every agent() passes model 'opus' (after a usage-limit resume agents silently ran on a smaller model);
//   - the args JSON stays far below the ~57 KB at which workflow args fail, measured in bytes (Hebrew is 2 per letter).
// An exception anywhere, inside parallel() and pipeline() too, is a problem: the real runtime turns it into a quiet
// null, which reads as "an agent returned nothing" and hides the bug. So is a script that catches one itself and goes
// on: a non-empty `errors` in its result, or a log line that says "threw". --throw makes every agent() whose label
// matches the regex throw, to prove a script reports such a failure instead of absorbing it.
// Like the real runtime, Date.now(), argless new Date() and Math.random() throw inside the script.
// Exit 0 when the script ran to its return and every rule holds.
import fs from 'fs';

const argv = process.argv.slice(2);
const ti = argv.indexOf('--throw');
const throwAt = ti >= 0 ? new RegExp(argv[ti + 1]) : null;
const files = argv.filter((a, i) => !a.startsWith('--') && !(ti >= 0 && i === ti + 1));
const empty = argv.includes('--empty');
if (!files[0]) {
  console.error('usage: node dry-run-workflow.mjs <script.js> [args.json] [--empty]');
  process.exit(2);
}
const src = fs.readFileSync(files[0], 'utf8');
const argsText = files[1] ? fs.readFileSync(files[1], 'utf8') : 'null';
const args = JSON.parse(argsText);
const problems = [];
const argBytes = Buffer.byteLength(argsText, 'utf8');
if (argBytes > 40000) problems.push(`args are ${argBytes} bytes: pass big data in files (args over ~57 KB fail)`);

// meta: a pure literal. A tiny parser that accepts objects, arrays, quoted strings (template strings without ${}),
// numbers, true/false/null and bare or quoted keys, and nothing else.
function parseMetaLiteral(text, start) {
  let i = start;
  const fail = msg => { throw new Error(`meta is not a pure literal at character ${i - start}: ${msg}`); };
  const ws = () => { for (;;) { while (/\s/.test(text[i] || '')) i++; if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; } else if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); if (e < 0) fail('open comment'); i = e + 2; } else return; } };
  const str = () => {
    const q = text[i++];
    let out = '';
    while (i < text.length && text[i] !== q) {
      if (q === '`' && text.startsWith('${', i)) fail('template interpolation');
      if (text[i] === '\\') { out += text[i + 1]; i += 2; } else out += text[i++];
    }
    if (text[i] !== q) fail('open string');
    i++;
    return out;
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (text[i] === '}') { i++; return o; }
        if (text.startsWith('...', i)) fail('spread');
        if (text[i] === '[') fail('computed key');
        let k;
        if (/['"`]/.test(text[i])) k = str();
        else { const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i)); if (!m) fail(`unexpected ${JSON.stringify(text[i])}`); k = m[0]; i += k.length; }
        ws();
        if (text[i] !== ':') fail(`key ${k} without a value (shorthand or method)`);
        i++;
        o[k] = value();
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        fail(`unexpected ${JSON.stringify(text[i])} after ${k}`);
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      for (;;) {
        ws();
        if (text[i] === ']') { i++; return a; }
        if (text.startsWith('...', i)) fail('spread');
        a.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        fail(`unexpected ${JSON.stringify(text[i])} in an array`);
      }
    }
    if (/['"`]/.test(c)) return str();
    const m = /^(-?\d+(\.\d+)?|true|false|null)(?![\w$(.])/.exec(text.slice(i));
    if (m) { i += m[0].length; return JSON.parse(m[0]); }
    fail(`not a literal: ${JSON.stringify(text.slice(i, i + 30))}`);
  };
  const v = value();
  return { value: v, end: i };
}

let meta = null;
const head = /^export const meta = /m.exec(src);
if (!head) problems.push('the script does not start with `export const meta = {...}`');
else {
  try {
    meta = parseMetaLiteral(src, head.index + head[0].length).value;
    if (typeof meta.name !== 'string' || typeof meta.description !== 'string') problems.push('meta needs a name and a description');
  } catch (e) {
    problems.push(e.message);
  }
}
const metaTitles = ((meta && meta.phases) || []).map(x => x && x.title);

function fake(schema, depth = 0) {
  if (!schema) return 'mock text';
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case 'object': return Object.fromEntries(Object.entries(schema.properties || {}).map(([k, v]) => [k, fake(v, depth + 1)]));
    case 'array': return empty || depth > 4 || ((schema.items && schema.items.required) || []).includes('id') ? [] : [fake(schema.items, depth + 1)];
    case 'boolean': return true;
    case 'integer': case 'number': return 0;
    default: return 'mock';
  }
}

const calls = [];
const logs = [];
const phases = [];
let current = '';
const caught = (where, e) => { problems.push(`${where} threw: ${e && e.message ? e.message : e}`); return null; };
const hooks = {
  agent: async (prompt, opts = {}) => {
    calls.push({ label: opts.label || '(no label)', phase: opts.phase || current, model: opts.model, chars: String(prompt).length });
    if (calls.length > 1000) throw new Error('more than 1000 agents: a loop does not end');
    if (throwAt && throwAt.test(opts.label || '')) throw new Error(`--throw: ${opts.label}`);
    return fake(opts.schema);
  },
  parallel: async thunks => Promise.all(thunks.map((t, i) => Promise.resolve().then(t).catch(e => caught(`parallel item ${i}`, e)))),
  pipeline: async (items, ...stages) => Promise.all(items.map(async (it, i) => {
    let v = it;
    try { for (const s of stages) v = await s(v, it, i); } catch (e) { return caught(`pipeline item ${i}`, e); }
    return v;
  })),
  phase: t => { current = t; phases.push(t); },
  log: m => { logs.push(String(m)); console.log(`  log: ${m}`); },
  budget: { total: null, spent: () => 0, remaining: () => Infinity },
  workflow: async () => { throw new Error('nested workflow() is not mocked'); },
};

const body = src.replace(/^export const meta = /m, 'const meta = ');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const RealDate = Date;
const guard = {
  Date: new Proxy(RealDate, {
    construct(t, a) { if (!a.length) throw new Error('new Date() without arguments is not allowed in a workflow'); return new t(...a); },
    get(t, k) { if (k === 'now') return () => { throw new Error('Date.now() is not allowed in a workflow'); }; return t[k]; },
  }),
  Math: Object.assign(Object.create(Math), { random: () => { throw new Error('Math.random() is not allowed in a workflow'); } }),
};
let result;
try {
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', 'Date', 'Math', body);
  result = await fn(hooks.agent, hooks.parallel, hooks.pipeline, hooks.phase, hooks.log, args, hooks.budget, hooks.workflow, guard.Date, guard.Math);
} catch (e) {
  problems.push(`the script threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
}

if (result && Array.isArray(result.errors) && result.errors.length) problems.push(`the script's result lists ${result.errors.length} errors: ${result.errors.slice(0, 3).join(' | ')}`);
const threw = logs.filter(l => /threw/.test(l));
if (threw.length) problems.push(`the script logged ${threw.length} exceptions it caught: ${threw.slice(0, 3).join(' | ')}`);
const notOpus = calls.filter(c => c.model !== 'opus');
if (notOpus.length) problems.push(`${notOpus.length} agent() calls without model 'opus': ${[...new Set(notOpus.map(c => c.label))].slice(0, 5).join(', ')}`);
const unknown = [...new Set(phases)].filter(t => !metaTitles.includes(t));
if (unknown.length) problems.push(`phase() titles missing from meta.phases: ${unknown.join(', ')}`);
const byPhase = {};
for (const c of calls) byPhase[c.phase] = (byPhase[c.phase] || 0) + 1;
console.log(`${calls.length} agent calls by phase: ${JSON.stringify(byPhase)}`);
console.log(`largest prompt: ${Math.max(0, ...calls.map(c => c.chars))} characters; args ${argBytes} bytes`);
console.log(`return: ${JSON.stringify(result).slice(0, 600)}`);
for (const p of problems) console.log(`PROBLEM ${p}`);
process.exit(problems.length ? 1 : 0);
