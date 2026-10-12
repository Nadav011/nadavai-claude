// Regression tests of the redesign mode: one test per failure mode a review found (ids = the findings of the
// Codex review of 11.10.2026, H = HIGH, M = MEDIUM, L = LOW). Workflow scripts run with scripted mock agents; the tools
// run on throwaway copies of the mini fixture in a temp folder, each with its own 1x1 «היום» shots, so the suite
// never depends on files a fresh clone does not have.
//
// usage: PLAYWRIGHT_MODULE=<app>/node_modules/playwright/index.mjs node tests/run.mjs [--no-browser]
// One browser at a time (the browser tests run one after another). Each test that needs a server binds 127.0.0.1:8977
// (and 8978 for a second origin) itself and closes it; a busy port fails that test, not the suite.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SK = path.resolve(HERE, '..');
const MINI = path.join(SK, 'examples/mini');
const T = path.join(SK, 'tools');
const W = path.join(SK, 'workflows');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'redesign-skill-tests-')); // never a fixed, shared folder
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const noBrowser = process.argv.includes('--no-browser');

const results = [];
const test = async (id, name, fn) => {
  try {
    const why = await fn();
    results.push({ id, name, ok: !why || why.startsWith('SKIP'), skip: !!why && why.startsWith('SKIP'), why: why || '' });
  } catch (e) {
    results.push({ id, name, ok: false, why: `threw: ${String(e && e.stack || e).split('\n').slice(0, 2).join(' ')}` });
  }
};
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', cwd: MINI, ...opts });

// ---------------- workflow harness ----------------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function runWorkflow(file, args, respond) {
  const src = fs.readFileSync(file, 'utf8').replace(/^export const meta = /m, 'const meta = ');
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    const call = { label: opts.label || '', prompt: String(prompt), schema: opts.schema };
    calls.push(call);
    return respond(call, calls);
  };
  const parallel = async ts => Promise.all(ts.map(t => t().catch(() => null)));
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', src);
  const result = await fn(agent, parallel, null, () => {}, () => {}, args, { total: null, spent: () => 0, remaining: () => Infinity }, null);
  return { result, calls };
}
const kind = s => {
  const p = (s && s.properties) || {};
  if (p.build_ok) return 'rebuild';
  if (p.fixed) return 'fix';
  if (p.confirmed) return 'confirm';
  if (p.items) return 'spec';
  if (p.committed) return 'done';
  if (p.reviewer) return 'second';
  if (p.verdict) return 'verdict';
  if (p.units !== undefined) return 'write';
  if (p.findings) return 'audit';
  return 'text';
};
const SCREENS = ['home', 'profile'];
const finding = (section = 'home', extra = {}) => ({ section, phone: 'אחרי · הריצות הקרובות', severity: 'P1', lens: 'craft', what: 'a real defect', fix: 'fix it', evidence: 'work/shots/x.png', track: 'demo', ...extra });
const ids = prompt => [...new Set([...prompt.matchAll(/"id":"([^"]+)"/g)].map(m => m[1]))];
// a clean round: every lane works, the rebuild covers all five passes and every screen, verify finds one defect,
// the confirm accounts for every finding id it was given
function demoGood(over = {}) {
  return (call, calls) => {
    const k = kind(call.schema);
    if (over[k]) { const r = over[k](call, calls); if (r !== undefined) return r; }
    switch (k) {
      case 'spec': return { items: [finding('home')], summary: 'ok' };
      case 'fix': return { fixed: ['done'], rejected: [], requests: [], plan: [], questions: [], needs: [], clean_build: true };
      case 'rebuild': return { build_ok: true, passes: ['dark', 'light', '320-dark', '320-light', 'pub'].map(name => ({ name, clean: true, detail: '', screens: [...SCREENS] })), anchors: { plan_exists: false, ran: false, exit_code: 0, missing: 0, wrong: 0, stale: 0 }, notes: '' };
      case 'audit': return { findings: calls.filter(c => kind(c.schema) === 'audit').length === 1 ? [finding('home')] : [], summary: 'ok' };
      case 'confirm': { const got = ids(call.prompt); return { inputs: got, confirmed: got.map(id => ({ id, proof: 'fixed, see shot' })), still_open: [], regressions: [], summary: 'ok' }; }
      case 'done': return { committed: true, sha: 'abc1234', summary: 'ok', decisions_open: 0 };
      default: return 'ok';
    }
  };
}
// every run names itself (nonce); a continuation (startAt after spec) carries no spec and continues the prior run
// (nonce 'n0') unless the test says otherwise
const demoArgs = (extra = {}) => {
  const cont = extra.startAt && extra.startAt !== 'spec';
  return { out: '/virtual/out', skill: SK, app: '/virtual/app', round: 'r1', date: '12.10', screens: SCREENS, laneSize: 1, auditSize: 2, story: { screens: SCREENS, file: 'STORY.md' }, nonce: 'n1', commit: true, ...(cont ? { continues: 'n0' } : { spec: 'answers.md' }), ...extra };
};
const demo = (args, over) => runWorkflow(path.join(W, 'demo-round.js'), demoArgs(args), demoGood(over));
const dataOf = c => JSON.parse(c.prompt.split('\nDATA: ')[1].split('\nReturn the ')[0]);
// DECISIONS-OPEN.md across runs. rows: {q, state, names}; answers: {q: 'answer N'} («מאיפה השאלה» of each answer).
// The close agent (label "changes") appends needs as «פתוח» (naming the answer they came from), closes every «פתוח» row an
// applied answer settles, and counts «פתוח»; the round-close checkpoint returns the TOOL's count (decisions-open.py:
// every row not exactly «הוכרע · תשובה N» is open, a row closed by hand included).
function world(open = [], answers = {}) {
  const W = { rows: open.map(q => ({ q, state: 'פתוח', names: '' })), answers: { ...answers }, seq: open.length };
  const no = s => { const m = /(\d+)/.exec(String(s || '')); return m ? `answer ${m[1]}` : ''; };
  W.tool = () => W.rows.filter(r => !/^הוכרע · תשובה \d+$/.test(r.state)).length;
  W.open = () => W.rows.filter(r => r.state === 'פתוח').map(r => r.q);
  W.done = c => {
    if (c.label.startsWith('checkpoint:round close')) return { committed: true, sha: 'abc1234', summary: 'ok', decisions_open: W.tool() };
    if (c.label !== 'changes') return undefined;
    const data = dataOf(c);
    for (const n of data.needs || []) W.rows.push({ q: `Q-${++W.seq}`, state: 'פתוח', names: no(n.source) });
    for (const a of data.appliedAnswers || []) for (const r of W.rows) if (r.state === 'פתוח' && (W.answers[r.q] === a || r.names === a)) r.state = `הוכרע · תשובה ${a.split(' ')[1]}`;
    return { committed: false, sha: '', summary: 'ok', decisions_open: W.rows.filter(r => r.state === 'פתוח').length };
  };
  return W;
}

const CLEAN_ANCHORS = { exit_code: 0, missing: 0, wrong: 0, unknown: 0, stale: 0 };
function planGood(over = {}) {
  return (call, calls) => {
    const k = kind(call.schema);
    if (over[k]) { const r = over[k](call, calls); if (r !== undefined) return r; }
    switch (k) {
      case 'write': return { units: 2, changed: ['x'], rejected: [], outcomes: [], anchors: { ...CLEAN_ANCHORS }, summary: 'ok' };
      case 'verdict': return { verdict: 'APPROVE', summary: 'ok', findings: [], anchors: { ...CLEAN_ANCHORS } };
      case 'second': return { reviewer: 'codex', verdict: 'APPROVE', summary: 'ok', findings: [] };
      case 'done': return { committed: true, sha: 'abc1234', summary: 'ok' };
      default: return 'ok';
    }
  };
}
const planArgs = (extra = {}) => ({ out: '/virtual/out', skill: SK, app: '/virtual/app', round: 'r1', date: '12.10', nonce: 'p1', commit: false, ...extra });
const plan = (args, over) => runWorkflow(path.join(W, 'plan-review.js'), planArgs(args), planGood(over));
const LOW = { severity: 'LOW', where: 'plan/build-plan.md:1', what: 'wording', fix: 'reword' };

await test('H0', 'baseline: a clean demo round passes every gate', async () => {
  const { result } = await demo({});
  return result.gates.demoClean === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H1a', 'demo gate is closed when the spec agent returns nothing', async () => {
  const { result } = await demo({}, { spec: () => null });
  return result.gates.demoClean === false && result.gates.demoNoBlocking === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H1b', 'demo gate is closed when the shared owner returns nothing', async () => {
  const { result } = await demo({}, { spec: () => ({ items: [finding('_shared')], summary: 'ok' }), fix: c => (c.label.includes('shared') ? null : undefined) });
  return result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H1c', 'demo gate is closed while cross-lane requests are left unhandled', async () => {
  const { result } = await demo({}, { fix: () => ({ fixed: [], rejected: [], requests: [{ section: 'profile', file: 'sections/profile.html', change: 'x', why: 'y' }], plan: [], questions: [], needs: [], clean_build: true }) });
  return result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H1d', 'demo gate is closed when the round state could not be saved', async () => {
  const { result } = await demo({}, { done: c => (c.label.startsWith('changes') ? null : undefined) });
  return result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H2', 'a confirm that accounts for no finding leaves every finding open', async () => {
  const { result } = await demo({}, { confirm: () => ({ inputs: [], confirmed: [], still_open: [], regressions: [], summary: 'looked at nothing' }) });
  return result.gates.demoClean === false && result.openTotal >= 1 ? '' : `gates ${JSON.stringify(result.gates)}, open ${result.openTotal}`;
});
await test('H3a', 'a rebuild with one of the five passes is not clean', async () => {
  const { result } = await demo({}, { rebuild: () => ({ build_ok: true, passes: [{ name: 'dark', clean: true, detail: '', screens: [...SCREENS] }], anchors: { plan_exists: false, ran: false, exit_code: 0, missing: 0, wrong: 0, stale: 0 }, notes: '' }) });
  return result.gates.rebuildClean === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H3b', 'a rebuild that skipped check-anchors although a plan exists is not clean', async () => {
  const { result } = await demo({}, { rebuild: () => ({ build_ok: true, passes: ['dark', 'light', '320-dark', '320-light', 'pub'].map(name => ({ name, clean: true, detail: '', screens: [...SCREENS] })), anchors: { plan_exists: true, ran: false, exit_code: 0, missing: 0, wrong: 0, stale: 0 }, notes: '' }) });
  return result.gates.rebuildClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H3c', 'a rebuild pass that shot only some screens is not clean', async () => {
  const { result } = await demo({}, { rebuild: () => ({ build_ok: true, passes: ['dark', 'light', '320-dark', '320-light', 'pub'].map(name => ({ name, clean: true, detail: '', screens: ['home'] })), anchors: { plan_exists: false, ran: false, exit_code: 0, missing: 0, wrong: 0, stale: 0 }, notes: '' }) });
  return result.gates.rebuildClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H7a', 'no lane is told to build an owner decision in advance', async () => {
  const { calls } = await demo({ mode: 'build' });
  const bad = calls.filter(c => /meanwhile/i.test(c.prompt));
  return bad.length ? `${bad.length} prompts still say "meanwhile"` : '';
});
await test('H7b', 'a lane that needs an owner decision closes the demo gate and surfaces the question', async () => {
  const { result } = await demo({}, { fix: c => (c.label.startsWith('lanes:home') ? { fixed: [], rejected: [], requests: [], plan: [], questions: [], needs: [{ kind: 'decision', section: 'home', question: 'which?', options: ['a', 'b'], recommendation: 'a' }], clean_build: true } : undefined) });
  return result.gates.demoClean === false && result.needs >= 1 ? '' : `gates ${JSON.stringify(result.gates)}, needs ${result.needs}`;
});
await test('M16', 'confirms are capped at 3 whatever maxConfirms says', async () => {
  const { calls } = await demo({ maxConfirms: 20 }, { confirm: c => { const got = ids(c.prompt); return { inputs: got, confirmed: [], still_open: [{ ...finding('home'), id: got[0] || 'F-x' }], regressions: [], summary: 'still open' }; } });
  const rounds = new Set(calls.filter(c => kind(c.schema) === 'confirm').map(c => c.label.split(':')[0])).size;
  return rounds <= 3 ? '' : `${rounds} confirm rounds`;
});
await test('M17a', 'the first build prepares the shared components before any screen lane', async () => {
  const { calls } = await demo({ mode: 'build', spec: undefined });
  const first = calls.findIndex(c => kind(c.schema) === 'fix');
  return first >= 0 && /shared/.test(calls[first].label) ? '' : `first fix agent: ${first >= 0 ? calls[first].label : 'none'}`;
});
await test('M17b', 'a round without a STORY cannot pass the demo gate', async () => {
  const { result } = await demo({ story: undefined });
  return result.gates.demoClean === false && result.gates.storyChecked === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});

await test('H4a', 'after an APPROVE every plan edit is followed by a diff-only confirm (no unchecked final edit)', async () => {
  const { result, calls } = await plan({}, { verdict: c => ({ verdict: 'APPROVE', summary: 'ok', findings: [LOW] }) });
  const lastConfirm = calls.map(c => c.label).lastIndexOf(calls.filter(c => c.label.startsWith('plan-confirm')).slice(-1)[0]?.label);
  const fixAfter = calls.slice(lastConfirm + 1).filter(c => c.label.startsWith('plan-fix') || c.label === 'start-build');
  return fixAfter.length ? `edits after the last confirm: ${fixAfter.map(c => c.label).join(', ')}` : (result.gates.reviewApproved === true ? '' : `gates ${JSON.stringify(result.gates)}`);
});
await test('H4b', 'a fix that returns nothing never leaves the plan approved', async () => {
  const { result } = await plan({}, { verdict: c => (c.label.startsWith('plan-review') ? { verdict: 'APPROVE', summary: 'ok', findings: [LOW] } : undefined), write: c => (c.label.startsWith('plan-fix') ? null : undefined) });
  return result.gates.reviewApproved === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H5a', 'a fallback Opus that rejects with no findings blocks the plan', async () => {
  const { result } = await plan({}, { second: () => ({ reviewer: 'none', verdict: 'APPROVE', summary: 'codex out of quota, grok missing', findings: [] }), verdict: c => (/second/.test(c.label) ? { verdict: 'REJECT', summary: 'no', findings: [] } : undefined) });
  return result.gates.reviewApproved === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('H5b', 'secondModel:false never yields a plan ready for Nadav', async () => {
  const { result, calls } = await plan({ secondModel: false });
  const sb = calls.some(c => c.label === 'start-build');
  return result.gates.readyForOwner === false && !sb ? '' : `gates ${JSON.stringify(result.gates)}, start-build written: ${sb}`;
});
await test('H8', 'the workflow separates reviewer approval from Nadav\'s approval', async () => {
  const { result } = await plan({});
  return result.gates.reviewApproved === true && result.gates.ownerApproved === false && result.gates.readyForOwner === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('M15', 'the diff-only confirm compares the snapshot\'s plan/ with plan/', async () => {
  const { calls } = await plan({}, { verdict: c => (c.label.startsWith('plan-review') ? { verdict: 'APPROVE', summary: 'ok', findings: [LOW] } : undefined) });
  const c = calls.find(x => x.label.startsWith('plan-confirm'));
  return c && /diff -ruN? \S+\/plan-snap-[^/\s]+\/plan\/? \S+\/out\/plan\/?/.test(c.prompt) ? '' : `prompt: ${c ? (c.prompt.match(/diff[^\n]{0,160}/) || [''])[0] : 'no confirm'}`;
});

// ---------------- dry-run tool ----------------
const dry = (script, args, ...flags) => {
  const s = path.join(TMP, `s-${Math.abs(hash(script))}.js`);
  fs.writeFileSync(s, script);
  const a = path.join(TMP, `a-${Math.abs(hash(args))}.json`);
  fs.writeFileSync(a, args);
  return sh('node', [path.join(T, 'dry-run-workflow.mjs'), s, a, ...flags]);
};
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0; return h; }
await test('H10', 'an exception inside parallel() fails the dry run', async () => {
  const r = dry("export const meta = { name: 'x', description: 'y', phases: [{ title: 'A' }] }\nphase('A')\nconst r = await parallel([() => { throw new Error('boom') }])\nreturn r\n", '{}');
  return r.status === 1 && /boom/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('M13', 'args are measured in bytes', async () => {
  const r = dry("export const meta = { name: 'x', description: 'y' }\nreturn 1\n", JSON.stringify({ t: 'א'.repeat(30000) }));
  return r.status === 1 && /bytes/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('M14a', 'a meta that calls a function is rejected', async () => {
  const r = dry("export const meta = { name: String('x'), description: 'y' }\nreturn 1\n", '{}');
  return r.status === 1 ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('M14b', 'double-quoted phase titles are read', async () => {
  const r = dry('export const meta = { name: "x", description: "y", phases: [{ title: "A" }] }\nphase("A")\nreturn 1\n', '{}');
  return r.status === 0 ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});

// ---------------- python tools ----------------
const cfg = JSON.parse(fs.readFileSync(path.join(MINI, 'redesign.json'), 'utf8'));
// a copy of the fixture under work/tests/<name>/ with its paths pointed back at the fixture
function fixtureCopy(name, edit = c => c, sections = {}) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  const c = JSON.parse(JSON.stringify(cfg));
  c.dirs = Object.fromEntries(Object.entries(c.dirs).map(([k, v]) => [k, path.relative(dir, path.resolve(MINI, v))]));
  c.dirs.sections = 'sections';
  c.dirs.today = 'today';
  fs.mkdirSync(path.join(dir, 'today'), { recursive: true });
  for (const s of cfg.screens) fs.writeFileSync(path.join(dir, 'today', `${s.id}.png`), PNG1);
  c.plan = path.relative(dir, path.join(MINI, 'plan/build-plan.md'));
  for (const s of cfg.screens) fs.copyFileSync(path.join(MINI, 'sections', `${s.id}.html`), path.join(dir, 'sections', `${s.id}.html`));
  for (const [id, html] of Object.entries(sections)) fs.writeFileSync(path.join(dir, 'sections', `${id}.html`), html);
  fs.writeFileSync(path.join(dir, 'redesign.json'), JSON.stringify(edit(c), null, 1));
  return dir;
}
await test('H6a', 'check-anchors fails on a citation of a screen that does not exist', async () => {
  const p = path.join(TMP, 'unknown-screen.md');
  fs.writeFileSync(p, fs.readFileSync(path.join(MINI, 'plan/build-plan.md'), 'utf8').replace('`s-home`', '`s-nope`'));
  const r = sh('python3', [path.join(T, 'check-anchors.py'), '--config', 'redesign.json', '--plan', p]);
  return r.status === 1 && /nope/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('H6b', 'check-anchors fails when the sections folder is missing', async () => {
  const dir = fixtureCopy('no-sections', c => ({ ...c, dirs: { ...c.dirs, sections: 'missing-dir' } }));
  const r = sh('python3', [path.join(T, 'check-anchors.py'), '--config', path.join(dir, 'redesign.json')]);
  return r.status === 1 ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});
await test('H9d', 'build.py refuses a remote font', async () => {
  const dir = fixtureCopy('remote-font', c => ({ ...c, fonts: [{ family: 'Assistant', file: 'https://fonts.gstatic.com/s/assistant/v1/a.woff2' }] }));
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 1 && /only local/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('M21a', 'build.py fails on a tab-bar item that opens no screen', async () => {
  const dir = fixtureCopy('nav-target', c => ({ ...c, nav: { ...c.nav, items: [...c.nav.items, { id: 'x', label: 'x', icon: 'home', screen: 'nope' }] } }));
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 1 && /nope/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('M21b', 'build.py fails on an icon reference with no symbol', async () => {
  const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('#i-search', '#i-missing');
  const dir = fixtureCopy('icon-ref', c => c, { home });
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 1 && /i-missing/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('L25', 'publish-prep fails a page still over 16 MB', async () => {
  const big = path.join(TMP, 'big.html');
  fs.writeFileSync(big, '<!doctype html><p>' + 'x'.repeat(17 * 1000 * 1000) + '</p>');
  const r = sh('python3', [path.join(T, 'publish-prep.py'), '--config', 'redesign.json', big, path.join(TMP, 'big-pub')]);
  return r.status === 1 ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('M12', 'journal-state never calls a run with a malformed journal or unknown models safe', async () => {
  const run = path.join(TMP, 'wf_fake');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'journal.jsonl'), '{"type":"started","key":"k1","agentId":"a1"}\n{"type":"result","key":"k1","agentId":"a1","result":{"ok":1}}\n{"type":"started","key":"k2","agen');
  const r = sh('python3', [path.join(T, 'journal-state.py'), run, path.join(TMP, 'wf.json')]);
  return r.status !== 0 && /unknown|malformed|incomplete/i.test(r.stdout) && !/resume is safe|nothing to resume/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});

// ---------------- node tools without a browser ----------------
await test('H9b', 'capture-today refuses a base_url that is not a local dev server', async () => {
  const dir = fixtureCopy('remote-base', c => ({ ...c, today: { ...c.today, base_url: 'http://example.invalid/' } }));
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json')]);
  return r.status === 2 ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});
await test('H9c', 'capture-today refuses a route that leaves the dev-server origin', async () => {
  const dir = fixtureCopy('route-escape', c => ({ ...c, today: { ...c.today, routes: [{ name: 'x', path: 'http://example.invalid/x', expect: 'x' }] } }));
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json')]);
  return r.status === 2 ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});
await test('L23', 'capture-today rejects an unknown screen name', async () => {
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', 'redesign.json', 'nope']);
  return r.status === 2 ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});

// ---------------- documents ----------------
const read = p => fs.readFileSync(path.join(SK, p), 'utf8');
await test('M18', 'redesign keeps its run log and debts in the output repo, and Loop position finds the package', async () => {
  const skill = fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
  const loop = skill.split('\n').find(l => l.startsWith('- **Loop position')) || '';
  return /RUN-LOG\.md/.test(read('README.md')) && !/\.omc\/design-runs\/redesign/.test(read('README.md')) && /design-redesign/.test(loop) ? '' : 'README still writes into the app repo, or Loop position does not know the package';
});
await test('M19', 'the features template no longer allows an unmarked new feature inside «אחרי»', async () => !/או בתוך טלפון ה«אחרי»/.test(read('templates/FEATURES-PROPOSED.md')) ? '' : 'template still allows it');
await test('M20', 'the START-BUILD check runs from the output repo', async () => /cd "<out>" && python3 tools\/check-anchors\.py/.test(read('templates/START-BUILD.md')) ? '' : 'command still relative to the app repo');
await test('L24', 'the mini fixture carries no SporChat path and no absolute machine path', async () => {
  const bad = ['redesign.json', 'demo-round.args.json', 'plan-review.args.json'].filter(f => /sportchat|hippocamp|\/home\//i.test(fs.readFileSync(path.join(MINI, f), 'utf8')));
  return bad.length || /'match', 'room'/.test(read('workflows/demo-round.js')) ? `still in: ${bad.join(', ')}` : '';
});
await test('L26', 'step 0 makes a first commit before it shows git log -1', async () => /add -A && git (-C \S+ )?commit/.test(read('README.md').split('### 1.')[0]) ? '' : 'step 0 has no commit');

const pw = process.env.PLAYWRIGHT_MODULE;
// ---------------- field test on Green Room (12.10.2026): ids G<severity><n> ----------------
const shAsync = (cmd, args, opts = {}) => new Promise(resolve => {
  const ch = spawn(cmd, args, { cwd: MINI, ...opts });
  let stdout = '', stderr = '';
  ch.stdout.on('data', d => { stdout += d; });
  ch.stderr.on('data', d => { stderr += d; });
  const timer = setTimeout(() => ch.kill(), opts.timeout || 180000);
  ch.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
// a throwaway app server on 8977 that logs every path it is asked for (async: the capture runs as a child process)
async function serve(dir, { port = 8977, redirects = {} } = {}) {
  const http = await import('http');
  const seen = [];
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    seen.push(u);
    if (redirects[u]) { res.writeHead(302, { location: redirects[u] }); return res.end(); }
    const f = path.join(dir, u.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<h1>404</h1>'); }
    const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'image/png';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(port, '127.0.0.1', resolve); });
  return { seen, close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(r); }) };
}
const page = (title, body, script = '') => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
function swApp() {
  const app = path.join(TMP, 'app-sw');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'home.html'), page('בית', '<h1>בית</h1><div id="modal"></div><div style="height:5000px"></div><img loading="lazy" src="/lazy.png" alt="" width="10" height="10">',
    "if(!localStorage.getItem('seen')){fetch('/modal-shown');document.getElementById('modal').textContent='גלגל פרסים'}if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')"));
  fs.writeFileSync(path.join(app, 'book.html'), page('הזמנה', '<h1>הזמנה</h1>'));
  fs.writeFileSync(path.join(app, 'offline.html'), page('אין חיבור', '<h1>אין חיבור לאינטרנט</h1>'));
  fs.writeFileSync(path.join(app, 'broken.html'), page('בית', '<h1>בית</h1><p>משהו השתבש</p>'));
  fs.writeFileSync(path.join(app, 'lazy.png'), PNG1);
  fs.writeFileSync(path.join(app, 'sw.js'), "self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open('c').then(c=>c.add('/offline.html')))});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('/offline.html'))});");
  return app;
}
const todayCfg = (name, today, extra = {}) => fixtureCopy(name, c => ({ ...c, dirs: { ...c.dirs, today: 'today' }, today: { base_url: 'http://127.0.0.1:8977/', ...today }, ...extra }));
const answers = (dir, rows) => fs.writeFileSync(path.join(dir, 'DECISIONS-ANSWERED.md'), '| # | ההכרעה | התשובה |\n|---|---|---|\n' + rows.map(([n, text]) => `| ${n} | ${text} | כן |`).join('\n') + '\n');

await test('GH1c', 'capture-today refuses a route with no expected text (a wrong screen could pass)', async () => {
  const dir = todayCfg('g-noexpect', { routes: [{ name: 'home', path: 'home.html' }] });
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 && /expect/.test(r.stderr + r.stdout) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('GH2a', 'build.py draws an uncaptured «היום» from today_missing with its «לא צולם» label', async () => {
  const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('{{IMG:home}}', '{{IMG:nohome}}').replace('<div class="col-label">היום · <bdi dir="ltr">/home</bdi></div>', '<div class="col-label">היום · לא צולם · האפליקציה צריכה סודות</div>');
  const dir = fixtureCopy('g-missing', c => ({ ...c, today_missing: { nohome: 'האפליקציה צריכה סודות שאין במחשב הזה' } }), { home });
  fs.writeFileSync(path.join(dir, 'INVENTORY.md'), '## Screens that could not be captured\n| Screen | Sources tried | Why none worked | How the demo shows it instead |\n|---|---|---|---|\n| nohome | DoD, dev server, local build | secrets | drawn from the code |\n');
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 0 ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('GH2b', 'build.py refuses an uncaptured «היום» whose label does not say «לא צולם»', async () => {
  const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('{{IMG:home}}', '{{IMG:nohome}}');
  const dir = fixtureCopy('g-missing-label', c => ({ ...c, today_missing: { nohome: 'no server' } }), { home });
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 1 && /לא צולם/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('GH2c', 'a deployed site needs Nadav\'s recorded approval and stays signed out', async () => {
  const dir = todayCfg('g-remote-session', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 7' }, storage_state: 'qa.json', routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'צילום «היום» מ־example.invalid, בלי חשבון']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json')]);
  return r.status === 2 && /signed.out/i.test(r.stderr) ? '' : `exit ${r.status}: ${r.stderr.slice(-200)}`;
});
await test('GH2d', 'an approved deployed origin is accepted (signed out, no session)', async () => {
  if (!pw) return 'SKIP: set PLAYWRIGHT_MODULE';
  const dir = todayCfg('g-remote-ok', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 7' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'צילום «היום» מ־example.invalid, בלי חשבון']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 120000 });
  return r.status === 1 && /NAME_NOT_RESOLVED/.test(r.stdout) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('GM3a', 'journal-state --help prints its help and exits 0', async () => {
  const r = sh('python3', [path.join(T, 'journal-state.py'), '--help']);
  return r.status === 0 && /usage/.test(r.stdout) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-200)}`;
});
await test('GM3b', 'journal-state writes into a folder that does not exist yet, and <synthetic> is not a model', async () => {
  const run = path.join(TMP, 'wf_synth');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'journal.jsonl'), '{"type":"started","key":"k1","agentId":"a1"}\n{"type":"result","key":"k1","agentId":"a1","result":{"ok":1}}\n');
  fs.writeFileSync(path.join(run, 'agent-a1.meta.json'), '{"description":"lane:x","workflowPhase":"Lanes"}');
  fs.writeFileSync(path.join(run, 'agent-a1.jsonl'), '{"type":"assistant","message":{"model":"claude-opus-5"}}\n{"type":"assistant","message":{"model":"<synthetic>"}}\n');
  const out = path.join(TMP, 'new-dir/state/wf.json');
  const r = sh('python3', [path.join(T, 'journal-state.py'), run, out]);
  return r.status === 0 && fs.existsSync(out) && !/NOT all Opus/.test(r.stdout) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});
await test('GM4', 'the machine rule gates on memory and bounds the load wait', async () => {
  const { calls } = await demo({});
  const pr = calls[0].prompt;
  return /10 minutes/.test(pr) && /available/.test(pr) && /swap/.test(pr) ? '' : 'MACHINE text has no bounded wait or memory gate';
});
await test('GM5', 'the success colour comes from the app; the template carries a live role and says its colours are placeholders', async () => {
  const tpl = JSON.parse(read('templates/redesign.json'));
  const brief = read('templates/BRIEF.md');
  return tpl.theme.dark.live && tpl.theme.light.live && tpl.theme.$comment && /app's own/.test(brief) && /live/i.test(brief) ? '' : 'template or BRIEF unchanged';
});
await test('GM6', 'a tab-bar item may point at a screen that does not exist yet (screen: null)', async () => {
  const dir = fixtureCopy('g-nav-null', c => ({ ...c, nav: { ...c.nav, items: [...c.nav.items, { id: 'later', label: 'בהמשך', icon: 'home', screen: null }] } }));
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  const html = r.status === 0 ? fs.readFileSync(path.join(dir, 'demo.html'), 'utf8') : '';
  return r.status === 0 && /aria-disabled="true"[^>]*>|<span[^>]*aria-disabled="true"/.test(html) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('GM7', 'component variants may share «מצב» phones, mapped in INVENTORY.md and checked by the words lens', async () => {
  const { calls } = await demo({});
  const words = calls.find(c => /verify:words/.test(c.label));
  return /variant/i.test(read('README.md')) && /[Vv]ariant/.test(read('templates/INVENTORY.md')) && words && /variant/i.test(words.prompt) ? '' : 'no variant rule';
});
await test('GM8', 'inventory-scan lists the routes, boundaries, state signals and controls of a Next app', async () => {
  const app = path.join(TMP, 'next-app');
  fs.mkdirSync(path.join(app, 'src/app/(shop)/book'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/app/(shop)/page.tsx'), 'export default function P(){return <main><button>הזמנה</button><Link href="/book">x</Link>{items.length ? null : <p>אין משחקים</p>}</main>}');
  fs.writeFileSync(path.join(app, 'src/app/(shop)/book/page.tsx'), 'export default function B(){return <form><input/><button>שלח</button></form>}');
  fs.writeFileSync(path.join(app, 'src/app/(shop)/loading.tsx'), 'export default function L(){return null}');
  const r = sh('python3', [path.join(T, 'inventory-scan.py'), app]);
  return r.status === 0 && /\| `\/` \|/.test(r.stdout) && /\| `\/book` \|/.test(r.stdout) && /ריק/.test(r.stdout) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`;
});
await test('GM9', 'the README gives the local-font recipe', async () => /\.next\/static\/media/.test(read('README.md')) && /@fontsource/.test(read('README.md')) ? '' : 'no recipe');
await test('GM10', 'step 0 pins the app\'s commit and INVENTORY.md carries it', async () => /rev-parse HEAD/.test(read('README.md').split('### 1.')[0]) && /ls-remote/.test(read('README.md')) && /commit/i.test(read('templates/INVENTORY.md').split('\n').slice(0, 8).join('\n')) ? '' : 'no pin');
await test('GM11', 'retro step 0 also reads redesign run logs', async () => {
  const skill = fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
  const retro0 = skill.split('\n').find(l => l.startsWith('0. Find the run')) || '';
  return /design-redesign\/\*\/RUN-LOG\.md/.test(retro0) ? '' : 'retro does not look for RUN-LOG.md';
});
await test('GL4', 'build.py lints Hebrew inside an LTR island', async () => {
  const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('<h1 class="h1">הריצות הקרובות</h1>', '<h1 class="h1">הריצות הקרובות</h1><span dir="ltr">קוד שגיאה: 504</span>');
  const dir = fixtureCopy('g-ltr', c => ({ ...c, lint: JSON.parse(read('templates/redesign.json')).lint }), { home });
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return /lint hebrew-in-ltr/.test(r.stdout) ? '' : `no lint line: ${r.stdout.slice(-200)}`;
});
await test('GL7', 'the masthead takes title_html so a Latin brand sits in its own bdi', async () => {
  const dir = fixtureCopy('g-title', c => ({ ...c, title: 'Green Room · דמו', title_html: '<bdi dir="ltr">Green Room</bdi> · דמו' }));
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  const html = r.status === 0 ? fs.readFileSync(path.join(dir, 'demo.html'), 'utf8') : '';
  return /<h1><bdi dir="ltr">Green Room<\/bdi> · דמו<\/h1>/.test(html) && /<title>Green Room · דמו<\/title>/.test(html) ? '' : `exit ${r.status}`;
});
await test('GL8', 'a dark-only app needs no light passes for a clean rebuild', async () => {
  const { result } = await demo({ themes: ['dark'] }, { rebuild: () => ({ build_ok: true, passes: ['dark', '320-dark', 'pub'].map(name => ({ name, clean: true, detail: '', screens: [...SCREENS] })), anchors: { plan_exists: false, ran: false, exit_code: 0, missing: 0, wrong: 0, stale: 0 }, notes: '' }) });
  return result.gates.rebuildClean === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('GL5+L6+L9+L10', 'docs: committed session helpers, an icon recipe, step 0 wording, pnpm Playwright paths', async () => {
  const rd = read('README.md');
  const skill = fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
  const why = [];
  if (!/tools\/local\//.test(rd)) why.push('L5');
  if (!fs.existsSync(path.join(T, 'icons-from-lucide.mjs')) || !/icons-from-lucide/.test(rd)) why.push('L6');
  if (!/as README step 0 lists/.test(skill)) why.push('L9');
  if (!/\.pnpm\/playwright@/.test(rd) || !/@playwright\/test\/index\.mjs/.test(rd)) why.push('L10');
  return why.join(', ');
});
await test('GL6', 'icons-from-lucide writes the app\'s own lucide icons as SVG files', async () => {
  const lucide = process.env.LUCIDE_REACT_DIR;
  if (!lucide) return 'SKIP: set LUCIDE_REACT_DIR to an app\'s node_modules/lucide-react';
  const out = path.join(TMP, 'icons');
  fs.mkdirSync(out, { recursive: true });
  const r = sh('node', [path.join(T, 'icons-from-lucide.mjs'), lucide, out, 'calendar', 'chevron-left=back']);
  return r.status === 0 && /<path/.test(fs.readFileSync(path.join(out, 'back.svg'), 'utf8')) && fs.existsSync(path.join(out, 'calendar.svg')) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-200)}`;
});

if (!noBrowser && pw) {
  // one capture run, three facts: the service worker never answers (H1), the page was walked (M2a), the first-visit
  // overlay key was set (M2b)
  const app = swApp();
  let srv = { seen: [] }, cap = { status: null };
  await test('GH1a', 'capture-today blocks service workers: /book comes from the server, not an offline page', async () => {
    const dir = todayCfg('g-sw', { routes: [{ name: 'home', path: 'home.html', expect: 'בית', wait: 1500 }, { name: 'book', path: 'book.html', expect: 'הזמנה' }], local_storage: { seen: '1' } });
    srv = await serve(app);
    try { cap = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 180000 }); } finally { await srv.close(); }
    return cap.status === 0 && srv.seen.includes('/book.html') ? '' : `exit ${cap.status}, server saw ${JSON.stringify(srv.seen)}`;
  });
  await test('GM2a', 'capture-today walks the page so lazy images load before the full-page shot', async () => (srv.seen.includes('/lazy.png') ? '' : `server saw ${JSON.stringify(srv.seen)}`));
  await test('GM2b', 'capture-today sets today.local_storage before the page loads (no first-visit overlay)', async () => (cap.status === 0 && !srv.seen.includes('/modal-shown') ? '' : 'the overlay showed, or the capture did not run'));

  await test('GH1b', 'capture-today fails a page without its expected text, or with a known error text', async () => {
    const d = todayCfg('g-wrongpage', { routes: [{ name: 'book', path: 'offline.html', expect: 'הזמנה' }, { name: 'home', path: 'broken.html', expect: 'בית' }], reject: ['משהו השתבש', 'אין חיבור לאינטרנט'] });
    const s = await serve(app);
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(d, 'redesign.json'), '--pw', pw], { timeout: 120000 }); } finally { await s.close(); }
    const out = (() => { try { return JSON.parse(r.stdout); } catch { return { errors: [], written: [] }; } })();
    return r.status === 1 && out.errors.length === 2 && !out.written.length ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
  });
  await test('GM1', 'a failed capture moves the old shot aside, so the build sees it as missing', async () => {
    const d = todayCfg('g-stale', { routes: [{ name: 'gone', path: 'gone.html', expect: 'x' }] });
    fs.mkdirSync(path.join(d, 'today'), { recursive: true });
    fs.writeFileSync(path.join(d, 'today/gone.png'), 'OLD');
    const s = await serve(app);
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(d, 'redesign.json'), '--pw', pw], { timeout: 120000 }); } finally { await s.close(); }
    const moved = fs.existsSync(path.join(d, 'today/.stale/gone.png')) && !fs.existsSync(path.join(d, 'today/gone.png'));
    return r.status === 1 && moved ? '' : `exit ${r.status}, moved aside: ${moved}`;
  });
  await test('GL1+L2+L3', 'shoot defaults to work/shots/<theme>, maps phones to labels, and flags small targets and low contrast', async () => {
    const extra = '<div class="phone"><div class="body"><button style="inline-size:20px;block-size:20px;padding:0">x</button><p style="color:#555;background:#444;margin:16px">טקסט חלש</p></div>{{NAV:home}}</div>';
    const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('<div class="notes">', `<div class="col"><div class="col-label after">מצב · בדיקת נגישות</div>${extra}</div>\n    <div class="notes">`);
    const d = fixtureCopy('g-shoot', c => c, { home });
    const b = sh('python3', [path.join(T, 'build.py'), '--config', path.join(d, 'redesign.json'), path.join(d, 'demo.html')]);
    if (b.status !== 0) return `build failed: ${b.stdout.slice(-200)}`;
    sh('node', [path.join(T, 'shoot.mjs'), '--config', path.join(d, 'redesign.json'), '--in', path.join(d, 'demo.html'), '--pw', pw, 'home'], { timeout: 300000 });
    const why = [];
    const rep = path.join(d, 'work/shots/dark/report.json');
    if (!fs.existsSync(rep)) return 'no work/shots/dark/report.json (L1)';
    const r = JSON.parse(fs.readFileSync(rep, 'utf8'));
    const labels = fs.existsSync(path.join(d, 'work/shots/dark/labels.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'work/shots/dark/labels.json'), 'utf8')) : {};
    if (!labels.home || labels.home['4'] !== 'מצב · בדיקת נגישות') why.push(`L2 labels ${JSON.stringify(labels.home || {})}`);
    const adv = r.advisory || {};
    if (!(adv.targets || []).some(x => x.phone === 4)) why.push('L3 targets');
    if (!(adv.contrast || []).some(x => /טקסט חלש/.test(x.text))) why.push('L3 contrast');
    return why.join('; ');
  });
}

// ---------------- fresh Opus confirm review (12.10.2026): ids O<severity><n> ----------------
// the gates a continuation may inherit (owner decisions are never among them: DECISIONS-OPEN.md decides those)
const PRIOR = { round: 'r1', nonce: 'n0', specApplied: true, answersApplied: true, lanesComplete: true, requestsHandled: true, storyChecked: true, verifyComplete: true };
const fileSet = (extra = {}) => ({ key: 'home', n: 1, lane: ['home'], file: 'state/r0/open-home.json', findings: [{ id: 'F-r0-1', section: 'home', severity: 'P1' }], ...extra });
const confirmAll = c => { const got = ids(c.prompt); return { inputs: got, confirmed: got.map(id => ({ id, proof: 'fixed' })), still_open: [], regressions: [], summary: 'ok' }; };
await test('OH1a', 'a continuation at the confirms without prior gates can not go green', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()] }, { confirm: confirmAll });
  return result.gates.demoClean === false && result.gates.verifyComplete === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OH1b', 'a continuation given args.spec is refused: answers go in by starting at spec', async () => {
  try { await demo({ startAt: 'verify', spec: 'answers/r2.md', priorGates: PRIOR }); return 'it ran'; } catch (e) { return /spec/.test(String(e)) ? '' : String(e); }
});
await test('OH1c', 'guard: a continuation with all prior gates true and a clean confirm goes green', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], priorGates: PRIOR }, { confirm: confirmAll });
  return result.gates.demoClean === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OH1d', 'a prior gate that was false stays false in the continuation', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], priorGates: { ...PRIOR, verifyComplete: false } }, { confirm: confirmAll });
  return result.gates.verifyComplete === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OH1e', 'the round state lives in the committed state/<round>/ and the close agent appends, never truncates', async () => {
  const { calls } = await demo({});
  const close = calls.find(c => c.label === 'changes');
  return close && /state\/r1\//.test(close.prompt) && !/work\/state/.test(close.prompt) && /append/i.test(close.prompt) && /never truncate/i.test(close.prompt) ? '' : 'the close prompt still writes work/state or overwrites';
});
// a throwaway git app whose route files were committed long ago (so a fresh shot is newer)
function gitApp(name) {
  const app = path.join(TMP, name);
  fs.mkdirSync(path.join(app, 'src/app'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/app/page.tsx'), 'export default function P(){return null}');
  const env = { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'init']]) spawnSync('git', a, { cwd: app, env });
  return app;
}
await test('OH2', 'today-from-dod copies a shot only when every fault is absent, in the new and the old DoD format', async () => {
  const app = gitApp('dod-app');
  const scr = path.join(app, 'reports/dod/screens');
  fs.mkdirSync(scr, { recursive: true });
  const e = (route, slug, extra) => ({ route, slug, viewport: { width: 375, height: 812 }, scheme: 'dark', status: 200, load_error: null, unreachable: false, unreachable_reason: null, reached: true, screenshot: `dod/screens/${slug}__375__dark.png`, ...extra });
  const cases = {
    root: e('/', 'root'),
    book: e('/book', 'book', { reached: false, not_reached_reason: 'still loading' }),
    secret: e('/secret', 'secret', { status: 302, unreachable: true, unreachable_reason: 'redirected to /login' }),
    alias: e('/alias', 'alias', { redirected_to: '/' }),
    unreach: e('/unreach', 'unreach', { unreachable: true, unreachable_reason: 'access-denied screen rendered' }),
    s500: e('/s500', 's500', { status: 500 }),
    oldredir: e('/oldredir', 'oldredir', { redirected: true, landed: 'http://localhost:3000/login' }),
    oldland: e('/oldland', 'oldland', { landed: 'http://localhost:3000/elsewhere' }),
    noreached: (() => { const x = e('/noreached', 'noreached'); delete x.reached; return x; })(),
    nullreached: e('/nullreached', 'nullreached', { reached: null }),
    oldsame: e('/oldsame', 'oldsame', { redirected: true, landed: 'http://localhost:3000/oldsame' }),
    query: e('/q?players=2', 'query', { landed: 'http://localhost:3000/q?players=2' }),
    qdiff: e('/q2?players=2', 'qdiff', { landed: 'http://localhost:3000/q2?players=3' }),
    stale: e('/stale', 'stale'),
    nofiles: e('/nofiles', 'nofiles'),
  };
  for (const [, x] of Object.entries(cases)) fs.writeFileSync(path.join(scr, `${x.slug}__375__dark.png`), PNG1);
  fs.utimesSync(path.join(scr, 'stale__375__dark.png'), new Date('2019-01-01'), new Date('2019-01-01'));
  fs.writeFileSync(path.join(app, 'reports/dod/dod.json'), JSON.stringify({ routes: Object.fromEntries(Object.values(cases).map(x => [x.route, { entries: [x] }])) }));
  const dir = fixtureCopy('dod-copy');
  fs.rmSync(path.join(dir, 'today'), { recursive: true, force: true });
  const pairs = Object.entries(cases).map(([n, x]) => (n === 'nofiles' ? `${n}=${x.route}` : `${n}=${x.route}:src/app/page.tsx`));
  const r = sh('python3', [path.join(T, 'today-from-dod.py'), '--config', path.join(dir, 'redesign.json'), '--dod', path.join(app, 'reports/dod/dod.json'), '--app', app, ...pairs]);
  let out; try { out = JSON.parse(r.stdout); } catch { return `exit ${r.status}: ${(r.stdout + r.stderr).slice(-300)}`; }
  const rejected = out.rejected.map(x => x.name).sort().join();
  const want = Object.keys(cases).filter(n => n !== 'root' && n !== 'query').sort().join();
  const why = out.rejected.find(x => x.name === 'noreached');
  const ok = r.status === 1 && out.accepted.map(x => x.name).sort().join() === 'query,root' && rejected === want && why && /source 2/.test(why.reason) && !/update e2e/.test(why.reason)
    && fs.existsSync(path.join(dir, 'today/root.png')) && !fs.existsSync(path.join(dir, 'today/book.png'));
  return ok ? '' : `exit ${r.status}: accepted ${out.accepted.map(x => x.name)}, rejected ${rejected}`;
});
await test('NQ1', 'today-from-dod refuses to run without --app: freshness is mandatory', async () => {
  const dir = fixtureCopy('dod-noapp');
  const dod = path.join(TMP, 'dod-noapp.json');
  fs.writeFileSync(dod, JSON.stringify({ routes: {} }));
  const r = sh('python3', [path.join(T, 'today-from-dod.py'), '--config', path.join(dir, 'redesign.json'), '--dod', dod, 'home=/:src/app/page.tsx']);
  return r.status === 2 && /--app/.test(r.stderr) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-200)}`;
});
await test('OM2a', 'an approval must be «answer N»', async () => {
  const dir = todayCfg('o-free-approval', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'Nadav said ok' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'example.invalid']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 && /«answer N»/.test(r.stderr) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('OM2b', 'an approval must point at a row of DECISIONS-ANSWERED.md that exists', async () => {
  const dir = todayCfg('o-no-row', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 9' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'example.invalid']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 && /answer 9/.test(r.stderr) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('OM2c', 'the answer row must name the origin it approves', async () => {
  const dir = todayCfg('o-wrong-row', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 7' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'something else entirely']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 && /example\.invalid/.test(r.stderr) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('OM2d', 'the template ships with no remote origin and no approval', async () => {
  const tpl = JSON.parse(read('templates/redesign.json'));
  return !(tpl.today.allow_origins || []).length && !Object.keys(tpl.today.approvals || {}).length ? '' : 'template pre-fills an origin or an approval';
});
const HIGH = { severity: 'HIGH', where: 'plan/build-plan.md:9', what: 'ships the wrong thing', fix: 'x' };
await test('OM3', 'an APPROVE that still lists a HIGH never approves the plan', async () => {
  const { result } = await plan({}, { verdict: c => (c.label.startsWith('plan-review') ? { verdict: 'APPROVE', summary: 'ok', findings: [LOW] } : c.label.startsWith('plan-confirm') ? { verdict: 'APPROVE', summary: 'ok', findings: [HIGH] } : undefined) });
  return result.gates.reviewApproved === false && Array.isArray(result.open) ? '' : `gates ${JSON.stringify(result.gates)}, open ${JSON.stringify(result.open)}`;
});
await test('OM4', 'the dry run fails when a lane throws inside the round\'s own pool', async () => {
  const r = sh('node', [path.join(T, 'dry-run-workflow.mjs'), path.join(W, 'demo-round.js'), path.join(MINI, 'demo-round.args.json'), '--throw', '^build:home']);
  return r.status === 1 && /errors|threw/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('OM5', 'a lane that rejects an item carrying Nadav\'s answer closes the gate', async () => {
  const { result } = await demo({}, {
    spec: () => ({ items: [finding('home', { source: '12' })], summary: 'ok' }),
    fix: c => (c.label.startsWith('lanes:home') ? { fixed: [], rejected: [{ id: 'F-r1-1', source: '12', what: 'the answer', why: 'I prefer the old look' }], requests: [], plan: [], needs: [], clean_build: true } : undefined),
  });
  return result.gates.answersApplied === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OM6', 'a verify that finds only plan-track items does not keep the demo gate closed', async () => {
  const { result } = await demo({}, { audit: (c, calls) => (calls.filter(x => kind(x.schema) === 'audit').length === 1 ? { findings: [finding('home', { track: 'plan' })], summary: 'x' } : { findings: [], summary: 'ok' }) });
  return result.gates.demoClean === true && result.planItems >= 1 ? '' : `gates ${JSON.stringify(result.gates)}, plan ${result.planItems}`;
});
await test('OM8a', 'check-anchors fails on a citation of an unknown screen without backticks', async () => {
  const p = path.join(TMP, 'unknown-plain.md');
  fs.writeFileSync(p, fs.readFileSync(path.join(MINI, 'plan/build-plan.md'), 'utf8').replace('`s-home` «אחרי · הריצות הקרובות»', 's-nope «אחרי · הריצות הקרובות»'));
  const r = sh('python3', [path.join(T, 'check-anchors.py'), '--config', 'redesign.json', '--plan', p]);
  return r.status === 1 && /nope/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('OM8b', 'check-anchors fails a units table that cites nothing', async () => {
  const p = path.join(TMP, 'no-citations.md');
  fs.writeFileSync(p, '# Plan\n\n## Units\n| Unit | What | Demo |\n|---|---|---|\n| U-1 | Home | the home screen |\n| U-2 | Profile | the profile |\n');
  const r = sh('python3', [path.join(T, 'check-anchors.py'), '--config', 'redesign.json', '--plan', p]);
  return r.status === 1 ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
});
await test('OL1a', 'plan anchors come from structured fields even when no writer ran', async () => {
  const { result } = await plan({ write: false }, { verdict: () => ({ verdict: 'APPROVE', summary: 'ok', findings: [], anchors: { exit_code: 0, missing: 0, wrong: 0, unknown: 0, stale: 0 } }) });
  return result.gates.anchorsClean === true && result.gates.readyForOwner === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OL1b', 'a writer whose check-anchors exited 1 leaves anchorsClean false', async () => {
  const { result } = await plan({}, { write: () => ({ units: 2, changed: ['x'], rejected: [], anchors: { exit_code: 1, missing: 0, wrong: 0, unknown: 1, stale: 0 }, summary: 'ok' }), verdict: () => ({ verdict: 'APPROVE', summary: 'ok', findings: [], anchors: { exit_code: 1, missing: 0, wrong: 0, unknown: 1, stale: 0 } }) });
  return result.gates.anchorsClean === false && result.gates.readyForOwner === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('OL2', 'every snapshot starts empty under a run nonce, and the confirm sees what the writer changed', async () => {
  const { calls } = await plan({ nonce: 'n42' }, { verdict: c => (c.label.startsWith('plan-review') ? { verdict: 'APPROVE', summary: 'ok', findings: [LOW] } : undefined), write: c => (c.label.startsWith('plan-fix') ? { units: 2, changed: ['U-7 acceptance reworded'], rejected: [], anchors: { exit_code: 0, missing: 0, wrong: 0, unknown: 0, stale: 0 }, summary: 'ok' } : undefined) });
  const fix = calls.find(c => c.label.startsWith('plan-fix'));
  const conf = calls.find(c => c.label.startsWith('plan-confirm'));
  return fix && /rm -rf \S*plan-snap-n42/.test(fix.prompt) && conf && /U-7 acceptance reworded/.test(conf.prompt) ? '' : 'no clean snapshot or no changed list';
});
await test('OL3', 'distinct status tokens, read by Loop position', async () => {
  const skill = fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
  const loop = skill.split('\n').find(l => l.startsWith('- **Loop position')) || '';
  return /^\*\*?Status:\*?\*? DRAFT/m.test(read('templates/START-BUILD.md').replace(/\*\*/g, '')) || /^Status: DRAFT/m.test(read('templates/START-BUILD.md'))
    ? (/Status: OWNER-APPROVED/.test(loop) && /Status: DRAFT/.test(read('templates/build-plan.md')) ? '' : 'Loop position or the plan template lacks the token')
    : 'START-BUILD has no «Status: DRAFT» line';
});
await test('OL4', 'the app is run from a throwaway copy and its status is compared before and after', async () => /throwaway/.test(read('README.md')) && /status --short.*before and after|before and after.*status --short/s.test(read('README.md')) ? '' : 'no throwaway rule');
await test('OL5', 'today_missing must match INVENTORY.md, and the START-BUILD check accepts it', async () => {
  const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('{{IMG:home}}', '{{IMG:nohome}}').replace('<div class="col-label">היום · <bdi dir="ltr">/home</bdi></div>', '<div class="col-label">היום · לא צולם · סודות</div>');
  const dir = fixtureCopy('o-missing-inv', c => ({ ...c, today_missing: { nohome: 'סודות' } }), { home });
  const r = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
  return r.status === 1 && /INVENTORY/.test(r.stdout) && /today_missing/.test(read('templates/START-BUILD.md')) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('OL6', 'Nadav sees every second-model finding and what was done with it', async () => {
  const { result } = await plan({}, { second: () => ({ reviewer: 'codex', verdict: 'APPROVE', summary: 'ok', findings: [LOW] }) });
  return result.second && Array.isArray(result.second.findings) && result.second.findings.length === 1 && /every second-model finding/.test(read('README.md')) ? '' : `second ${JSON.stringify(result.second)}`;
});
await test('OL7', 'a file-based finding the confirm does not account for keeps its own section', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet({ findings: [{ id: 'F-r0-1', section: 'profile', severity: 'P1' }] })], priorGates: PRIOR }, { confirm: () => ({ inputs: [], confirmed: [], still_open: [], regressions: [], summary: 'nothing' }) });
  return result.open.length === 1 && result.open[0].section === 'profile' ? '' : `open ${JSON.stringify(result.open)}`;
});
await test('OQ1', 'lanes shoot one at a time unless args.shooters raises it', async () => {
  let active = 0, peak = 0;
  await demo({ mode: 'build', spec: undefined }, { fix: async c => { const ok = { fixed: ['done'], rejected: [], requests: [], plan: [], needs: [], clean_build: true }; if (/shared/.test(c.label)) return ok; active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 20)); active--; return ok; } });
  return peak === 1 ? '' : `${peak} lanes ran at once`;
});

if (!noBrowser && pw) {
  await test('OM1', 'capture-today blocks a WebSocket to an origin the config does not list', async () => {
    const http = await import('http');
    const app = path.join(TMP, 'app-ws');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'ws.html'), page('ws', '<h1>בדיקה</h1>', "try{new WebSocket('ws://127.0.0.1:8978/realtime')}catch(e){}"));
    const upgrades = [];
    const other = http.createServer((q, s) => s.end('x'));
    other.on('upgrade', (q, sock) => { upgrades.push(q.url); sock.destroy(); });
    await new Promise((resolve, reject) => { other.once('error', reject); other.listen(8978, '127.0.0.1', resolve); });
    const s = await serve(app);
    const dir = todayCfg('o-ws', { routes: [{ name: 'ws', path: 'ws.html', expect: 'בדיקה', wait: 1500 }] });
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 120000 }); } finally { await s.close(); other.closeAllConnections?.(); await new Promise(f => other.close(f)); }
    return r.status === 1 && /ws:\/\/127\.0\.0\.1:8978/.test(r.stdout) && !upgrades.length ? '' : `exit ${r.status}, upgrades ${JSON.stringify(upgrades)}: ${r.stdout.slice(-200)}`;
  });
  await test('OM7', 'the page walk ends on an infinite-scroll page and says it was truncated', async () => {
    const app = path.join(TMP, 'app-inf');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'feed.html'), page('feed', '<h1>פיד</h1><div id="f" style="height:2000px"></div>', "addEventListener('scroll',()=>{if(scrollY+innerHeight>document.documentElement.scrollHeight-600){const d=document.createElement('div');d.style.height='1500px';d.textContent='עוד';document.body.appendChild(d)}})"));
    const s = await serve(app);
    const dir = todayCfg('o-inf', { routes: [{ name: 'feed', path: 'feed.html', expect: 'פיד' }] });
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 90000 }); } finally { await s.close(); }
    return r.status === 0 && /truncated/.test(r.stdout) ? '' : `exit ${r.status}: ${(r.stdout + r.stderr).slice(-200)}`;
  });
  await test('OM9a', 'a 302 to a login page fails the capture', async () => {
    const app = path.join(TMP, 'app-302');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'login.html'), page('login', '<h1>כניסה</h1><p>חשבון</p>'));
    const s = await serve(app, { redirects: { '/account.html': '/login.html' } });
    const dir = todayCfg('o-302', { routes: [{ name: 'account', path: 'account.html', expect: 'חשבון' }] });
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 90000 }); } finally { await s.close(); }
    return r.status === 1 && /landed on/.test(r.stdout) && !fs.existsSync(path.join(dir, 'today/account.png')) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
  });
}

// ---------------- second fresh Opus confirm (12.10.2026): ids N…; single-fault tests for mutations that survived ----------------
await test('NN1a', 'an open row in DECISIONS-OPEN.md keeps ownerQueueEmpty closed whatever priorGates say', async () => {
  const W = world(['Q-1']);
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], priorGates: { ...PRIOR, ownerQueueEmpty: true } }, { confirm: confirmAll, done: W.done });
  return result.gates.ownerQueueEmpty === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NN1b', 'prior gates of another round count for nothing', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], priorGates: { ...PRIOR, round: 'r0' } }, { confirm: confirmAll });
  return result.gates.verifyComplete === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NN1c', 'prior gates of another run of the round count for nothing when args.continues names the run', async () => {
  const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], continues: 'runB', priorGates: { ...PRIOR, nonce: 'runA' } }, { confirm: confirmAll });
  return result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
const needLane = c => (c.label.startsWith('lanes:home') ? { fixed: ['x'], rejected: [], requests: [], plan: [], needs: [{ kind: 'decision', section: 'home', question: 'which header?', options: ['a', 'b'], recommendation: 'a' }], clean_build: true } : undefined);
await test('NN1d', 'the saved work gates name their round and run; the close agent counts the «פתוח» rows', async () => {
  const { calls } = await demo({ nonce: 'runA' }, { fix: needLane });
  const close = calls.find(c => c.label === 'changes');
  const wg = close && dataOf(close).workGates;
  return wg && wg.round === 'r1' && wg.nonce === 'runA' && !('needsOpen' in wg) && !('ownerQueueEmpty' in wg) && /«פתוח»/.test(close.prompt) && /«הוכרע · תשובה N»/.test(close.prompt) && /Never close a row any other way/.test(close.prompt) && close.schema.required.includes('decisions_open') ? '' : `workGates ${JSON.stringify(wg)}`;
});
await test('NC1a', 'lanes is not a continuation start (it would skip the spec that applies answers)', async () => {
  try { await demo({ startAt: 'lanes', priorGates: PRIOR }); return 'it ran'; } catch (e) { return /startAt/.test(String(e)) ? '' : String(e); }
});
for (const s of ['rebuild', 'verify', 'confirm']) {
  await test(`NC1b-${s}`, `a run that left a need open, continued at ${s}, stays closed`, async () => {
    const W = world(['Q-1']);
    const saved = { ...PRIOR, nonce: 'r3a' };
    const { result } = await demo({ startAt: s, continues: 'r3a', priorGates: saved, ...(s === 'confirm' ? { confirm: [fileSet()] } : {}) }, { confirm: confirmAll, done: W.done });
    return result.gates.ownerQueueEmpty === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
  });
}
await test('NC2', 'every run needs a nonce, and a continuation names the run it continues', async () => {
  const why = [];
  try { await demo({ nonce: undefined }); why.push('ran without a nonce'); } catch (e) { if (!/nonce/.test(String(e))) why.push(String(e)); }
  try { await demo({ startAt: 'rebuild', continues: undefined, priorGates: PRIOR }); why.push('a continuation ran without continues'); } catch (e) { if (!/continues/.test(String(e))) why.push(String(e)); }
  return why.join('; ');
});
await test('NC3', 'ownerQueueEmpty is never inherited: the file alone decides, both ways', async () => {
  const shut = await demo({ startAt: 'rebuild', priorGates: { ...PRIOR, ownerQueueEmpty: true } }, { done: world(['Q-1', 'Q-2']).done });
  const open = await demo({ startAt: 'rebuild', priorGates: { ...PRIOR, ownerQueueEmpty: false } }, { done: world([]).done });
  return shut.result.gates.ownerQueueEmpty === false && open.result.gates.ownerQueueEmpty === true ? '' : `with 2 open rows ${shut.result.gates.ownerQueueEmpty}, with none ${open.result.gates.ownerQueueEmpty}`;
});
await test('NC4', 'a retried lane or shared owner never overwrites the history it saved before its first edit; history is per run', async () => {
  const { calls } = await demo({ nonce: 'n7', shared: { file: 'work/items/r1-shared.json', n: 1, sources: {} } });
  const lane = calls.find(c => /^lanes:(?!shared)/.test(c.label));
  const shared = calls.find(c => /:shared$/.test(c.label));
  const once = /only when that folder does not exist yet/;
  return lane && shared && once.test(lane.prompt) && once.test(shared.prompt) && /history\/<id>\/r1-n7-lanes\/pre\//.test(lane.prompt) && /history\/<id>\/r1-n7-lanes\/after\//.test(lane.prompt) && /history\/_shared\/r1-n7-lanes\/pre\//.test(shared.prompt) ? '' : 'pre/ copied unconditionally, or history not per run';
});
await test('NC5', 'docs: the DoD usage line, per-finding second-model outcomes, the START-BUILD diff, restart at spec, sources', async () => {
  const rd = read('README.md');
  const skill = fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
  const why = [];
  if (!/today-from-dod\.py --config redesign\.json --dod \S+ --app \S+ \S+=\/\S*:\S+/.test(rd)) why.push('L5 usage');
  if (!/second\.findings\[i\]\.done/.test(rd)) why.push('L6');
  if (!/diff <sha> HEAD -- plan\/build-plan\.md START-BUILD\.md/.test(read('templates/START-BUILD.md'))) why.push('L7');
  if (/continue from\s+extracted state with `startAt`/.test(rd) || !/restart at `spec`/.test(skill)) why.push('L3');
  if (!/the\s+gate depends on/i.test(rd)) why.push('L10');
  return why.join(', ');
});
await test('NN1e', 'answered needs are applied through a spec run, never closed by hand; a cut run passes no old gates', async () => {
  const rd = read('README.md');
  return /never closed by hand/.test(rd) && !/sets `ownerQueueEmpty` true/.test(rd) && /wrote no\s+`?work-gates\.json`?/.test(rd) ? '' : 'README still lets the parent close needs, or says nothing about a cut run';
});
for (const k of ['specApplied', 'answersApplied', 'lanesComplete', 'requestsHandled', 'storyChecked', 'verifyComplete']) {
  await test(`NL2-${k}`, `a continuation whose prior ${k} was false keeps it false`, async () => {
    const { result } = await demo({ startAt: 'confirm', confirm: [fileSet()], priorGates: { ...PRIOR, [k]: false } }, { confirm: confirmAll });
    return result.gates[k] === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
  });
}
await test('NN2', 'a lane that rejects an answer item from a FILE, without echoing its source, closes answersApplied', async () => {
  const { result } = await demo({ spec: undefined, priorGates: PRIOR, items: [{ ids: ['home'], file: 'work/items/r1-home.json', n: 1, sources: { 'I-r1-1': 'answer 12' } }] }, {
    fix: c => (c.label.startsWith('lanes:home') ? { fixed: [], rejected: [{ id: 'I-r1-1', source: '', what: 'the answer', why: 'I prefer the old look' }], requests: [], plan: [], needs: [], clean_build: true } : undefined),
  });
  return result.gates.answersApplied === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NN2b', 'a rejection must say its source (empty when none)', async () => {
  const { calls } = await demo({});
  const lane = calls.find(c => kind(c.schema) === 'fix');
  const req = lane.schema.properties.rejected.items.required;
  return ['id', 'source', 'what', 'why'].every(k => req.includes(k)) && /sources/.test(read('README.md').split('## Running a round')[1] || '') ? '' : `required ${JSON.stringify(req)}`;
});
await test('NL2-sourceOf', 'an inline answer item rejected without its source still closes answersApplied', async () => {
  const { result } = await demo({}, {
    spec: () => ({ items: [finding('home', { source: '23' })], summary: 'ok' }),
    fix: c => (c.label.startsWith('lanes:home') ? { fixed: [], rejected: [{ id: 'F-r1-1', source: '', what: 'answer 23', why: 'I prefer the old one' }], requests: [], plan: [], needs: [], clean_build: true } : undefined),
  });
  return result.gates.answersApplied === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NL2-changes', 'CHANGES lists every rejection with its reason', async () => {
  const { calls } = await demo({});
  const close = calls.find(c => c.label === 'changes');
  return close && /EVERY rejected item with its reason/.test(close.prompt) ? '' : 'the close prompt does not ask for every rejection';
});
await test('NL2-exit', 'a check-anchors exit code alone leaves anchorsClean false', async () => {
  const bad = { exit_code: 1, missing: 0, wrong: 0, unknown: 0, stale: 0 };
  const { result } = await plan({}, { write: () => ({ units: 2, changed: ['x'], rejected: [], outcomes: [], anchors: bad, summary: 'ok' }), verdict: () => ({ verdict: 'APPROVE', summary: 'ok', findings: [], anchors: bad }) });
  return result.gates.anchorsClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NL2-unknown', 'an unknown screen alone leaves anchorsClean false', async () => {
  const bad = { exit_code: 0, missing: 0, wrong: 0, unknown: 1, stale: 0 };
  const { result } = await plan({}, { write: () => ({ units: 2, changed: ['x'], rejected: [], outcomes: [], anchors: bad, summary: 'ok' }), verdict: () => ({ verdict: 'APPROVE', summary: 'ok', findings: [], anchors: bad }) });
  return result.gates.anchorsClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NL2-errors', 'the dry run fails on a result that lists errors, even with no "threw" in the log', async () => {
  const r = dry("export const meta = { name: 'x', description: 'y' }\nreturn { errors: ['a lane died quietly'] }\n", '{}');
  return r.status === 1 && /errors/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
await test('NL1', 'the START-BUILD check accepts only status and State edits after the approved commit', async () => /diff --stat <sha> HEAD/.test(read('templates/START-BUILD.md')) ? '' : 'item 2 still demands HEAD == sha only');
await test('NL6', 'an approval names the host as a whole token, not inside a longer name', async () => {
  const dir = todayCfg('n-host-token', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 7' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'צילום מ־myexample.invalid']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
await test('NL7', 'a verify that finds only plan-track items runs no fix rebuild', async () => {
  const { calls } = await demo({}, { audit: (c, cs) => (cs.filter(x => kind(x.schema) === 'audit').length === 1 ? { findings: [finding('home', { track: 'plan' })], summary: 'x' } : { findings: [], summary: 'ok' }) });
  return !calls.some(c => c.label === 'rebuild:fix') ? '' : 'a fix rebuild ran for plan-only findings';
});
await test('NL8a', 'stateSaved needs the checkpoint commit of the round close', async () => {
  const { result } = await demo({}, { done: c => (c.label.startsWith('checkpoint:round close') ? { committed: false, sha: '', summary: 'git refused' } : undefined) });
  return result.gates.stateSaved === false && result.gates.demoClean === false ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('NL8b', 'plan-review has no default nonce', async () => {
  try { await runWorkflow(path.join(W, 'plan-review.js'), { ...planArgs(), nonce: undefined }, planGood()); return 'it ran without a nonce'; } catch (e) { return /nonce/.test(String(e)) ? '' : String(e); }
});
await test('NL8c', 'what was done with each second-model finding is reported per finding', async () => {
  const L2 = { severity: 'LOW', where: 'plan/build-plan.md:3', what: 'second', fix: 'f' };
  const { result } = await plan({}, {
    second: () => ({ reviewer: 'codex', verdict: 'APPROVE', summary: 'ok', findings: [LOW, L2] }),
    write: c => (c.label.includes('second') ? { units: 2, changed: ['U-1'], rejected: ['the second one: already true'], outcomes: [{ i: 0, done: 'changed', note: 'U-1 reworded' }, { i: 1, done: 'rejected', note: 'already true' }], anchors: { ...CLEAN_ANCHORS }, summary: 'ok' } : undefined),
  });
  const f = (result.second && result.second.findings) || [];
  return f.length === 2 && f[0].done === 'changed' && f[1].done === 'rejected' ? '' : `second ${JSON.stringify(result.second)}`;
});
await test('NQ2', 'local_storage is refused with a deployed base_url (signed out only)', async () => {
  const dir = todayCfg('n-remote-ls', { base_url: 'http://example.invalid/', approvals: { 'http://example.invalid': 'answer 7' }, local_storage: { token: 'x' }, routes: [{ name: 'home', path: 'home', expect: 'בית' }] });
  answers(dir, [[7, 'צילום מ־example.invalid']]);
  const r = sh('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), ...(pw ? ['--pw', pw] : [])], { timeout: 120000 });
  return r.status === 2 && /local_storage/.test(r.stderr) ? '' : `exit ${r.status}: ${(r.stderr + r.stdout).slice(-200)}`;
});
if (!noBrowser && pw) {
  await test('NL4', 'a screen that triggered a blocked request is not written, and its old shot moves aside', async () => {
    const app = path.join(TMP, 'app-blocked');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'home.html'), page('בית', '<h1>בית</h1><img src="http://127.0.0.1:9/api.png" alt="">', "try{new WebSocket('ws://127.0.0.1:9/rt')}catch(e){}"));
    const dir = todayCfg('n-blocked', { routes: [{ name: 'home', path: 'home.html', expect: 'בית', wait: 800 }] });
    fs.writeFileSync(path.join(dir, 'today/home.png'), 'OLD');
    const s = await serve(app);
    let r;
    try { r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 90000 }); } finally { await s.close(); }
    const aside = !fs.existsSync(path.join(dir, 'today/home.png')) && fs.existsSync(path.join(dir, 'today/.stale/home.png'));
    return r.status === 1 && aside && /blocked/.test(r.stdout) ? '' : `exit ${r.status}, moved aside ${aside}: ${r.stdout.slice(-200)}`;
  });
}

// ---------------- fourth fresh confirm (12.10.2026): owner state has one authority, DECISIONS-OPEN.md (ids D…) ----------------
const savedOf = run => { const c = run.calls.find(x => x.label === 'changes'); return c ? dataOf(c).workGates : null; };
const contAt = (s, prevNonce, saved, extra = {}) => ({ nonce: `${prevNonce}-${s}`, startAt: s, continues: prevNonce, priorGates: saved, ...(s === 'confirm' ? { confirm: [fileSet()] } : {}), ...extra });
const closedOrThrew = async (fn) => { try { const { result } = await fn(); return result.gates.demoClean === false && result.gates.demoNoBlocking === false ? '' : `gates ${JSON.stringify(result.gates)}`; } catch (e) { return ''; } };
// run A of round r1: a spec run whose home lane raises an owner need (DECISIONS-OPEN.md gets Q-1)
const runA = async W => demo({ nonce: 'r3a' }, { fix: needLane, done: W.done });
await test('D3a', 'a spec start without args.spec after a run that left a need open stays closed', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); const A = await runA(W);
  return closedOrThrew(() => demo({ nonce: 'r3b', spec: undefined, continues: 'r3a', priorGates: savedOf(A) }, { done: W.done }));
});
await test('D3b', 'the same without priorGates stays closed', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); await runA(W);
  return closedOrThrew(() => demo({ nonce: 'r3b', spec: undefined }, { done: W.done }));
});
await test('D3c', 'a spec start with item files that do not answer the need stays closed', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); const A = await runA(W);
  return closedOrThrew(() => demo({ nonce: 'r3b', spec: undefined, priorGates: savedOf(A), items: [{ ids: ['profile'], file: 'work/items/r1-profile.json', n: 2, sources: {} }] }, { done: W.done }));
});
await test('D3d', 'a spec start whose spec answers something else stays closed', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); const A = await runA(W);
  return closedOrThrew(() => demo({ nonce: 'r3b', priorGates: savedOf(A) }, { spec: () => ({ items: [finding('profile', { source: '7' })], summary: 'ok' }), done: W.done }));
});
await test('D3e', 'a spec start with home items that carry no answer stays closed', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); await runA(W);
  return closedOrThrew(() => demo({ nonce: 'r3b', spec: undefined, items: [{ ids: ['home'], file: 'work/items/r1-home.json', n: 1, sources: {} }] }, { done: W.done }));
});
await test('D-chain', 'a chain of continuations after a run with an open need stays closed at every step', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); const A = await runA(W);
  let prev = 'r3a', saved = savedOf(A), why = '';
  for (const s of ['rebuild', 'verify', 'confirm']) {
    const r = await demo(contAt(s, prev, saved), { confirm: confirmAll, done: W.done });
    if (r.result.gates.demoClean || r.result.gates.demoNoBlocking) why += `${s} went green; `;
    prev = `${prev}-${s}`; saved = savedOf(r);
  }
  return why;
});
await test('D7a', 'a spec start without args.spec after a run whose spec was not applied is refused', async () => {
  const A2 = await demo({ nonce: 'r3a' }, { spec: () => null });
  try { await demo({ nonce: 'r3b', spec: undefined, continues: 'r3a', priorGates: savedOf(A2) }); return 'it ran'; } catch (e) { return /spec/.test(String(e)) ? '' : String(e); }
});
await test('D-items', 'a continuation given item files is refused (item files go in by starting at spec)', async () => {
  const why = [];
  for (const x of [{ items: [{ ids: ['profile'], file: 'work/items/r1-p.json', n: 1, sources: { 'I-r1-4': 'answer 23' } }] }, { shared: { file: 'work/items/r1-s.json', n: 1, sources: {} } }]) {
    try { await demo({ startAt: 'rebuild', priorGates: PRIOR, ...x }); why.push(`ran with ${Object.keys(x)[0]}`); } catch (e) { if (!/item/.test(String(e))) why.push(String(e)); }
  }
  return why.join('; ');
});
await test('D-applied', 'the close agent is told which answers this run applied, minus the rejected ones', async () => {
  const { calls } = await demo({ items: [{ ids: ['profile'], file: 'work/items/r1-p.json', n: 2, sources: { 'I-r1-4': 'answer 23', 'I-r1-5': 'answer 24' } }] }, {
    spec: () => ({ items: [finding('home', { source: '12' })], summary: 'ok' }),
    fix: c => (c.label.startsWith('lanes:profile') ? { fixed: [], rejected: [{ id: 'I-r1-5', source: '', what: 'x', why: 'y' }], requests: [], plan: [], needs: [], clean_build: true } : undefined),
  });
  const a = dataOf(calls.find(c => c.label === 'changes')).appliedAnswers;
  return JSON.stringify(a) === JSON.stringify(['answer 12', 'answer 23']) ? '' : `appliedAnswers ${JSON.stringify(a)}`;
});
await test('D-applied-gone', 'the answers of a lane that returned nothing are not applied', async () => {
  const { calls } = await demo({}, { spec: () => ({ items: [finding('home', { source: '12' }), finding('profile', { source: '13' })], summary: 'ok' }), fix: c => (c.label.startsWith('lanes:home') ? null : undefined) });
  const a = dataOf(calls.find(c => c.label === 'changes')).appliedAnswers;
  return JSON.stringify(a) === JSON.stringify(['answer 13']) ? '' : `appliedAnswers ${JSON.stringify(a)}`;
});
await test('D-journal', 'journal-state tells a cut run to restart the round at spec, never to write a continuation', async () => {
  const run = path.join(TMP, 'wf_cut');
  fs.mkdirSync(run, { recursive: true });
  const lines = [];
  for (const [i, done] of [[1, true], [2, false], [3, true]]) {
    lines.push(JSON.stringify({ type: 'started', key: `k${i}`, agentId: `a${i}` }));
    if (done) lines.push(JSON.stringify({ type: 'result', key: `k${i}`, agentId: `a${i}`, result: { ok: 1 } }));
    fs.writeFileSync(path.join(run, `agent-a${i}.meta.json`), JSON.stringify({ description: `lanes:x${i}`, workflowPhase: 'Lanes' }));
    fs.writeFileSync(path.join(run, `agent-a${i}.jsonl`), JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5' } }) + '\n');
  }
  fs.writeFileSync(path.join(run, 'journal.jsonl'), lines.join('\n') + '\n');
  const r = sh('python3', [path.join(T, 'journal-state.py'), run, path.join(TMP, 'wf-cut.json')]);
  return r.status === 0 && /do NOT resume/.test(r.stdout) && /Restart the round at spec/.test(r.stdout) && !/continuation/i.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-200)}`;
});
// the legitimate paths of the confirm stay green
await test('D3f', 'legit: a spec start whose spec applies the answer goes green', async () => {
  const W = world([], { 'Q-1': 'answer 12' }); const A = await runA(W);
  const { result } = await demo({ nonce: 'r3b', priorGates: savedOf(A) }, { spec: () => ({ items: [finding('home', { source: '12' })], summary: 'ok' }), done: W.done });
  return result.gates.demoClean === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('D7b', 'legit: after a failed spec, a spec start WITH the spec goes green', async () => {
  const A2 = await demo({ nonce: 'r3a' }, { spec: () => null });
  const { result } = await demo({ nonce: 'r3b', priorGates: savedOf(A2) }, { spec: () => ({ items: [finding('home', { source: '1' })], summary: 'ok' }) });
  return result.gates.demoClean === true ? '' : `gates ${JSON.stringify(result.gates)}`;
});
await test('D8', 'legit: continuations and chains after a clean run go green; an answered need, applied at spec, then continued, goes green', async () => {
  const why = [];
  const C0 = await demo({ nonce: 'c0' }, { spec: () => ({ items: [finding('home', { source: '3' })], summary: 'ok' }) });
  if (!C0.result.gates.demoClean) why.push('clean run');
  for (const s of ['rebuild', 'verify', 'confirm']) {
    const r = await demo(contAt(s, 'c0', savedOf(C0)), { confirm: confirmAll });
    if (!r.result.gates.demoClean) why.push(`cont ${s}: ${JSON.stringify(r.result.gates)}`);
  }
  let prev = 'c0', saved = savedOf(C0);
  for (const s of ['confirm', 'rebuild', 'verify']) {
    const r = await demo(contAt(s, prev, saved), { confirm: confirmAll });
    if (!r.result.gates.demoClean) why.push(`chain ${s}`);
    prev = `${prev}-${s}`; saved = savedOf(r);
  }
  const W = world([], { 'Q-1': 'answer 12' }); await runA(W);
  const B = await demo({ nonce: 'r3b' }, { spec: () => ({ items: [finding('home', { source: '12' })], summary: 'ok' }), done: W.done });
  const D = await demo(contAt('confirm', 'r3b', savedOf(B)), { confirm: confirmAll, done: W.done });
  if (!B.result.gates.demoClean || !D.result.gates.demoClean) why.push(`answered need: B ${B.result.gates.demoClean}, D ${D.result.gates.demoClean}`);
  const b1 = await demo({ nonce: 'b1', mode: 'build', spec: undefined });
  if (!b1.result.gates.demoClean) why.push(`build mode first run ${JSON.stringify(b1.result.gates)}`);
  return why.join('; ');
});
await test('D-docs', 'docs: a restart at spec passes the latest work gates, the cut run\'s needs go to Nadav first; journal-state says restart at spec', async () => {
  const rd = read('README.md');
  const js = fs.readFileSync(path.join(T, 'journal-state.py'), 'utf8');
  const why = [];
  if (!/latest `?state\/<round>\/work-gates\.json`? as `?priorGates/.test(rd)) why.push('README restart');
  if (!/DECISIONS-OPEN\.md and to Nadav before the restart/.test(rd)) why.push('README needs first');
  if (/continuation script|args\.startAt and those files/.test(js) || !/restart the round at spec/.test(js)) why.push('journal-state');
  if (!/נשארת «פתוח» עד שריצה מיישמת/.test(read('templates/DECISIONS-OPEN.md'))) why.push('DECISIONS-OPEN template');
  if (!/<round>-<nonce>-<tag>/.test(rd)) why.push('history per run');
  return why.join(', ');
});

// ---------------- fifth fresh confirm (12.10.2026): an answer is applied only whole; the count is a tool's (ids P…) ----------------
const greenR = r => r.result.gates.demoClean || r.result.gates.demoNoBlocking;
const notGreen = async fn => { try { const r = await fn(); return greenR(r) ? `went green: ${JSON.stringify(r.result.gates)}` : ''; } catch (e) { return ''; } };
const appliedOf = r => dataOf(r.calls.find(c => c.label === 'changes')).appliedAnswers;
const laneR = (sec, res) => c => (c.label.startsWith(`lanes:${sec}`) ? res : undefined);
const FIXR = (o = {}) => ({ fixed: ['x'], rejected: [], requests: [], plan: [], needs: [], clean_build: true, ...o });
const specOf = (...items) => () => ({ items, summary: 'ok' });
await test('PN1', 'an answer whose profile half went to a lane that returned nothing is not applied, and a spec start without the spec is refused', async () => {
  const W = world(['Q-1'], { 'Q-1': 'answer 12' });
  const A = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' }), finding('profile', { source: '12' })), fix: laneR('profile', null), done: W.done });
  if (appliedOf(A).includes('answer 12') || !W.open().includes('Q-1') || greenR(A)) return `applied ${JSON.stringify(appliedOf(A))}, open ${W.open()}`;
  return notGreen(() => demo({ nonce: 'r3b', spec: undefined, continues: 'r3a', priorGates: savedOf(A) }, { done: W.done }));
});
await test('PN1b', 'an answer that left a request unhandled is not applied, and the restart without the spec is refused', async () => {
  const W = world(['Q-1'], { 'Q-1': 'answer 12' });
  const REQ = { section: 'profile', file: 'sections/profile.html', change: 'rename per answer 12', why: 'answer 12', source: 'answer 12' };
  const A = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' })), fix: () => FIXR({ requests: [REQ] }), done: W.done });
  if (appliedOf(A).includes('answer 12')) return `applied ${JSON.stringify(appliedOf(A))}`;
  const lane = A.calls.find(c => /^lanes:home/.test(c.label));
  if (!lane.schema.properties.requests.items.properties.source) return 'a request cannot carry its source';
  return notGreen(() => demo({ nonce: 'r3b', spec: undefined, continues: 'r3a', priorGates: savedOf(A) }, { done: W.done }));
});
await test('PN13', 'an answer split between a lane that returned and a shared owner that returned nothing is not applied', async () => {
  const r = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' }), finding('_shared', { source: '12' })), fix: c => (/:shared(~retry\d+)?$/.test(c.label) ? null : undefined) });
  return !appliedOf(r).includes('answer 12') ? '' : `applied ${JSON.stringify(appliedOf(r))}`;
});
await test('PN2', 'a CHANGES answer (no row) rejected by its lane cannot be laundered by a spec start without the spec', async () => {
  const W = world();
  const A = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '40' })), fix: laneR('home', FIXR({ fixed: [], rejected: [{ id: 'F-r1-1', source: 'answer 40', what: 'x', why: 'prefer old' }] })), done: W.done });
  if (greenR(A)) return 'run A went green';
  return notGreen(() => demo({ nonce: 'r3b', spec: undefined, continues: 'r3a', priorGates: savedOf(A) }, { done: W.done }));
});
await test('PN3', 'an answer item a lane returns as a conflict need is not applied', async () => {
  const W = world(['Q-1'], { 'Q-1': 'answer 12' });
  const A = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' })), fix: laneR('home', FIXR({ fixed: [], needs: [{ kind: 'decision', section: 'home', question: 'answer 12 conflicts with answer 5: which wins?', options: ['12', '5'], recommendation: '12', source: 'answer 12' }] })), done: W.done });
  const lane = A.calls.find(c => /^lanes:home/.test(c.label));
  return !appliedOf(A).includes('answer 12') && W.open().includes('Q-1') && lane.schema.properties.needs.items.properties.source ? '' : `applied ${JSON.stringify(appliedOf(A))}, open ${W.open()}`;
});
await test('PN4', 'a source that is not a bare answer number is never credited (spec item, verifier finding)', async () => {
  const A = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: 'r3 · answer 12' })) });
  const B = await demo({ startAt: 'verify', priorGates: PRIOR }, { audit: (c, cs) => (cs.filter(x => kind(x.schema) === 'audit').length === 1 ? { findings: [finding('home', { source: 'INVENTORY.md:42' })], summary: 'x' } : { findings: [], summary: 'ok' }), confirm: confirmAll });
  return !appliedOf(A).length && !appliedOf(B).length ? '' : `A ${JSON.stringify(appliedOf(A))}, B ${JSON.stringify(appliedOf(B))}`;
});
await test('PN5', 'a close agent that counts 0 while a row is open does not open the gate (the tool counts)', async () => {
  const W = world(['Q-1']);
  const r = await demo({ nonce: 'r3a' }, { done: c => (c.label === 'changes' ? { ...W.done(c), decisions_open: 0 } : W.done(c)) });
  const ck = r.calls.find(c => c.label.startsWith('checkpoint:round close'));
  const runsTool = ck && /python3 tools\/decisions-open\.py DECISIONS-OPEN\.md/.test(ck.prompt) && ck.schema.required.includes('decisions_open');
  return r.result.gates.ownerQueueEmpty === false && !greenR(r) && runsTool ? '' : `gates ${JSON.stringify(r.result.gates)}, checkpoint runs the tool: ${!!runsTool}`;
});
await test('PN6', 'a row closed by hand still counts as open', async () => {
  const W = world([], { 'Q-1': 'answer 12' });
  const A = await demo({ nonce: 'r3a' }, { fix: needLane, done: W.done });
  W.rows[0].state = 'נסגר · BRIEF.md §3';
  return notGreen(() => demo(contAt('rebuild', 'r3a', savedOf(A)), { done: W.done }));
});
await test('PN7', 'legit: a «keep» answer becomes a «no change» item and closes its row', async () => {
  const W = world([], { 'Q-1': 'answer 12' });
  const A = await demo({ nonce: 'r3a' }, { fix: needLane, done: W.done });
  const B = await demo({ nonce: 'r3b', priorGates: savedOf(A) }, { spec: specOf(finding('home', { source: '12', fix: 'no change: keep as approved' })), done: W.done });
  const spec = B.calls.find(c => c.label === 'spec');
  return greenR(B) && spec && /no change: <why>/.test(spec.prompt) ? '' : `gates ${JSON.stringify(B.result.gates)}, rule in spec prompt: ${!!(spec && /no change/.test(spec.prompt))}`;
});
await test('PN8', 'a restart of a cut first run with item files only (no spec, no prior gates) is refused', async () => {
  try { await demo({ round: 'r4', nonce: 'r4c', spec: undefined, items: [{ ids: ['home'], file: 'work/items/r4-home-done.json', n: 1, sources: { 'I-r4-1': 'answer 40' } }] }); return 'it ran'; } catch (e) { return /priorGates|noSpec/.test(String(e)) ? '' : String(e); }
});
await test('PN8c', 'change/revert answers from the CHANGES review get rows, so an unapplied one keeps the gate closed', async () => {
  const W = world(['Q-7', 'Q-8'], { 'Q-7': 'answer 40', 'Q-8': 'answer 41' });
  const A = await demo({ nonce: 'r4a' }, { spec: specOf(finding('home', { source: '39' })), done: W.done });
  const C = await demo({ nonce: 'r4c', spec: undefined, priorGates: savedOf(A), items: [{ ids: ['home'], file: 'work/items/r4-home-done.json', n: 1, sources: { 'I-r4-1': 'answer 40' } }] }, { done: W.done });
  const docs = /CHANGES-<date>\.md/.test(read('templates/DECISIONS-OPEN.md')) && /Every change or revert answer\s+also gets a «פתוח» row/.test(read('README.md'));
  return !greenR(C) && W.open().includes('Q-8') && docs ? '' : `C green ${greenR(C)}, open ${W.open()}, docs ${docs}`;
});
await test('PN9', 'a need a lane re-raises from answer 12 is closed when answer 12 is applied again', async () => {
  const W = world([], { 'Q-1': 'answer 12' });
  await demo({ nonce: 'r3a' }, { fix: needLane, done: W.done });
  const reraise = laneR('home', FIXR({ needs: [{ kind: 'decision', section: 'home', question: 'which header, again?', options: ['a', 'b'], recommendation: 'a', source: 'answer 12' }] }));
  const B = await demo({ nonce: 'r3b' }, { spec: specOf(finding('home', { source: '12' })), fix: reraise, done: W.done });
  const C = await demo({ nonce: 'r3c', priorGates: savedOf(B) }, { spec: specOf(finding('home', { source: '12' })), done: W.done });
  const close = C.calls.find(c => c.label === 'changes');
  return greenR(C) && /any row that names answer N/.test(close.prompt) ? '' : `C green ${greenR(C)}, open ${W.open()}`;
});
await test('PN11', 'a rejection of an id the lane was not given is an error', async () => {
  const W = world(['Q-1'], { 'Q-1': 'answer 12' });
  return notGreen(() => demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' })), fix: laneR('home', FIXR({ fixed: [], rejected: [{ id: 'F-r1-01', source: '', what: 'header per answer 12', why: 'prefer old' }] })), done: W.done }));
});
for (const how of ['rejects', 'needs']) {
  await test(`PN12-${how}`, `an answer that lives in a cross-lane request is not applied when the shared owner ${how === 'rejects' ? 'rejects it' : 'returns it as a need'}`, async () => {
    const W = world(['Q-1'], { 'Q-1': 'answer 12' });
    const REQ = { section: '_shared', file: 'parts/00-head.html', change: 'filled tab icons', why: 'answer 12', source: 'answer 12' };
    const r = await demo({ nonce: 'r3a' }, { spec: specOf(finding('home', { source: '12' })), done: W.done,
      fix: c => (c.label === 'lanes:home' ? FIXR({ fixed: [], requests: [REQ] }) : /req1:shared/.test(c.label) ? (how === 'rejects' ? FIXR({ fixed: [], rejected: [{ id: ids(c.prompt).find(i => /^F-/.test(i)) || 'x', source: '', what: 'icons', why: 'BRIEF' }] }) : FIXR({ fixed: [], needs: [{ kind: 'decision', section: '_shared', question: 'filled icons conflict with BRIEF', options: ['a', 'b'], recommendation: 'a', source: 'answer 12' }] })) : undefined) });
    return !greenR(r) && !appliedOf(r).includes('answer 12') ? '' : `green ${greenR(r)}, applied ${JSON.stringify(appliedOf(r))}`;
  });
}
await test('P7a-ii', 'a spec start without the spec and without the round\'s prior gates is refused', async () => {
  try { await demo({ nonce: 'r3b', spec: undefined }); return 'it ran'; } catch (e) { return /priorGates/.test(String(e)) ? '' : String(e); }
});
await test('P-tool', 'decisions-open.py counts every row that is not exactly «הוכרע · תשובה N»', async () => {
  const p = path.join(TMP, 'DECISIONS-OPEN.md');
  fs.writeFileSync(p, '| # | ההכרעה | אפשרויות | המלצה ולמה | מקור | מצב |\n|---|---|---|---|---|---|\n| Q-1 | a | b | c | d | הוכרע · תשובה 12 |\n| Q-2 | a | b | c | d | פתוח |\n| Q-3 | a | b | c | d | נסגר · BRIEF.md §3 |\n| Q-4 | a | b | c | d | הוכרע |\n');
  const r = sh('python3', [path.join(T, 'decisions-open.py'), p]);
  let out; try { out = JSON.parse(r.stdout); } catch { return `exit ${r.status}: ${r.stdout}`; }
  return r.status === 0 && out.open === 3 && out.rows.join() === 'Q-2,Q-3,Q-4' ? '' : `exit ${r.status}: ${r.stdout}`;
});
// legitimate paths of the fifth confirm stay green
await test('PL', 'legit: a spec start without spec after a clean run; build mode with a shared need then answered; a cut-run restart with the spec; a noSpec round', async () => {
  const why = [];
  const C0 = await demo({ nonce: 'c0' }, { spec: specOf(finding('home', { source: '3' })) });
  const L2b = await demo({ nonce: 'c1', spec: undefined, continues: 'c0', priorGates: savedOf(C0) });
  if (!greenR(L2b)) why.push(`L2b ${JSON.stringify(L2b.result.gates)}`);
  const W2 = world([], {});
  const b = await demo({ nonce: 'b1', mode: 'build', spec: undefined }, { done: W2.done, fix: c => (c.label === 'build:shared' ? FIXR({ needs: [{ kind: 'decision', section: '_shared', question: 'sheet style?', options: ['a', 'b'], recommendation: 'a' }] }) : undefined) });
  if (greenR(b)) why.push('L4b build mode with an open need went green');
  W2.answers['Q-1'] = 'answer 1';
  const b2 = await demo({ nonce: 'b2', priorGates: savedOf(b) }, { spec: specOf(finding('_shared', { source: '1' })), done: W2.done });
  if (!greenR(b2)) why.push(`L4c ${JSON.stringify(b2.result.gates)}`);
  const L5 = await demo({ round: 'r4', nonce: 'r4c' }, { spec: specOf(finding('home', { source: '40' }), finding('profile', { source: '41' })) });
  if (!greenR(L5) || JSON.stringify(appliedOf(L5)) !== JSON.stringify(['answer 40', 'answer 41'])) why.push(`L5 ${JSON.stringify(L5.result.gates)} ${JSON.stringify(appliedOf(L5))}`);
  const ns = await demo({ nonce: 'ns1', spec: undefined, noSpec: true, items: [{ ids: ['home'], file: 'work/items/r1-home.json', n: 1, sources: {} }] });
  if (!greenR(ns)) why.push(`noSpec ${JSON.stringify(ns.result.gates)}`);
  return why.join('; ');
});

// ---------------- browser tests (one at a time) ----------------
if (!noBrowser && pw) {
  await test('H9a+M22', 'shoot blocks remote requests, finds text cut by a clipping ancestor, and shoots every screenful', async () => {
    const extra = '<div class="phone"><div class="body"><div style="overflow:hidden;margin:16px"><p style="white-space:nowrap;margin:0">טקסט ארוך מאוד שנחתך בשקט בתוך קופסה עם overflow נסתר ולא מופיע בשום דוח</p></div><div style="block-size:3200px"></div><img src="http://127.0.0.1:9/x.png" alt="תמונה מרוחקת"><script>try{new WebSocket("ws://127.0.0.1:9/live")}catch(e){}</script></div>{{NAV:home}}</div>';
    const home = fs.readFileSync(path.join(MINI, 'sections/home.html'), 'utf8').replace('<div class="notes">', `<div class="col"><div class="col-label after">מצב · בדיקה</div>${extra}</div>\n    <div class="notes">`);
    const dir = fixtureCopy('shoot-neg', c => c, { home });
    const b = sh('python3', [path.join(T, 'build.py'), '--config', path.join(dir, 'redesign.json'), path.join(dir, 'demo.html')]);
    if (b.status !== 0) return `build failed: ${b.stdout.slice(-200)}`;
    const r = sh('node', [path.join(T, 'shoot.mjs'), '--config', path.join(dir, 'redesign.json'), '--in', path.join(dir, 'demo.html'), '--dir', path.join(dir, 'shots'), '--pw', pw, 'home'], { timeout: 300000 });
    const rep = JSON.parse(fs.readFileSync(path.join(dir, 'shots/report.json'), 'utf8'));
    const phoneShots = fs.readdirSync(path.join(dir, 'shots')).filter(f => /^ph-home-4-/.test(f)).length;
    const why = [];
    if (r.status !== 1) why.push(`exit ${r.status}`);
    if (!(rep.blocked || []).some(x => /http:\/\/127\.0\.0\.1:9/.test(x))) why.push('remote image not in blocked');
    if (!(rep.blocked || []).some(x => /ws:\/\/127\.0\.0\.1:9/.test(x))) why.push('websocket not in blocked');
    if (!(rep.cut || []).some(x => /טקסט ארוך/.test(x.text))) why.push('clipped text not in cut');
    if (phoneShots < 5) why.push(`only ${phoneShots} shots of a 3200px phone`);
    return why.join('; ');
  });
  await test('M11', 'capture-today fails a 404 and never leaves the old shot in place as if it were current', async () => {
    const dir = fixtureCopy('capture-404', c => ({ ...c, dirs: { ...c.dirs, today: 'today' }, today: { ...c.today, routes: [{ name: 'gone', path: 'gone.html', expect: 'x' }] } }));
    fs.mkdirSync(path.join(dir, 'today'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'today/gone.png'), 'KEEP');
    const server = await serve(path.join(MINI, 'app'));
    try {
      const r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 120000 });
      const aside = !fs.existsSync(path.join(dir, 'today/gone.png')) && fs.readFileSync(path.join(dir, 'today/.stale/gone.png'), 'utf8') === 'KEEP';
      return r.status === 1 && aside ? '' : `exit ${r.status}, old shot moved aside untouched: ${aside}`;
    } finally {
      await server.close();
    }
  });
  await test('H9e', 'capture-today blocks a request to an origin the config does not list, and fails', async () => {
    const app = path.join(TMP, 'app-remote');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'home.html'), '<!doctype html><html lang="he" dir="rtl"><body><p>בית</p><img src="http://127.0.0.1:9/track.png" alt=""></body></html>');
    const dir = fixtureCopy('capture-blocked', c => ({ ...c, dirs: { ...c.dirs, today: 'today' }, today: { ...c.today, routes: [{ name: 'home', path: 'home.html', expect: 'בית' }] } }));
    const server = await serve(app);
    try {
      const r = await shAsync('node', [path.join(T, 'capture-today.mjs'), '--config', path.join(dir, 'redesign.json'), '--pw', pw], { timeout: 120000 });
      return r.status === 1 && /127\.0\.0\.1:9\/track\.png/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(-300)}`;
    } finally {
      await server.close();
    }
  });
} else {
  results.push({ id: 'browser', name: 'browser tests (set PLAYWRIGHT_MODULE, drop --no-browser)', ok: true, skip: true, why: 'SKIP: no browser this run' });
}

for (const r of results) console.log(`${r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(8)} ${r.name}${r.ok && !r.skip ? '' : `\n         ${r.why}`}`);
const failed = results.filter(r => !r.ok).length;
const skipped = results.filter(r => r.skip).length;
console.log(`${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
if (failed) console.log(`the fixture copies are kept in ${TMP}`);
else fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
