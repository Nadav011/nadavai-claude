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

// The skill is a router (SKILL.md) plus one file per mode (modes/*.md); a test that looks for a rule reads all of it.
const routerText = () => fs.readFileSync(path.join(SK, '..', 'SKILL.md'), 'utf8');
const skillText = () => [path.join(SK, '..', 'SKILL.md'), ...fs.readdirSync(path.join(SK, '..', 'modes')).sort().map(f => path.join(SK, '..', 'modes', f))]
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
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
  const skill = routerText(); // Loop position is a hard rule: it must be in the router, not in a mode file
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
// «An app is built once» (shared/rules.md): the page draws the main journey only; the rest is designed in the app's preview.
await test('DI1', 'a direction-only demo (journey screens only): the words lens prompt checks INVENTORY.md only for the screens it draws (a prompt-contract test: the mock verifier follows its prompt)', async () => {
  // a verifier that follows its prompt: told to check INVENTORY.md for every screen, it reports the undrawn screens as
  // lost and keeps them open; told the scope, it reports nothing about them
  let unscoped = false;
  const scoped = /INVENTORY\.md for the screens this demo draws[\s\S]*does not draw is outside this round.s lens and is never a finding/;
  const over = {
    audit: c => { if (/verify:words/.test(c.label) && !scoped.test(c.prompt)) unscoped = true; return undefined; },
    confirm: c => { if (!unscoped) return undefined; const got = ids(c.prompt); return { inputs: got, confirmed: [], still_open: got.map(id => ({ ...finding('home', { lens: 'words', what: 'INVENTORY.md screen «profile» is lost' }), id })), regressions: [], summary: 'still open' }; },
  };
  const { result, calls } = await demo({ screens: ['home'], story: { screens: ['home'], file: 'STORY.md' } }, over);
  if (!calls.some(c => /verify:words/.test(c.label))) return 'no words verifier ran';
  return !unscoped && result.gates.demoClean === true ? '' : `unscoped ${unscoped}, gates ${JSON.stringify(result.gates)}`;
});
await test('DI2', 'plan review: a unit for an undrawn screen cites its INVENTORY.md row, a screen unit citing neither is HIGH, and check-anchors accepts the row', async () => {
  const why = [];
  const { calls } = await plan({});
  const writer = calls.find(c => kind(c.schema) === 'write');
  const reviews = calls.filter(c => kind(c.schema) === 'verdict');
  const rule = /does not draw cites its INVENTORY\.md row[\s\S]*a screen unit that cites neither is a HIGH finding/;
  if (!writer || !rule.test(writer.prompt) || !/or, for a screen the demo does not draw, its INVENTORY\.md row/.test(writer.prompt)) why.push('the writer prompt lacks the INVENTORY.md citation rule');
  if (!reviews.length || reviews.some(c => !rule.test(c.prompt))) why.push(`${reviews.filter(c => !rule.test(c.prompt)).length} of ${reviews.length} review prompts lack the rule`);
  const p = path.join(TMP, 'undrawn-unit.md');
  fs.writeFileSync(p, fs.readFileSync(path.join(MINI, 'plan/build-plan.md'), 'utf8').replace('\n\n## Round 1 changes', '\n| U-3 | Settings, not drawn by the demo | `src/app/settings/page.tsx` | — (`INVENTORY.md «settings»`; designed in the preview) | every control and state of the row | S | U-1 |\n\n## Round 1 changes'));
  if (!/U-3 \| Settings, not drawn/.test(fs.readFileSync(p, 'utf8'))) why.push('the fixture plan did not take the undrawn-screen row');
  const r = sh('python3', [path.join(T, 'check-anchors.py'), '--config', 'redesign.json', '--plan', p]);
  if (r.status !== 0) why.push(`check-anchors on a plan with an undrawn-screen unit: exit ${r.status}: ${r.stdout.slice(-200)}`);
  return why.join(' · ');
});
await test('DI3', 'mode redesign step 3 and the round workflow agree: a drawn screen gets a «מצב» phone for every state INVENTORY.md lists', async () => {
  const why = [];
  const step3 = (read('../modes/redesign.md').split('\n').find(l => l.startsWith('3. ')) || '');
  if (!/«מצב» phone for every state INVENTORY\.md lists for that screen/.test(step3)) why.push('modes/redesign.md step 3 does not say every INVENTORY.md state');
  if (/state the journey meets|[Ss]creens and states off the journey/.test(step3)) why.push('modes/redesign.md step 3 still limits states to the journey');
  if (!/one «מצב · …» phone for EVERY state INVENTORY\.md lists for the screen/.test(read('workflows/demo-round.js'))) why.push('demo-round.js BUILD_TASK changed');
  return why.join(' · ');
});
await test('DI4', 'the isolation floor has one home: each file that applies it points to point 5 and carries the no-play line, the four property names appear only in shared/rules.md, and no file keeps a known carve-out (a text lint of exact sentences and a blacklist, not a check of meaning)', async () => {
  const why = [], root = path.join(SK, '..'), home = path.join(root, 'shared', 'rules.md'), files = [];
  const flat = p => fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ');
  const noPlay = /[Nn]obody plays the preview, on any machine, before its check script passes there/;
  const pointer = /shared\/rules\.md`?,? «An app is built once», point 5, says/;
  for (const f of ['SKILL.md', 'modes/setup.md', 'modes/redesign.md', 'redesign/README.md', 'redesign/templates/build-plan.md', 'redesign/templates/START-BUILD.md', 'redesign/workflows/plan-review.js']) {
    const t = flat(path.join(root, f));
    if (!pointer.test(t)) why.push(`${f} lacks the pointer to point 5`);
    if (!noPlay.test(t)) why.push(`${f} lacks the no-play line`);
  }
  if (!noPlay.test(flat(home))) why.push('shared/rules.md lacks the no-play line');
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'examples' && e.name !== 'node_modules') walk(p); } else if (/\.(md|js|mjs)$/.test(e.name) && p !== fileURLToPath(import.meta.url)) files.push(p); } };
  walk(path.join(root, '..'));
  const ws = path.join(root, '..', '..', '..', '..', 'rules', 'working-style.md');
  if (fs.existsSync(ws)) files.push(ws);
  for (const tag of ['**Environment.**', '**Network.**', '**Effects.**', '**Where it runs.**']) {
    const where = files.filter(p => fs.readFileSync(p, 'utf8').includes(tag));
    if (where.length !== 1 || where[0] !== home) why.push(`${tag} is in ${where.map(p => path.relative(root, p)).join(', ') || 'no file'}, not only in shared/rules.md`);
  }
  const carve = /on the machine it runs on until|until both (checks )?pass, the preview is shown only|shown only on this machine|not shown outside (the|this) machine|on the machine it runs on \(localhost/;
  for (const p of files.filter(p => p.endsWith('.md'))) if (carve.test(flat(p))) why.push(`${path.relative(root, p)} keeps a play-before-checks carve-out`);
  return why.join(' · ');
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
  const skill = skillText();
  const retro0 = skill.split('\n').find(l => l.startsWith('0. ') && l.includes('Find the run')) || '';
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
  const skill = skillText();
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
  const skill = routerText(); // Loop position is a hard rule: it must be in the router, not in a mode file
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
  const skill = skillText();
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
await test('REF-1', 'decisions-open.py counts the open rows of a REFERENCE.md (sections and «always there») and ignores its «Differences on purpose» table', async () => {
  const p = path.join(TMP, 'REFERENCE.md');
  const tpl = fs.readFileSync(path.join(SK, 'templates/REFERENCE.md'), 'utf8');
  const closed = tpl.replace(/(\| R-1 \|.*\| )פתוח \|/, '$1הוכרע · תשובה 3 |').replace(/(\| id \| what differs \|[^\n]*\n\|[-|]*\n)/, '$1| R-9 | no film on a phone | his answer | 4 |\n');
  if (closed === tpl) return 'the template no longer has the R-1 row or the differences table this test edits';
  fs.writeFileSync(p, closed);
  const r = sh('python3', [path.join(T, 'decisions-open.py'), p]);
  let out; try { out = JSON.parse(r.stdout); } catch { return `exit ${r.status}: ${r.stdout}`; }
  return r.status === 0 && out.open === 2 && out.rows.join() === 'K-1,R-2' ? '' : `exit ${r.status}: ${r.stdout}`;
});
await test('REF-2', 'reference-coverage.py passes a ledger with no gap and fails on a missing stretch, an overlap, a short end, a row without a stretch and a missing frame', async () => {
  const head = '| id | what | how it moves | measured | needs | frames | מצב |\n|---|---|---|---|---|---|---|\n';
  const row = (id, span) => `| ${id} | ${span} a section | scroll | not measured | none | reference/${id}.png · built/${id}.png | פתוח |\n`;
  const diff = '\n| id | what differs | why | answer |\n|---|---|---|---|\n| R-2 | no film | phone | 4 |\n';
  const run = (name, body, extra = []) => {
    const p = path.join(TMP, name);
    fs.writeFileSync(p, head + body + diff);
    const r = sh('python3', [path.join(T, 'reference-coverage.py'), p, '--total', '10', ...extra]);
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
    return { status: r.status, out, raw: r.stdout };
  };
  const why = [];
  const good = run('ref-good.md', row('R-1', '[0–4.5 s]') + row('R-2', '[4.5–10 s]'));
  if (good.status !== 0 || !good.out || good.out.rows !== 2 || good.out.problems.length) why.push(`good: exit ${good.status} ${good.raw}`);
  const px = run('ref-px.md', row('R-1', '[0–400 px]') + row('R-2', '[400–10 px]'));
  if (px.status !== 1) why.push(`a stretch that ends before it starts passed: ${px.raw}`);
  const cases = [
    ['gap', row('R-1', '[0–4 s]') + row('R-3', '[6–10 s]'), /no row covers 4 to 6/],
    ['overlap', row('R-1', '[0–6 s]') + row('R-2', '[4–10 s]'), /R-2 overlaps/],
    ['short', row('R-1', '[0–4 s]') + row('R-2', '[4–8 s]'), /no row covers 8 to 10 \(the end\)/],
    ['nospan', row('R-1', '[0–10 s]') + row('R-2', ''), /R-2: no \[a–b s\]/],
    ['mixed', row('R-1', '[0–5 s]') + row('R-2', '[5–10 px]'), /mix seconds and pixels/],
  ];
  for (const [name, body, re] of cases) {
    const r = run(`ref-${name}.md`, body);
    if (r.status !== 1 || !r.out || !r.out.problems.some(p => re.test(p))) why.push(`${name}: exit ${r.status} ${r.raw}`);
  }
  const frames = run('ref-frames.md', row('R-1', '[0–10 s]'), ['--frames-dir', TMP]);
  if (frames.status !== 1 || !/reference\/R-1\.png is missing/.test(frames.raw)) why.push(`missing frame: exit ${frames.status} ${frames.raw}`);
  const twice = run('ref-twice.md', row('R-1', '[0–5 s]') + row('R-1', '[5–10 s]'));
  if (twice.status !== 1 || !/R-1: the id appears on two rows/.test(twice.raw)) why.push(`repeated id: exit ${twice.status} ${twice.raw}`);
  const shortRow = run('ref-short.md', row('R-1', '[0–5 s]') + '| R-2 | [5–10 s] a section | scroll |\n');
  if (shortRow.status !== 1 || !/R-2: the row has fewer than 7 cells/.test(shortRow.raw)) why.push(`a row that lost cells: exit ${shortRow.status} ${shortRow.raw}`);
  const nan = sh('python3', [path.join(T, 'reference-coverage.py'), path.join(TMP, 'ref-good.md'), '--total', 'nan']);
  if (nan.status !== 2) why.push(`--total nan: exit ${nan.status}`);
  const usage = sh('python3', [path.join(T, 'reference-coverage.py')]);
  if (usage.status !== 2) why.push(`no arguments: exit ${usage.status}`);
  return why.join(' · ');
});
await test('FACT-1', 'facts-check.py passes pages whose figures are in the facts file and fails on a hand-typed figure, an open value and a placeholder', async () => {
  const dir = path.join(TMP, 'facts');
  fs.mkdirSync(path.join(dir, 'site'), { recursive: true });
  const facts = { _note: 'TBD is fine in a note', fund: { name: 'קרן אורן', grants_total: 1250000, monthly: 3500, founded: 2016 }, people: [{ name: 'דנה לוי', role: 'מנהלת' }], price: '₪89 לחודש' };
  fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(facts));
  const page = body => `<!doctype html><html lang="he" dir="rtl"><head><style>.a{width:1,200px}</style></head><body>${body}<script>var n = "9,999";</script></body></html>`;
  const run = (name, body, f = 'facts.json') => {
    fs.writeFileSync(path.join(dir, 'site', 'index.html'), page(body));
    const r = sh('python3', [path.join(T, 'facts-check.py'), '--facts', path.join(dir, f), path.join(dir, 'site')]);
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
    return { name, status: r.status, out, raw: r.stdout };
  };
  const why = [];
  const good = run('good', '<p>הקרן חילקה 1,250,000 ש"ח מאז 2016, 3,500 ₪ לחודש, מנוי ב-₪89. טלפון 050-1234567. ראו [1] וגם <a href="#">קישור</a>.</p>');
  if (good.status !== 0 || !good.out || good.out.numbers_checked < 3) why.push(`good: exit ${good.status} ${good.raw}`);
  const typed = run('typed', '<p>הקרן חילקה 1,300,000 ש"ח.</p>');
  if (typed.status !== 1 || !/1,300,000 is not in the facts file/.test(typed.raw)) why.push(`hand-typed figure: exit ${typed.status} ${typed.raw}`);
  const money = run('money', '<p>מנוי ב-₪99 לחודש.</p>');
  if (money.status !== 1 || !/the figure 99 is not in the facts file/.test(money.raw)) why.push(`hand-typed price: exit ${money.status} ${money.raw}`);
  const ph = run('placeholder', '<p>שלום [שם הלקוח], lorem ipsum.</p>');
  if (ph.status !== 1 || !ph.out || ph.out.problems.filter(p => /placeholder/.test(p)).length !== 2) why.push(`placeholders: exit ${ph.status} ${ph.raw}`);
  fs.writeFileSync(path.join(dir, 'open.json'), JSON.stringify({ ...facts, fund: { ...facts.fund, address: 'TBD ask Nadav' } }));
  const open = run('open', '<p>1,250,000</p>', 'open.json');
  if (open.status !== 1 || !/open value fund\.address/.test(open.raw)) why.push(`open value: exit ${open.status} ${open.raw}`);
  const ent = run('entities', '<p>900 ש&quot;ח וגם &#8362;750</p>');
  if (ent.status !== 1 || !ent.out || ent.out.problems.filter(p => /the figure (900|750) is not in the facts file/.test(p)).length !== 2) why.push(`figures behind HTML entities: exit ${ent.status} ${ent.raw}`);
  const alt = run('alt', '<img src="a.png" alt="[תיאור התמונה]"><p>arr[i] ו-[0, 1] אינם שדות למילוי</p>');
  if (alt.status !== 1 || !ent.out || alt.out.problems.length !== 1 || !/תיאור התמונה/.test(alt.raw)) why.push(`a placeholder in alt, and code-like brackets: exit ${alt.status} ${alt.raw}`);
  const gone = sh('python3', [path.join(T, 'facts-check.py'), '--facts', path.join(dir, 'facts.json'), path.join(dir, 'no-such-folder')]);
  if (gone.status !== 2) why.push(`a page path that does not exist: exit ${gone.status}`);
  const usage = sh('python3', [path.join(T, 'facts-check.py')]);
  if (usage.status !== 2) why.push(`no arguments: exit ${usage.status}`);
  return why.join(' · ');
});
await test('SPLIT-1', 'rule-accounting.py finds every line of an old SKILL.md in the router or a mode file, and names a line that is gone', async () => {
  const tool = path.join(SK, '..', 'dev', 'rule-accounting.py');
  const dir = path.join(TMP, 'split');
  fs.mkdirSync(path.join(dir, 'modes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# skill\n\n- rule one\n');
  fs.writeFileSync(path.join(dir, 'modes', 'screen.md'), '## Mode `screen`\n\n1. step one\n');
  fs.writeFileSync(path.join(dir, 'shared', 'rules.md'), '- a rule that moved to shared\n');
  const old = path.join(dir, 'old.md');
  const run = (text, extra = []) => {
    fs.writeFileSync(old, text);
    const r = sh('python3', [tool, old, '--skill-dir', dir, ...extra]);
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
    return { status: r.status, out, raw: r.stdout };
  };
  const why = [];
  const all = run('# skill\n\n- rule one\n## Mode `screen`\n1. step one\n- a rule that moved to shared\n');
  if (all.status !== 0 || !all.out || all.out.found !== 5 || all.out.missing.length) why.push(`complete: exit ${all.status} ${all.raw}`);
  const gone = run('# skill\n- rule one\n- a rule nobody moved\n');
  if (gone.status !== 1 || !gone.out || gone.out.missing.length !== 1 || !/nobody moved/.test(gone.out.missing[0].text)) why.push(`a lost rule: exit ${gone.status} ${gone.raw}`);
  fs.writeFileSync(path.join(dir, 'allow.txt'), '# changed on purpose\n- a rule nobody moved\n');
  const ok = run('# skill\n- rule one\n- a rule nobody moved\n', ['--allow', path.join(dir, 'allow.txt')]);
  if (ok.status !== 0 || !ok.out || ok.out.allowed !== 1) why.push(`an allowed change: exit ${ok.status} ${ok.raw}`);
  return why.join(' · ');
});
await test('SHOW-1', 'early-show.sh refuses, without any request, a link that is not https, a vercel.app address, a host that is not his and a claude.ai link that is not an artifact', async () => {
  const run = (url, env = {}) => sh('bash', [path.join(T, 'early-show.sh'), url], { env: { ...process.env, EARLY_SHOW_HOSTS: '', ...env } });
  const why = [];
  const cases = [
    ['http://nadavc.ai/', 1, /not https/],
    ['https://demo-abc.vercel.app/x', 1, /vercel\.app address is never shown/],
    ['https://example.com/', 1, /not one of his domains/],
    ['https://evilnadavc.ai/', 1, /not one of his domains/],
    ['https://claude.ai/chat/abc', 1, /not an artifact address/],
    ['https://claude.ai/artifact/../../evil', 1, /not an artifact address/],
    ['https://claude.ai/artifact/abc', 0, /address checked/],
    // a user part makes curl fetch another host than the one a naive parse reads
    ['https://nadavc.ai:@example.com/', 1, /user part/],
    ['https://x.nadavc.ai:pw@example.com/', 1, /user part/],
    ['https://nadavc.ai@example.com/', 1, /user part/],
    ['https://[::1]/', 1, /strange host/],
  ];
  for (const [url, status, re] of cases) {
    const r = run(url);
    if (r.status !== status || !re.test(r.stdout)) why.push(`${url}: exit ${r.status} ${r.stdout.trim()}`);
  }
  // a vercel.app address stays refused even when someone lists it as his own
  const v = run('https://demo-abc.vercel.app/', { EARLY_SHOW_HOSTS: 'vercel.app demo-abc.vercel.app' });
  if (v.status !== 1) why.push(`vercel.app through EARLY_SHOW_HOSTS: exit ${v.status}`);
  const c = sh('bash', [path.join(T, 'early-show.sh'), 'https://claude.ai/artifact/abc', 'deadbeef'], { env: { ...process.env, EARLY_SHOW_HOSTS: '' } });
  if (c.status !== 0 || !/NOT checked/.test(c.stdout)) why.push(`an artifact with a commit id must say the commit was not checked: exit ${c.status} ${c.stdout.trim()}`);
  const u = sh('bash', [path.join(T, 'early-show.sh')]);
  if (u.status !== 2) why.push(`no arguments: exit ${u.status}`);
  return why.join(' · ');
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

// ---------------- the tour manifest checker (standard/tours/tour-check.mjs) ----------------
// Each fixture is the example manifest with one change, and must fail with that one finding and no other. Its mutant is
// a copy of the checker without the line marked `// M:<code>`: on the same fixture it must pass, so the test shows the
// finding comes from that line.
const TOURS = path.join(SK, '..', 'standard', 'tours');
const TOUR_EX = JSON.parse(fs.readFileSync(path.join(TOURS, 'example', 'tours.json'), 'utf8'));
const INV_EX = JSON.parse(fs.readFileSync(path.join(TOURS, 'example', 'inventory.json'), 'utf8'));
const clone = x => JSON.parse(JSON.stringify(x));
const tourOf = (m, id) => m.tours.find(t => t.id === id);
const offRecord = (i, anchor) => { for (const sc of Object.values(i.screens)) if (sc.recordAnchors) sc.recordAnchors = sc.recordAnchors.filter(a => a !== anchor); };
function tourCheck(man, inv, checker = path.join(TOURS, 'tour-check.mjs'), extra = []) {
  const dir = fs.mkdtempSync(path.join(TMP, 'tours-'));
  fs.writeFileSync(path.join(dir, 'tours.json'), JSON.stringify(man));
  const args = [checker, path.join(dir, 'tours.json'), '--json', ...extra];
  if (inv) { fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(inv)); args.push('--inventory', path.join(dir, 'inventory.json')); }
  const r = sh('node', args);
  let out = null; try { out = JSON.parse(r.stdout); } catch { /* reported by the caller */ }
  return { status: r.status, out, raw: (r.stdout + r.stderr).slice(-400) };
}
function mutant(code) {
  const src = fs.readFileSync(path.join(TOURS, 'tour-check.mjs'), 'utf8').split('\n');
  const keep = src.filter(l => !l.trimEnd().endsWith(`// M:${code}`));
  if (src.length - keep.length !== 1) throw new Error(`the checker has ${src.length - keep.length} lines marked M:${code}, not one`);
  const dir = fs.mkdtempSync(path.join(TMP, `mutant-${code}-`));
  for (const f of ['tours.schema.json', 'inventory.schema.json']) fs.copyFileSync(path.join(TOURS, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'tour-check.mjs'), keep.join('\n'));
  return path.join(dir, 'tour-check.mjs');
}
// [code, check, rule, what the fixture changes, (manifest, inventory) => void]
const TOUR_FIXTURES = [
  ['schema', 'manifest', null, 'a step carries a field the format does not have', m => { tourOf(m, 'book').steps[0].autoClick = true; }],
  ['schema-inventory', 'manifest', null, 'an inventory screen says menu "yes"', (m, i) => { i.screens['cal-day'].menu = 'yes'; }],
  ['duplicate-id', 'manifest', null, 'two tours share an id', m => { m.tours.push(clone(tourOf(m, 'reminder'))); }],
  ['auto-screen', 'manifest', null, 'a tour opens by itself on a screen it does not list', m => { tourOf(m, 'book').auto.push('patients'); }],
  ['practice-kind', 'manifest', null, 'practiceOnly on a stop step', m => { Object.assign(tourOf(m, 'close-1').steps[1], { on: 'sample', practiceOnly: { modeTest: 'a', stopTest: 'b' } }); }],
  ['chapter-set', 'manifest', null, 'a chapter says 2 of 4 while the others say of 3', m => { tourOf(m, 'close-2').chapter = [2, 4]; }],
  ['words', 'tour-shape', 'G-07', 'a step of fourteen words', m => { tourOf(m, 'reminder').steps[2].text = 'משנים כמה שעות לפני התור יוצאת התזכורת, ואפשר לבחור גם יום שלם לפני התור.'; }],
  ['no-skip', 'tour-shape', 'G-07', 'a step that cannot be skipped', m => { tourOf(m, 'book').steps[0].skip = false; }],
  ['do-no-result', 'tour-shape', 'G-16', 'a do step with no result', m => { delete tourOf(m, 'reminder').steps[1].result; }],
  ['chapter-end', 'tour-shape', 'G-07', 'a chapter that ends at a showing step', m => { tourOf(m, 'close-1').steps[1].kind = 'next'; }],
  ['auto-not-core', 'tour-shape', 'G-21', 'a tour opens by itself on a screen that is not core', m => { tourOf(m, 'reminder').auto = ['settings-msgs']; }],
  ['do-class', 'tour-no-commit', 'G-20', 'a do step classed T that is not practice-only', m => { tourOf(m, 'pat-debt').steps[0].class = 'T'; }],
  ['do-class', 'tour-no-commit', 'G-20', 'a practice-only P step that names no stop test', m => { delete tourOf(m, 'close-3').steps[1].practiceOnly.stopTest; }],
  ['do-no-safe-test', 'tour-no-commit', 'G-20', 'at stage app, a do step that names no G-20 test', m => { delete tourOf(m, 'book').steps[1].safeTest; }],
  ['do-class', 'tour-no-commit', 'G-20', 'at stage demo, a do step classed P that is not practice-only', m => { m.stage = 'demo'; tourOf(m, 'pat-debt').steps[0].class = 'P'; }],
  ['need-action', 'tour-no-commit', 'G-08', 'a resume that presses a control', m => { tourOf(m, 'book').steps[3].need.push({ do: 'press', window: 'appt.create' }); }],
  ['start-key', 'tour-no-commit', 'G-08', 'a start that asks to press a control', m => { tourOf(m, 'book').start.press = 'appt.save'; }],
  ['core-count', 'tour-shape', 'G-21', 'six core screens', m => { m.core.push(...['leads', 'chats', 'money', 'forms'].map(id => ({ id, screens: [id] }))); }],
  ['core-count', 'tour-shape', 'G-21', 'one core entry holding six screens that are not views of one screen', m => { m.core = [{ id: 'all', screens: ['cal-week', 'cal-day', 'patients', 'settings-msgs', 'import', 'appt-new', 'reports'] }]; }],
  ['practice-not-sample', 'tour-no-commit', 'G-20', 'a practice-only step that does not run on the sample record', (m, i) => { tourOf(m, 'close-3').steps[1].on = 'none'; offRecord(i, 'appt.paid'); }],
  ['record-not-sample', 'tour-no-commit', 'G-08', 'a do step that opens a record that is not the sample record', m => { Object.assign(tourOf(m, 'close-1').steps[0], { on: 'none', anchor: 'cal.card', result: { kind: 'recordOpen', arg: 'cal.card' } }); }],
  ['do-no-on', 'tour-no-commit', 'G-08', 'a do step that does not say whose record it acts on (the reminder tour\'s row edit)', m => { delete tourOf(m, 'reminder').steps[1].on; }],
  ['do-no-on', 'tour-no-commit', 'G-08', 'the reviewer\'s P1, a do step that opens a debtor\'s charge window, as written (no on), lit through a resolver\'s own id', m => { m.anchors['patients.charge'] = { screens: ['patients'], what: 'חיוב' }; const t = tourOf(m, 'pat-debt'); t.steps[3] = { kind: 'do', act: 'open', when: 'desktop', anchor: 'patients.sample-charge', result: { kind: 'open', arg: 'pay.charge-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "חיוב". נפתח חלון החיוב.' }; t.steps.push({ kind: 'stop', class: 'P', when: 'desktop', anchor: 'pay.charge-confirm', text: '"אישור החיוב" גובה מהכרטיס השמור.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the same P1 at on: none, on the charge button every row carries (a container since the twelfth review)', m => { const t = tourOf(m, 'pat-debt'); t.steps[3] = { kind: 'do', act: 'open', on: 'none', when: 'desktop', anchor: 'patients.charge', result: { kind: 'open', arg: 'pay.charge-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "חיוב". נפתח חלון החיוב.' }; t.steps.push({ kind: 'stop', class: 'P', when: 'desktop', anchor: 'pay.charge-confirm', text: '"אישור החיוב" גובה מהכרטיס השמור.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the fifth review\'s route case: a calendar tour that goes to the patients list and opens a debtor\'s charge window at on: none', m => { m.tours.push({ id: 'cal-to-debt', title: 'מהיומן לגבייה', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'nav.patients', result: { kind: 'route', arg: { is: 'patients' } }, safeTest: 'e2e/x.spec.ts: moving to the list changes nothing', text: 'עוברים לרשימת המטופלים.' }, { kind: 'do', act: 'open', on: 'none', when: 'desktop', anchor: 'patients.charge', result: { kind: 'open', arg: 'pay.charge-sheet' }, safeTest: 'e2e/x.spec.ts: opening the charge window sends nothing', text: 'לוחצים "חיוב". נפתח חלון החיוב.' }, { kind: 'stop', class: 'P', when: 'desktop', anchor: 'pay.charge-confirm', text: '"אישור החיוב" גובה מהכרטיס השמור.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the fifth review\'s empty-screens case: the same charge step in a chapter with screens [], whose job stands on the calendar', m => { for (const id of ['close-1', 'close-2', 'close-3']) tourOf(m, id).chapter[1] = 4; m.tours.push({ id: 'close-4', title: 'לגבות', job: 'close', jobTitle: 'לסגור טיפול', chapter: [4, 4], screens: [], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', when: 'desktop', anchor: 'patients.charge', result: { kind: 'open', arg: 'pay.charge-sheet' }, safeTest: 'e2e/x.spec.ts: opening the charge window sends nothing', text: 'לוחצים "חיוב". נפתח חלון החיוב.' }, { kind: 'stop', class: 'P', when: 'desktop', anchor: 'pay.charge-confirm', text: '"אישור החיוב" גובה מהכרטיס השמור.' }], finish: 'סוף.' }); }],
  ['save-not-sample', 'tour-no-commit', 'G-20', 'the fifth review\'s M1: the reminder save as a do step classed S at on: none, which saves a real clinic rule', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', class: 'S', on: 'none', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: 'e2e/x.spec.ts: saving the rule sends nothing', text: 'לוחצים "שמירה". התזכורות הבאות יוצאות לפי השינוי.' }; }],
  ['screen-unknown', 'tour-inventory', 'G-19', 'the fifth review\'s M2: a tour on three screens, the middle one a screen the inventory does not have', m => { m.tours.push({ id: 'chats', title: 'צ׳אט', screens: ['cal-week', 'msg-chats', 'patients'], area: 'הודעות', where: 'הודעות', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'chats.row', result: { kind: 'present', arg: 'chats.input' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים שיחה מהרשימה.' }, { kind: 'stop', class: 'T', anchor: 'chats.send', text: '"שליחה" שולחת את ההודעה.' }], finish: 'סוף.' }); }],
  ['do-class', 'tour-no-commit', 'G-20', 'the sixth review\'s C2: a practice-only step classed T, with both tests named', m => { tourOf(m, 'close-3').steps[1].class = 'T'; }],
  ['screen-none', 'tour-inventory', 'G-19', 'the sixth review\'s C3: a chat tour with screens [] and no job opens a person\'s chat row at on: none', m => { m.tours.push({ id: 'chat-reply', title: 'צ׳אט', screens: [], area: 'הודעות', where: 'הודעות', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'chats.row', result: { kind: 'present', arg: 'chats.input' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים שיחה מהרשימה.' }, { kind: 'stop', class: 'T', anchor: 'chats.send', text: '"שליחה" שולחת את ההודעה.' }], finish: 'סוף.' }); }],
  ['do-class', 'tour-no-commit', 'G-20', 'the seventh review\'s B1: a practice-only step with both tests and no class (close-3 step 2 with its class deleted)', m => { delete tourOf(m, 'close-3').steps[1].class; }],
  ['do-class', 'tour-no-commit', 'G-20', 'the seventh review\'s D2: a practice-only step with both tests classed S', m => { tourOf(m, 'close-3').steps[1].class = 'S'; }],
  ['do-class', 'tour-no-commit', 'G-20', 'at stage app, a practice-only step that names its stop test and leaves out the mode test', m => { delete tourOf(m, 'close-3').steps[1].practiceOnly.modeTest; }],
  ['screen-none', 'tour-inventory', 'G-19', 'a job whose every chapter lists no screens', m => { m.tours.push({ id: 'chats-1', title: 'צ׳אט', job: 'chats', jobTitle: 'לענות', chapter: [1, 1], screens: [], area: 'הודעות', where: 'הודעות', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'chats.row', result: { kind: 'present', arg: 'chats.input' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים שיחה מהרשימה.' }, { kind: 'stop', class: 'T', anchor: 'chats.send', text: '"שליחה" שולחת את ההודעה.' }], finish: 'סוף.' }); }],
  ['do-no-safe-test', 'tour-no-commit', 'G-20', 'at stage app, a do step classed S on the sample record that names no G-20 test', m => { tourOf(m, 'close-1').steps[1] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'appt.happened', result: { kind: 'present', arg: 'appt.happened-mark' }, need: [{ do: 'reopen', window: 'appt.drawer' }], text: 'לוחצים "התקיים".' }; }],
  ['words', 'tour-shape', 'G-07', 'a showing text of thirteen words, where the step text is short', m => { tourOf(m, 'book').steps[0].showText = 'אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר אחת עשרה שתים עשרה'; }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'the seventh review\'s D9: a do step at on: none lit on the patients list whose result is a debtor\'s charge button', m => { tourOf(m, 'pat-debt').steps[1] = { kind: 'do', act: 'open', on: 'none', anchor: 'patients.list', result: { kind: 'present', arg: 'patients.charge' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים על שורה ברשימה.' }; }],
  ['sample-not-record', 'tour-no-commit', 'G-20', 'the eighth review\'s E9: the reminder save as a do step classed S at on: sample, on a control no recordAnchors lists (a real clinic rule)', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: 'e2e/x.spec.ts: saving the rule sends nothing', text: 'לוחצים "שמירה".' }; }],
  ['sample-not-record', 'tour-no-commit', 'G-08', 'an unclassed do step at on: sample on a settings tab, which is nobody\'s record', m => { tourOf(m, 'reminder').steps[0].on = 'sample'; }],
  ['sample-not-record', 'tour-no-commit', 'G-20', 'a practice-only step at on: sample on a control no recordAnchors lists', m => { tourOf(m, 'close-3').steps[3].anchor = 'pay.month-close'; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'the case that passed: a do step at on: sample on the calendar\'s print, a bulk control', m => { m.tours.push({ id: 'cal-print', title: 'הדפסה', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.print', result: { kind: 'open', arg: 'cal.print-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "הדפסה".' }], finish: 'סוף.' }); }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a do step at on: none on the calendar\'s print', m => { m.tours.push({ id: 'cal-print', title: 'הדפסה', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.print', result: { kind: 'open', arg: 'cal.print-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "הדפסה".' }], finish: 'סוף.' }); }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a do step whose result names the calendar\'s print (the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: 'cal.print' }; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a do step whose result is a changed field of the calendar\'s print (fieldChanged; the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'fieldChanged', arg: 'cal.print' }; }],
  ['anchor-both', 'manifest', null, 'an id listed in both recordAnchors and bulkAnchors', (m, i) => { i.screens['cal-week'].recordAnchors.push('cal.print'); }],
  ['anchor-both', 'manifest', null, 'an id in bulkAnchors of one screen and recordAnchors of another, not the first bulk id', (m, i) => { i.screens['cal-day'].bulkAnchors.push('pay.month-close'); i.screens['appt-new'].recordAnchors.push('pay.month-close'); }],
  ['anchor-both', 'manifest', null, 'an id in both bulkAnchors and containerAnchors', (m, i) => { i.screens['cal-week'].containerAnchors.push('cal.print'); }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'the ninth review\'s B5: a do step classed S at on: sample on the calendar\'s print', m => { m.tours.push({ id: 'b5', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'cal.print', result: { kind: 'open', arg: 'cal.print-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "הדפסה".' }], finish: 'סוף.' }); }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'the ninth review\'s B6: a practice-only P step on a bulk control listed on the second screen', (m, i) => { i.screens['cal-day'].bulkAnchors.push('pay.month-close'); tourOf(m, 'close-3').steps[3].anchor = 'pay.month-close'; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'the ninth review\'s B7: a do step at on: sample whose result (recordOpen) names the calendar\'s print (close-3\'s payment method, after its opener)', m => { tourOf(m, 'close-3').steps[2].result = { kind: 'recordOpen', arg: 'cal.print' }; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'the ninth review\'s B8: a result that names the calendar\'s print with an arg (the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: { anchor: 'cal.print', arg: 'week' } }; }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the ninth review\'s C1: a do step at on: sample lit on the calendar grid, a container', m => { m.tours.push({ id: 'c1', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.grid', result: { kind: 'recordOpen', arg: 'cal.appointment' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים תור ביומן.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'a do step at on: none lit on the calendar grid', m => { m.tours.push({ id: 'c2', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים תור ביומן.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'a do step classed S at on: sample lit on the calendar grid', m => { m.tours.push({ id: 'c3', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים על תור.' }], finish: 'סוף.' }); }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a do step on the calendar\'s print shown on the computer only (when)', m => { m.tours.push({ id: 'b9', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', when: 'desktop', anchor: 'cal.print', result: { kind: 'open', arg: 'cal.print-sheet' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "הדפסה".' }], finish: 'סוף.' }); }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'a do step at on: none whose result names a container (the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: 'cal.grid' }; }],
  ['sample-not-record', 'tour-no-commit', 'G-08', 'a do step at on: sample with act type on a field no recordAnchors lists', m => { tourOf(m, 'reminder').steps[2].on = 'sample'; }],
  ['do-class', 'tour-no-commit', 'G-20', 'a do step classed P, not practice-only, shown on the computer only (when)', m => { tourOf(m, 'close-1').steps.splice(1, 0, { kind: 'do', act: 'open', class: 'P', on: 'sample', when: 'desktop', anchor: 'pay.confirm', result: { kind: 'open', arg: 'pay.sheet' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים "רישום התשלום".' }); }],
  ['record-not-sample', 'tour-no-commit', 'G-08', 'a do step that opens a record that is not the sample\'s, shown on the computer only (when)', m => { Object.assign(tourOf(m, 'close-1').steps[0], { on: 'none', when: 'desktop', anchor: 'cal.card', result: { kind: 'recordOpen', arg: 'cal.card' } }); }],
  ['do-class', 'tour-no-commit', 'G-20', 'at stage demo, a practice-only step with both tests and no class', m => { m.stage = 'demo'; delete tourOf(m, 'close-3').steps[1].class; }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'a do step at on: none whose result is a changed field on a person\'s record (fieldChanged)', m => { tourOf(m, 'reminder').steps[2].result = { kind: 'fieldChanged', arg: 'appt.note' }; }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'a do step at on: none whose result names a record control with an arg ({ anchor, arg }; the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: { anchor: 'appt.service', arg: 'first' } }; }],
  ['words', 'tour-shape', 'G-07', 'a variant text of thirteen words, where the step text is short', m => { tourOf(m, 'book').steps[2].variants[0].text = 'אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר אחת עשרה שתים עשרה'; }],
  ['do-class', 'tour-no-commit', 'G-20', 'a practice-only step with no class and no tests', m => { const s = tourOf(m, 'close-3').steps[1]; delete s.class; s.practiceOnly = {}; s.safeTest = 'e2e/x.spec.ts: y'; }],
  ['view-of', 'tour-shape', 'G-21', 'a viewOf that names a screen the inventory does not have', (m, i) => { i.screens['cal-day'].viewOf = 'ghost'; }],
  ['view-of', 'tour-shape', 'G-21', 'a viewOf that names the key itself', (m, i) => { i.screens['cal-day'].viewOf = 'cal-day'; }],
  ['view-of', 'tour-shape', 'G-21', 'a viewOf that names a screen that is itself a view', (m, i) => { i.screens.import.viewOf = 'cal-day'; }],
  ['view-of', 'tour-shape', 'G-21', 'a view of a screen in another core entry', m => { m.core = [{ id: 'calendar', screens: ['cal-week'] }, { id: 'day', screens: ['cal-day'] }, { id: 'patients', screens: ['patients'] }]; }],
  ['view-of', 'tour-shape', 'G-21', 'a key outside the core whose viewOf names a screen the inventory does not have', (m, i) => { i.screens['appt-new'].viewOf = 'ghost'; }, 'view-phantom'],
  ['start-screen', 'manifest', null, 'a start on a screen the tour does not list', m => { tourOf(m, 'book').start.screen = 'settings-msgs'; }],
  ['chapter-end', 'tour-shape', 'G-07', 'a chapter whose phone run ends at a showing step', m => { const t = tourOf(m, 'close-1'); t.steps.push({ kind: 'next', when: 'phone', anchor: 'appt.note', text: 'בטלפון: כאן עוד משהו.' }, { kind: 'stop', class: 'S', when: 'desktop', anchor: 'appt.note', text: 'במחשב: "סיכום" פותח את הרשומה.' }); }],
  ['article-anchor', 'help-refs', 'G-02, G-19', 'an article on one screen names a control of another screen', (m, i) => { i.screens.patients.tasks[0].anchors.push('cal.print'); }],
  ['article-anchor', 'help-refs', 'G-02, G-19', 'an article names a known control with an arg nothing on its screen uses', (m, i) => { i.screens.patients.tasks[0].anchors[0] = { anchor: 'patients.filter', arg: 'no-such-row' }; }],
  ['task-no-tour', 'tour-inventory', 'G-19', 'an article task with no tour and no reason', (m, i) => { i.screens['cal-day'].tasks.push({ text: 'לבטל תור' }); }],
  ['task-no-tour', 'tour-inventory', 'G-19', 'an extra task with no tour and no reason', m => { m.extraTasks.push({ screen: 'patients', task: 'למחוק מטופל' }); }],
  ['screen-no-tour', 'tour-inventory', 'G-19', 'a menu screen with no tour and no reason', (m, i) => { i.screens.reports = { menu: true, tasks: [] }; }],
  ['article-anchor', 'help-refs', 'G-02, G-19', 'an article names a control nothing knows', (m, i) => { i.screens['cal-day'].tasks[0].anchors = ['cal.no-such-button']; }],
  ['article-tour', 'help-refs', 'G-02, G-19', 'an article names a tour that does not list its task', (m, i) => { i.screens['cal-day'].tasks[0].tour = 'close-1'; }],
  ['article-tour', 'help-refs', 'G-02, G-19', 'an article names a tour that does not exist', (m, i) => { i.screens['cal-day'].tasks[0].tour = 'no-such-tour'; }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the tenth review\'s P: a practice-only step classed P at on: sample lit on the calendar grid, which the inventory lists on cal-day only', (m, i) => { delete i.screens['cal-week'].containerAnchors; m.anchors['appt.paid'] = { screens: ['cal-week'], what: 'שולם' }; tourOf(m, 'close-3').steps[1].anchor = 'cal.grid'; }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the tenth review\'s W: a do step at on: none lit on the calendar grid, shown on the computer only (when)', m => { m.tours.push({ id: 'w', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', when: 'desktop', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים תור.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the tenth review\'s S2: a do step at on: none lit on the calendar grid, which the inventory lists on cal-day (the second screen) only', (m, i) => { delete i.screens['cal-week'].containerAnchors; m.tours.push({ id: 's2', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים תור.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the tenth review\'s S1: a do step at on: none lit on the calendar grid, which the inventory lists on cal-week (the first screen) only', (m, i) => { delete i.screens['cal-day'].containerAnchors; m.tours.push({ id: 's1', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים תור.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the tenth review\'s A: a do step at on: none that picks (act pick) on the calendar grid', m => { m.tours.push({ id: 'a', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'pick', on: 'none', anchor: 'cal.grid', result: { kind: 'open', arg: 'appt.drawer' }, safeTest: 'e2e/x.spec.ts: y', text: 'בוחרים תור.' }], finish: 'סוף.' }); }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'the tenth review\'s R: a do step at on: none whose result names the calendar grid with an arg ({ anchor, arg }; the debt tour\'s filter)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: { anchor: 'cal.grid', arg: 'week' } }; }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the twelfth review\'s R1, its first step: the patient row\'s plain id at on: sample (its only on flipped); the whole chain is TOUR-R1-chain', m => { m.tours.push({ id: 'k2', title: 'x', screens: ['patients'], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'patients.row', result: { kind: 'open', arg: 'patients.card' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים על שורה.' }], finish: 'סוף.' }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the twelfth review\'s K3c-followed-plain-id: the appointment\'s plain id at on: sample, result recordOpen', m => { Object.assign(tourOf(m, 'book').steps[1], { on: 'sample', anchor: 'cal.appointment', result: { kind: 'recordOpen', arg: 'cal.appointment' } }); }],
  ['do-on-container', 'tour-no-commit', 'G-08', 'the twelfth review\'s R2-chain-note-save: close-1 opens the appointment\'s plain id at on: sample, then a do step classed S types a note', m => { const t = tourOf(m, 'close-1'); Object.assign(t.steps[0], { anchor: 'cal.appointment', result: { kind: 'recordOpen', arg: 'cal.appointment' } }); t.steps.splice(1, 0, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים הערה קצרה.' }); }],
  ['none-on-record', 'tour-no-commit', 'G-08', 'a do step at on: none on a control of the sample\'s payment window (pay.method), which recordAnchors lists', m => { tourOf(m, 'close-3').steps[2].on = 'none'; }],
  ['sample-not-opened', 'tour-no-commit', 'G-08', 'the thirteenth review\'s W1: a tour whose first step types a note classed S at on: sample in the appointment drawer, which no step of it opened on her', m => { m.tours.push({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים סיכום לטיפול.' }, { kind: 'stop', class: 'S', anchor: 'appt.happened', text: '"התקיים" מסמן שהטיפול קרה.' }], finish: 'סוף.' }); }],
  ['sample-not-opened', 'tour-no-commit', 'G-08', 'the thirteenth review\'s chat case: a compose field listed in recordAnchors, as sample-not-record says, typed at on: sample with no step that opened her chat', (m, i) => { i.screens.patients.recordAnchors = ['chat.compose']; m.tours.push({ id: 'chat', title: 'x', screens: ['patients'], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'chat.compose', result: { kind: 'fieldChanged', arg: 'chat.compose' }, need: [{ do: 'reopen', window: 'chat.window' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים.' }], finish: 'סוף.' }); }],
  ['sample-not-opened', 'tour-no-commit', 'G-08', 'a step in the sample\'s drawer that runs on both devices after an opener shown on the computer only (it opened her record on the computer, not on the phone)', m => { const t = tourOf(m, 'close-3'); for (const k of [0, 2, 3]) t.steps[k].when = 'desktop'; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a practice-only step on a bulk id that only a screen outside the tour and its job lists (import)', (m, i) => { i.screens.import.bulkAnchors = ['pay.month-close']; tourOf(m, 'close-3').steps[3].anchor = 'pay.month-close'; }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the fourteenth review\'s R1: the opener, then a note classed S that names no need (a resume at the note lights whatever drawer is open)', m => { const n = { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים סיכום.' }; delete n.need; m.tours.push(({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים את התור שהסתיים.' }, n], finish: 'סוף.' })); }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the fourteenth review\'s R2: the example\'s booking tour with the need of its service step removed', m => { delete tourOf(m, 'book').steps[3].need; }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the fifteenth review\'s R4: the opener, then a note whose need is selectSample alone (it picks in the booking window and reopens no drawer)', m => { m.tours.push({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים את התור שהסתיים.' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'selectSample' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים סיכום.' }], finish: 'סוף.' }); }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the booking tour\'s service step shown on the phone only (when), with its need removed', m => { const s = tourOf(m, 'book').steps[3]; s.when = 'phone'; delete s.need; }],
  ['sample-not-opened', 'tour-no-commit', 'G-08', 'the fifteenth review\'s A4, one step: the booking tour\'s window step and service step on the computer only, so the picker, shown on both, fails on the phone', m => { const b = tourOf(m, 'book'); b.steps[1].when = 'desktop'; b.steps[3].when = 'desktop'; }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the sixteenth review\'s P2: the booking tour\'s picker step with its need removed (a skip or a resume at it lights whatever picker is open)', m => { delete tourOf(m, 'book').steps[2].need; }],
  ['sample-no-need', 'tour-no-commit', 'G-08', 'the sixteenth review\'s P1b, one step: the booking tour\'s service step, after the picker, whose need only reopens the window (selectSample dropped)', m => { tourOf(m, 'book').steps[3].need = [{ do: 'reopen', window: 'appt.create' }]; }],
  ['do-on-bulk', 'tour-no-commit', 'G-20', 'a do step whose result names the calendar\'s print, on an open step (the reminder tour\'s row edit)', m => { tourOf(m, 'reminder').steps[1].result = { kind: 'present', arg: 'cal.print' }; }],
  ['sample-not-opened', 'tour-no-commit', 'G-08', 'a note classed S at on: sample after a step at on: none whose custom result names the sample (only a step at on: sample opens her record or picks her)', m => { m.tours.push({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.free-slot', result: { kind: 'custom', arg: 'appt.sample-picked' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים על השעה.' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים סיכום.' }], finish: 'סוף.' }); }],
];
await test('TOUR-0', 'tour-check passes the example manifest clean, with and without the inventory, its bindings cover every id that is not a data-tour anchor, a reopen puts back the sample\'s record, and a resolver of a step marked "sample" selects by the sample\'s id', async () => {
  const why = [];
  const full = tourCheck(TOUR_EX, INV_EX);
  if (full.status !== 0 || !full.out || full.out.findings.length || full.out.tours !== 6) why.push(`with inventory: exit ${full.status} ${full.raw}`);
  const bare = tourCheck(TOUR_EX, null);
  if (bare.status !== 0 || !bare.out || bare.out.findings.length || 'tour-inventory' in bare.out.counts) why.push(`without inventory: exit ${bare.status} ${bare.raw}`);
  const b = (await import(path.join(TOURS, 'example', 'bindings.web.mjs'))).default;
  const steps = TOUR_EX.tours.flatMap(t => t.steps);
  const anchors = new Set(steps.map(s => s.anchor).filter(Boolean));
  const need = [
    ...steps.filter(s => s.result && s.result.kind === 'custom').map(s => ['results', s.result.arg]),
    ...steps.filter(s => s.result && s.result.kind === 'stateEquals').map(s => ['state', s.result.arg.key]),
    ...steps.filter(s => s.result && s.result.kind === 'recordOpen').map(s => ['records', s.result.arg]),
    ...steps.filter(s => s.result && ['open', 'step'].includes(s.result.kind)).map(s => ['windows', s.result.kind === 'open' ? s.result.arg : s.result.arg.window]),
    ...steps.flatMap(s => (s.need || []).filter(n => n.do === 'reopen').map(n => ['windows', n.window])),
    ...steps.flatMap(s => [s.when, ...(s.variants || []).map(v => v.when)]).filter(w => w && w !== 'phone' && w !== 'desktop').map(w => ['conditions', w]),
  ];
  for (const [kind, id] of need) if (!b[kind] || !b[kind][id]) why.push(`bindings.web.mjs has no ${kind} "${id}"`);
  for (const id of Object.keys(b.anchors)) if (!anchors.has(id)) why.push(`bindings.web.mjs resolves "${id}", which no step points at`);
  for (const k of ['route', 'view', 'selectSample']) if (typeof b[k] !== 'function') why.push(`bindings.web.mjs has no ${k}`);
  // a reopen in a tour that opens a person's record puts back the sample's record: a fake app whose last-opened record
  // is a real person's, and every call the binding makes is logged with its arguments
  const SAMPLE = { id: 'sample-appt', sample: true };
  const REAL = { id: 'real-appt', sample: false };
  const fake = log => {
    const node = name => new Proxy(function () {}, {
      get: (t, k) => (typeof k === 'symbol' ? undefined : k === 'sampleEndedNotClosed' ? () => SAMPLE : /^(last|recent|current)$/.test(k) ? REAL : node(`${name}.${k}`)),
      apply: (t, self, args) => { log.push({ name, args }); return node(`${name}()`); },
    });
    return { app: node('app'), $: () => null, $$: () => [] };
  };
  for (const t of TOUR_EX.tours) {
    if (!t.steps.some(st => st.result && st.result.kind === 'recordOpen')) continue;
    for (const w of new Set(t.steps.flatMap(st => (st.need || []).filter(n => n.do === 'reopen').map(n => n.window)))) {
      const log = [];
      b.windows[w].reopen(fake(log));
      const args = log.flatMap(c => c.args);
      if (!args.includes(SAMPLE) || args.includes(REAL)) why.push(`${t.id}: the reopen of ${w} does not put back the sample's record (${JSON.stringify(log.map(c => c.name))})`);
    }
  }
  // a step marked "sample" whose control is a resolver selects by the sample's record id, never by position: every
  // selector the resolver asks for names the sample's id and not the real record's
  const sampled = steps.filter(st => st.on === 'sample' && st.anchor && b.anchors[st.anchor]);
  if (!sampled.length) why.push('no step marked "sample" binds through a resolver, so nothing shows how one selects');
  for (const st of sampled) {
    const asked = [];
    b.anchors[st.anchor]({ ...fake([]), $: q => { asked.push(q); return null; }, $$: q => { asked.push(q); return []; } });
    if (!asked.length || !asked.every(q => q.includes(SAMPLE.id) && !q.includes(REAL.id))) why.push(`the resolver of ${st.anchor} does not select by the sample's record id (${JSON.stringify(asked)})`);
  }
  // a reopen is skipped only when its window is already open on her (isOpen), so every window a need names reports
  // open on the sample's state and closed on a state that shows a real record, has a real person picked, or is a
  // booking she opened herself away from the tour's slot (the example app's invented shape)
  const state = (rec, booking = {}) => ({ $: () => null, $$: () => [], app: { booking: { open: true, atTourSlot: true, patient: rec, ...booking }, drawer: { open: true, record: rec }, pay: { open: true, record: rec }, sheet: { open: true, row: rec === SAMPLE ? 'reminder-before' : 'real-row' } } });
  const states = [['the sample', state(SAMPLE), true], ['nobody picked yet at the tour\'s slot', state(SAMPLE, { patient: null }), true], ['a real record or a real person picked', state(REAL), false], ['a booking she opened away from the tour\'s slot, nobody picked', state(REAL, { atTourSlot: false, patient: null }), false]];
  const needWindows = new Set(steps.flatMap(st => (st.need || []).filter(n => n.do === 'reopen').map(n => n.window)));
  if (needWindows.size < 4) why.push(`only ${needWindows.size} windows named by a need`);
  for (const w of needWindows) for (const [what, x, want] of states) if (b.windows[w].isOpen(x) !== want) why.push(`${w}: isOpen is ${!want} on ${what}`);
  return why.join(' · ');
});
await test('TOUR-usage', 'tour-check exits 2 with no manifest, a missing file, a file that is not JSON and an unknown option, and under --json says so as JSON', async () => {
  const why = [];
  const bad = path.join(TMP, 'tours-bad.json');
  fs.writeFileSync(bad, '{ not json');
  const cases = [[[], 'no manifest'], [[path.join(TMP, 'tours-missing.json')], 'cannot read'], [[bad], 'not JSON'], [[path.join(TOURS, 'example', 'tours.json'), '--strict'], 'unknown option'], [[path.join(TOURS, 'example', 'tours.json'), '--inventory'], 'needs a file']];
  for (const [args, re] of cases) {
    const r = sh('node', [path.join(TOURS, 'tour-check.mjs'), ...args]);
    if (r.status !== 2 || !r.stderr.includes(re)) why.push(`${args.join(' ') || '(none)'}: exit ${r.status} ${r.stderr.trim()}`);
  }
  for (const args of [['--strict', '--json'], ['--json', path.join(TOURS, 'example', 'tours.json'), '--inventory']]) {
    const r = sh('node', [path.join(TOURS, 'tour-check.mjs'), ...args]);
    let o = null; try { o = JSON.parse(r.stdout); } catch { /* reported below */ }
    if (r.status !== 2 || !o || o.ok !== false || !o.error) why.push(`${args.join(' ')}: exit ${r.status} ${r.stdout.trim()} ${r.stderr.trim()}`);
  }
  for (const [file, re] of [[path.join(TMP, 'tours-missing.json'), /cannot read/], [bad, /not JSON/]]) {
    const r = sh('node', [path.join(TOURS, 'tour-check.mjs'), file, '--json']);
    let o = null; try { o = JSON.parse(r.stdout); } catch { /* reported below */ }
    if (r.status !== 2 || !o || o.ok !== false || !re.test(o.error)) why.push(`${path.basename(file)} --json: exit ${r.status} ${r.stdout.trim()}`);
  }
  return why.join(' · ');
});
await test('TOUR-text', 'tour-check prints one line per finding with the check, the rule, the tour and the step, and exits 1', async () => {
  const m = clone(TOUR_EX);
  tourOf(m, 'book').steps[0].skip = false;
  const dir = fs.mkdtempSync(path.join(TMP, 'tours-text-'));
  fs.writeFileSync(path.join(dir, 'tours.json'), JSON.stringify(m));
  const r = sh('node', [path.join(TOURS, 'tour-check.mjs'), path.join(dir, 'tours.json')]);
  const fails = r.stdout.split('\n').filter(l => l.startsWith('FAIL '));
  return r.status === 1 && fails.length === 1 && /^FAIL tour-shape G-07 book step 1: /.test(fails[0]) && /not covered here:/.test(r.stdout) ? '' : `exit ${r.status}: ${r.stdout.slice(0, 400)}`;
});
await test('TOUR-schema', 'tour-check holds the manifest and the inventory to their schema files: kind, class, id form, result arg, chapter, reopen, anchor with arg', async () => {
  const why = [];
  const cases = [
    ['a kind the format does not have', m => { tourOf(m, 'book').steps[0].kind = 'maybe'; }, '/tours/0/steps/0/kind'],
    ['a stop step with no class', m => { delete tourOf(m, 'book').steps[4].class; }, '/tours/0/steps/4'],
    ['an anchor id with no dot', m => { tourOf(m, 'book').steps[0].anchor = 'newbutton'; }, '/tours/0/steps/0/anchor'],
    ['an open result whose arg is not a window id', m => { tourOf(m, 'book').steps[1].result.arg = { window: 'appt.create' }; }, '/tours/0/steps/1/result/arg'],
    ['a route result with neither is nor changed', m => { tourOf(m, 'reminder').steps[0].result.arg = { was: 'x' }; }, '/tours/5/steps/0/result/arg'],
    ['chapter 0', m => { tourOf(m, 'close-1').chapter = [0, 3]; }, '/tours/1/chapter/0'],
    ['a reopen with no window', m => { delete tourOf(m, 'book').steps[2].need[0].window; }, '/tours/0/steps/2/need/0'],
    ['an arg with no anchor', m => { delete tourOf(m, 'pat-debt').steps[0].anchor; }, '/tours/4/steps/0'],
    ['an article anchor object with no arg', (m, i) => { i.screens.patients.tasks[0].anchors[0] = { anchor: 'patients.filter' }; }, 'inventory/screens/patients/tasks/0/anchors/0'],
    ['no stage', m => { delete m.stage; }, '/'],
    ['a stage that is neither demo nor app', m => { m.stage = 'beta'; }, '/stage'],
    ['a safeTest that is only a space', m => { tourOf(m, 'book').steps[1].safeTest = ' '; }, '/tours/0/steps/1/safeTest'],
    ['practice tests that are only spaces', m => { tourOf(m, 'close-3').steps[1].practiceOnly = { modeTest: ' ', stopTest: ' ' }; }, '/tours/3/steps/1/practiceOnly/modeTest'],
    ['an anchors entry without its screens', m => { m.anchors['cal.print'] = 'כפתור ההדפסה'; }, '/anchors/cal.print'],
    ['a start on a record that is not the sample', m => { tourOf(m, 'book').start.record = 'shiran'; }, '/tours/0/start/record'],
    ['a start view per device with one device only', m => { tourOf(m, 'book').start.view = { phone: 'day' }; }, '/tours/0/start/view'],
    ['a start date that is not today', m => { tourOf(m, 'book').start.date = '2026-11-11'; }, '/tours/0/start/date'],
    ['an arg that is a visible label, not a key', m => { tourOf(m, 'pat-debt').steps[0].arg = 'לא שולם'; }, '/tours/4/steps/0/arg'],
    ['a test name that is a zero-width space', m => { tourOf(m, 'book').steps[1].safeTest = '\u200b'; }, '/tours/0/steps/1/safeTest'],
    ['an on that is neither sample nor none', m => { tourOf(m, 'book').steps[1].on = 'real'; }, '/tours/0/steps/1/on'],
  ];
  for (const [what, change, at] of cases) {
    const m = clone(TOUR_EX);
    const inv = clone(INV_EX);
    change(m, inv);
    const r = tourCheck(m, inv);
    const hit = r.out && r.out.findings.some(f => f.check === 'manifest' && /^schema/.test(f.code) && f.path === at);
    if (r.status !== 1 || !hit) why.push(`${what}: exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => [f.code, f.path, f.message]))}`);
  }
  return why.join(' · ');
});
await test('TOUR-paths', 'a chapter whose every run, phone and computer, ends at a stop step passes, though its last unconditional step is a showing one', async () => {
  const m = clone(TOUR_EX);
  const t = tourOf(m, 'close-1');
  const stop = t.steps.pop();
  t.steps.push({ kind: 'next', anchor: 'appt.note', text: 'כאן הסיכום.' }, { ...stop, when: 'phone' }, { ...stop, when: 'desktop' });
  const r = tourCheck(m, INV_EX);
  return r.status === 0 && r.out && !r.out.findings.length ? '' : `exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => [f.code, f.step]))}`;
});
await test('TOUR-words', 'a step of exactly twelve words passes and one of thirteen fails', async () => {
  const twelve = 'אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר אחת-עשרה שתים-עשרה';
  const why = [];
  for (const [text, want] of [[twelve, 0], [`${twelve} שלוש-עשרה`, 1]]) {
    const m = clone(TOUR_EX);
    tourOf(m, 'reminder').steps[2].text = text;
    const r = tourCheck(m, INV_EX);
    const got = r.out ? r.out.findings.map(f => f.code) : [];
    if (r.status !== want || got.join(',') !== (want ? 'words' : '')) why.push(`${text.split(' ').length} words: exit ${r.status} ${JSON.stringify(got)}`);
  }
  return why.join(' · ');
});
await test('TOUR-views', 'core screens count once per screen: six keys of which one is a view pass, fail without the mark, and without the inventory are a note; six entries fail without the inventory too', async () => {
  const why = [];
  const m = clone(TOUR_EX);
  m.core = [{ id: 'calendar', screens: ['cal-week', 'cal-day'] }, ...['patients', 'settings-msgs', 'import', 'appt-new'].map(id => ({ id, screens: [id] }))];
  const ok = tourCheck(m, INV_EX);
  if (ok.status !== 0 || !ok.out || ok.out.findings.length) why.push(`with viewOf: exit ${ok.status} ${JSON.stringify(ok.out && ok.out.findings.map(f => f.code))}`);
  const inv = clone(INV_EX);
  delete inv.screens['cal-day'].viewOf;
  const r = tourCheck(m, inv);
  const got = r.out ? r.out.findings.map(f => f.code) : [];
  if (r.status !== 1 || got.join(',') !== 'core-count') why.push(`without viewOf: exit ${r.status} ${JSON.stringify(got)}`);
  const bare = tourCheck(m, null);
  if (bare.status !== 0 || !bare.out || bare.out.findings.length || !bare.out.notes.some(n => /needs --inventory/.test(n.message))) why.push(`without the inventory: exit ${bare.status} ${JSON.stringify(bare.out && { f: bare.out.findings.map(f => f.code), n: bare.out.notes })}`);
  const six = clone(m);
  six.core.push({ id: 'reports', screens: ['reports'] });
  const s6 = tourCheck(six, null);
  if (s6.status !== 1 || !s6.out || s6.out.findings.map(f => f.code).join(',') !== 'core-count') why.push(`six entries without the inventory: exit ${s6.status} ${JSON.stringify(s6.out && s6.out.findings.map(f => f.code))}`);
  const cyc = clone(INV_EX);
  cyc.screens['cal-week'].viewOf = 'cal-day';
  const c = tourCheck(TOUR_EX, cyc);
  if (c.status !== 1 || !c.out || c.out.findings.map(f => f.code).join(',') !== 'view-of,view-of') why.push(`a cycle: exit ${c.status} ${JSON.stringify(c.out && c.out.findings.map(f => f.code))}`);
  return why.join(' · ');
});
// manifests that must pass, each with the marked line that makes them pass: without it the checker fails them
const TOUR_PASSES = [
  ['walk-skip', 'a chapter whose phone run ends at a do step with a result and whose computer run ends at a stop step', m => { const t = tourOf(m, 'close-1'); const stop = t.steps.pop(); t.steps.push({ kind: 'next', when: 'desktop', anchor: 'appt.note', text: 'במחשב: כאן הסיכום.' }, { ...stop, when: 'desktop' }); }],
  ['walk-stop', 'the same chapter: the computer run stops at its stop step and does not judge the steps before it', m => { const t = tourOf(m, 'close-1'); const stop = t.steps.pop(); t.steps.push({ kind: 'next', when: 'desktop', anchor: 'appt.note', text: 'במחשב: כאן הסיכום.' }, { ...stop, when: 'desktop' }); }],
  ['anchor-args', 'an article names an arg that its anchors entry lists', (m, i) => { m.anchors['cal.print'].args = ['week', 'day']; i.screens['cal-week'].tasks[2].anchors = [{ anchor: 'cal.print', arg: 'week' }]; }],
  ['start-record', 'a start on the sample record', m => { tourOf(m, 'close-1').start = { screen: 'cal-week', record: 'sample', date: 'today' }; }],
  ['sample-opener', 'the example, whose chapters open the sample\'s record (recordOpen) or pick her (custom) before they act in her window, and a chapter whose opener and every step after it are shown on the computer only', m => { for (const st of tourOf(m, 'close-3').steps) st.when = 'desktop'; }],
];
for (const [code, what, change] of TOUR_PASSES) {
  await test(`TOUR-pass-${code}`, `tour-check passes ${what}; without the line M:${code} it fails it`, async () => {
    const m = clone(TOUR_EX);
    const inv = clone(INV_EX);
    change(m, inv);
    const r = tourCheck(m, inv);
    if (r.status !== 0 || !r.out || r.out.findings.length) return `fixture: exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => [f.code, f.step]))}`;
    const mu = tourCheck(m, inv, mutant(code));
    return mu.status === 1 && mu.out && mu.out.findings.length ? '' : `mutant without M:${code}: exit ${mu.status} ${JSON.stringify(mu.out && mu.out.findings.map(f => f.code))}`;
  });
}
await test('TOUR-view-own', 'a core key whose viewOf is a finding counts as a screen of its own: six keys, one a view of a screen in another entry, are six screens; without the line M:view-own they would be five', async () => {
  const m = clone(TOUR_EX);
  m.core = [{ id: 'week', screens: ['cal-week'] }, { id: 'day', screens: ['cal-day', 'patients'] }, ...['settings-msgs', 'import', 'appt-new'].map(id => ({ id, screens: [id] }))];
  const r = tourCheck(m, INV_EX);
  const got = r.out ? r.out.findings.map(f => f.code).join(',') : '';
  if (r.status !== 1 || got !== 'view-of,core-count') return `fixture: exit ${r.status} ${got}`;
  const mu = tourCheck(m, INV_EX, mutant('view-own'));
  const mg = mu.out ? mu.out.findings.map(f => f.code).join(',') : '';
  return mg === 'view-of' ? '' : `mutant without M:view-own: exit ${mu.status} ${mg}`;
});
await test('TOUR-walk', 'a chapter that ends at a stop step only under a condition fails at the showing step before it, which ends the run when the condition does not hold', async () => {
  const m = clone(TOUR_EX);
  const t = tourOf(m, 'close-1');
  const stop = t.steps.pop();
  t.steps.push({ kind: 'next', anchor: 'appt.note', text: 'כאן הסיכום.' }, { ...stop, when: 'appt.has-note' });
  const r = tourCheck(m, INV_EX);
  const got = r.out ? r.out.findings.map(f => `${f.code}@${f.step}`) : [];
  return r.status === 1 && got.join(',') === 'chapter-end@2' ? '' : `exit ${r.status} ${JSON.stringify(got)}`;
});
await test('TOUR-kinds', 'a do step that opens a person\'s record without on: sample fails, and one that opens a rule\'s window (open) passes', async () => {
  const why = [];
  const m = clone(TOUR_EX);
  tourOf(m, 'reminder').steps[1].result = { kind: 'open', arg: 'settings.rule-window' };
  const ok = tourCheck(m, INV_EX);
  if (ok.status !== 0 || !ok.out || ok.out.findings.length) why.push(`open on a rule: exit ${ok.status} ${JSON.stringify(ok.out && ok.out.findings.map(f => f.code))}`);
  const p = clone(TOUR_EX);
  Object.assign(tourOf(p, 'close-2').steps[0], { on: 'none', anchor: 'cal.card', result: { kind: 'recordOpen', arg: 'cal.card' } });
  const bad = tourCheck(p, INV_EX);
  if (bad.status !== 1 || !bad.out || bad.out.findings.map(f => f.code).join(',') !== 'record-not-sample') why.push(`recordOpen without on: exit ${bad.status} ${JSON.stringify(bad.out && bad.out.findings.map(f => f.code))}`);
  return why.join(' · ');
});
await test('TOUR-malformed', 'a tour or a step that is not an object, or a manifest that is not an object, exits 2 with the reason, as JSON under --json', async () => {
  const why = [];
  const cases = [['a null tour', m => { m.tours.push(null); }], ['a null step', m => { tourOf(m, 'book').steps.push(null); }], ['steps that are not a list', m => { tourOf(m, 'book').steps = 'x'; }], ['a manifest that is a list', () => []]];
  for (const [what, change] of cases) {
    const m = clone(TOUR_EX);
    const out = change(m) || m;
    const r = tourCheck(out, INV_EX);
    if (r.status !== 2 || !r.out || r.out.ok !== false || !r.out.error) why.push(`${what}: exit ${r.status} ${r.raw}`);
  }
  const dir = fs.mkdtempSync(path.join(TMP, 'tours-null-'));
  fs.writeFileSync(path.join(dir, 'tours.json'), JSON.stringify({ ...TOUR_EX, tours: [null] }));
  const t = sh('node', [path.join(TOURS, 'tour-check.mjs'), path.join(dir, 'tours.json')]);
  if (t.status !== 2 || !/tour 1 is not an object/.test(t.stderr) || /at file:/.test(t.stderr)) why.push(`text mode: exit ${t.status} ${t.stderr.trim()}`);
  return why.join(' · ');
});
await test('TOUR-demo-practice', 'at stage demo a practice-only step may name no tests: one note, no finding; at stage app the same step is do-class; without the line M:demo-practice the note is gone', async () => {
  const why = [];
  const m = clone(TOUR_EX);
  m.stage = 'demo';
  tourOf(m, 'close-3').steps[1].practiceOnly = {};
  const note = '1 practice-only steps name no mode test or stop test yet; each needs both before the app runs this tour';
  const r = tourCheck(m, INV_EX);
  if (r.status !== 0 || !r.out || r.out.findings.length || !r.out.notes.some(n => n.message === note)) why.push(`demo: exit ${r.status} ${JSON.stringify(r.out && { f: r.out.findings.map(f => f.code), n: r.out.notes })}`);
  const a = clone(m);
  a.stage = 'app';
  const ra = tourCheck(a, INV_EX);
  if (ra.status !== 1 || !ra.out || ra.out.findings.map(f => f.code).join(',') !== 'do-class') why.push(`app: exit ${ra.status} ${JSON.stringify(ra.out && ra.out.findings.map(f => f.code))}`);
  const mu = tourCheck(m, INV_EX, mutant('demo-practice'));
  if (!mu.out || mu.out.notes.some(n => n.message === note)) why.push('mutant without M:demo-practice still prints the note');
  return why.join(' · ');
});
await test('TOUR-none-no-inventory', 'without --inventory every do step of the example is counted in a note, since the three lists are not read; with it there is no such note; without the line M:none-no-inventory the note is gone', async () => {
  const why = [];
  const n = TOUR_EX.tours.flatMap(t => t.steps).filter(s => s.kind === 'do').length;
  const note = `${n} do steps were not judged against the inventory (recordAnchors, bulkAnchors, containerAnchors: none-on-record, sample-not-record, sample-not-opened, sample-no-need, do-on-bulk, do-on-container): that needs --inventory`;
  const r = tourCheck(TOUR_EX, null);
  if (r.status !== 0 || !r.out || !r.out.notes.some(x => x.message === note)) why.push(`no inventory: exit ${r.status} ${JSON.stringify(r.out && r.out.notes)}`);
  const w = tourCheck(TOUR_EX, INV_EX);
  if (!w.out || w.out.notes.some(x => /recordAnchors/.test(x.message))) why.push('with --inventory the note is still printed');
  const mu = tourCheck(TOUR_EX, null, mutant('none-no-inventory'));
  if (!mu.out || mu.out.notes.some(x => x.message === note)) why.push('mutant without M:none-no-inventory still prints the note');
  return why.join(' · ');
});
await test('TOUR-container-resolver', 'the same do step as the ninth review\'s C1, lit on the sample\'s own appointment through the resolver instead of the grid, passes', async () => {
  const m = clone(TOUR_EX);
  m.tours.push({ id: 'c1', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: 'e2e/x.spec.ts: y', text: 'פותחים את התור של נועה לדוגמה.' }], finish: 'סוף.' });
  const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
  return r.status === 0 && r.out && !r.out.findings.length ? '' : `exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => f.code))}`;
});
await test('TOUR-bulk-show', 'a showing step and a stop step on a bulk control (cal.print) pass: only a do step on one is a finding', async () => {
  const m = clone(TOUR_EX);
  m.tours.push({ id: 'cal-print', title: 'הדפסה', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'next', anchor: 'cal.print', text: 'כאן מדפיסים את היומן.' }, { kind: 'stop', class: 'T', anchor: 'cal.print', text: '"הדפסה" מוציאה את תורי כולם.' }], finish: 'סוף.' });
  const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
  return r.status === 0 && r.out && !r.out.findings.length ? '' : `exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => f.code))}`;
});
await test('TOUR-container-show', 'the tenth review\'s N: a showing step and a stop step lit on the calendar grid (a container) pass: only a do step lit on one is a finding', async () => {
  const m = clone(TOUR_EX);
  m.tours.push({ id: 'n', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'next', anchor: 'cal.grid', text: 'זה היומן.' }, { kind: 'stop', class: 'S', anchor: 'cal.grid', text: 'גרירה ביומן מזיזה תור.' }], finish: 'סוף.' });
  const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
  return r.status === 0 && r.out && !r.out.findings.length ? '' : `exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => f.code))}`;
});
await test('TOUR-R1-chain', 'the twelfth review\'s R1 whole: the patient row\'s plain id at on: sample, then a note classed S on the card, fails do-on-container on the row and sample-not-opened on the note, and each line alone catches its step', async () => {
  const m = clone(TOUR_EX);
  const inv = clone(INV_EX);
  inv.screens.patients.recordAnchors = ['patients.card-note'];
  m.tours.push({ id: 'k2', title: 'x', screens: ['patients'], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'patients.row', result: { kind: 'open', arg: 'patients.card' }, safeTest: 'e2e/x.spec.ts: y', text: 'לוחצים על שורה.' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'patients.card-note', result: { kind: 'fieldChanged', arg: 'patients.card-note' }, need: [{ do: 'reopen', window: 'patients.card' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים הערה.' }], finish: 'סוף.' });
  const got = c => { const r = tourCheck(m, inv, c); return r.out ? r.out.findings.map(f => `${f.code}@${f.step}`).join(',') : `exit ${r.status}`; };
  const why = [];
  if (got() !== 'do-on-container@1,sample-not-opened@2') why.push(`checker: ${got()}`);
  if (got(mutant('do-on-container')) !== 'sample-not-opened@2') why.push(`without M:do-on-container: ${got(mutant('do-on-container'))}`);
  if (got(mutant('sample-not-opened')) !== 'do-on-container@1') why.push(`without M:sample-not-opened: ${got(mutant('sample-not-opened'))}`);
  return why.join(' · ');
});
await test('TOUR-P1-picker', 'the thirteenth review\'s P1: the picker with a present result instead of the custom one, then a do step classed S on appt.save, fails sample-not-opened on the picker, the service and the save and nothing else; without the line M:sample-not-opened it passes', async () => {
  const m = clone(TOUR_EX);
  const t = tourOf(m, 'book');
  t.steps[2].result = { kind: 'present', arg: 'appt.service' };
  delete t.steps[2].variants;
  t.steps[4] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'appt.save', result: { kind: 'present', arg: 'cal.ended-appointment' }, need: [{ do: 'reopen', window: 'appt.create' }, { do: 'selectSample' }], safeTest: 'e2e/x.spec.ts: y', text: 'שומרים את התור.' };
  const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
  const got = r.out ? r.out.findings.map(f => `${f.code}@${f.step}`).join(',') : `exit ${r.status}`;
  if (r.status !== 1 || got !== 'sample-not-opened@3,sample-not-opened@4,sample-not-opened@5') return `checker: ${got}`;
  const mu = tourCheck(m, INV_EX, mutant('sample-not-opened'), ['--require-stage', 'app']);
  return mu.status === 0 ? '' : `without M:sample-not-opened: exit ${mu.status} ${JSON.stringify(mu.out && mu.out.findings.map(f => f.code))}`;
});
// the fourteenth review's B1: a step is the opener only by its shape, never by its result kind alone. Each case below
// passed on 8e12319 and saves on whichever window is open; each fails sample-not-opened (and, with no need, sample-no-need)
await test('TOUR-opener-shapes', 'a custom or recordOpen result does not make a step the opener by its kind alone: H1 (the note with a custom result), H1b (recordOpen naming another control), H1c (a chat field with a custom result), H2 (an earlier custom pick on a payment control), H8 (the picker classed S), H13 (a practice-only step with a custom result) each fail; the picker counts only after a do step at on: "none" with an open or step result, only as a pick, and a next step between them does not matter; a recordOpen at on: "none" opens nothing; an object-form recordOpen arg is a schema finding and does not open her record either; the picker counts only on the devices its window step surely ran on (A4, A5); and without the line M:sample-not-opened only their sample-no-need findings remain', async () => {
  const ST = 'e2e/x.spec.ts: y';
  const note = extra => ({ ...{ kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: 'e2e/x.spec.ts: y', text: 'כותבים סיכום.' }, ...extra });
  const summary = steps => ({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: steps, finish: 'סוף.' });
  const cases = [
    ['H1', m => { m.tours.push(summary([note({ result: { kind: 'custom', arg: 'appt.note-saved' } }), { kind: 'stop', class: 'S', anchor: 'appt.happened', text: '"התקיים".' }])); }, 'sample-not-opened@summary:1'],
    ['H1b', m => { m.tours.push(summary([note({ result: { kind: 'recordOpen', arg: 'cal.ended-appointment' } })])); }, 'sample-not-opened@summary:1'],
    ['H1c', (m, i) => { i.screens.patients.recordAnchors = ['chat.compose']; m.tours.push({ id: 'chat', title: 'x', screens: ['patients'], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'chat.compose', result: { kind: 'custom', arg: 'chat.draft-saved' }, safeTest: ST, text: 'כותבים.' }], finish: 'סוף.' }); }, 'sample-not-opened@chat:1,sample-no-need@chat:1'],
    ['H2', m => { m.tours.push(summary([{ kind: 'do', act: 'pick', on: 'sample', anchor: 'pay.method', arg: 'cash', result: { kind: 'custom', arg: 'pay.method-shown' }, safeTest: ST, text: 'בוחרים מזומן.' }, note({})])); }, 'sample-not-opened@summary:1,sample-no-need@summary:1,sample-not-opened@summary:2'],
    ['H8', m => { tourOf(m, 'book').steps[2].class = 'S'; }, 'sample-not-opened@book:3,sample-not-opened@book:4'],
    ['H13', m => { m.tours.push(summary([{ kind: 'do', act: 'open', class: 'P', on: 'sample', anchor: 'pay.confirm', result: { kind: 'custom', arg: 'pay.receipt-shown' }, practiceOnly: { modeTest: 'a', stopTest: 'b' }, safeTest: ST, text: 'x.' }])); }, 'sample-not-opened@summary:1,sample-no-need@summary:1'],
    ['the step before the picker at on: "sample"', m => { tourOf(m, 'book').steps[1].on = 'sample'; }, 'sample-not-record@book:2,sample-not-opened@book:3,sample-not-opened@book:4'],
    ['the step before the picker with a present result', m => { tourOf(m, 'book').steps[1].result = { kind: 'present', arg: 'appt.create' }; }, 'sample-not-opened@book:3,sample-not-opened@book:4'],
    ['the picker with act select', m => { tourOf(m, 'book').steps[2].act = 'select'; }, 'sample-not-opened@book:3,sample-not-opened@book:4'],
    ['a next step between the window and the picker (passes)', m => { tourOf(m, 'book').steps.splice(2, 0, { kind: 'next', anchor: 'appt.patient-picker', text: 'כאן בוחרים מטופל.' }); }, ''],
    ['her record opened at on: "none" (recordOpen naming its own control)', m => { tourOf(m, 'close-3').steps[0].on = 'none'; }, 'none-on-record@close-3:1,record-not-sample@close-3:1,sample-not-opened@close-3:2,sample-not-opened@close-3:3,sample-not-opened@close-3:4'],
    ['H1b with the object form of the arg (its anchor names another control; the schema allows a recordOpen arg only as a plain id, and the order check still fires)', m => { m.tours.push(summary([note({ result: { kind: 'recordOpen', arg: { anchor: 'cal.ended-appointment', arg: 'x' } } })])); }, 'schema@summary:1,sample-not-opened@summary:1'],
    ['A4: the window step before the picker on the computer only (the picker and the service step fail on the phone)', m => { tourOf(m, 'book').steps[1].when = 'desktop'; }, 'sample-not-opened@book:3,sample-not-opened@book:4'],
    ['A5: the window step before the picker under a condition (the picker and the service step fail)', m => { tourOf(m, 'book').steps[1].when = 'settings.msgs-closed'; }, 'sample-not-opened@book:3,sample-not-opened@book:4'],
    ['P1: a do step classed S on the booking\'s save after the service step, both naming reopen and selectSample (passes: the engine runs selectSample each time, and isOpen holds only for the tour\'s own booking whose person field holds the sample or is empty; the bindings, TOUR-0)', m => { tourOf(m, 'book').steps[4] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'appt.save', result: { kind: 'custom', arg: 'appt.saved' }, need: [{ do: 'reopen', window: 'appt.create' }, { do: 'selectSample' }], safeTest: ST, text: 'שומרים את התור לנועה לדוגמה.' }; }, ''],
    ['P1b: the same with each need holding only the reopen', m => { const b = tourOf(m, 'book'); b.steps[3].need = [{ do: 'reopen', window: 'appt.create' }]; b.steps[4] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'appt.save', result: { kind: 'custom', arg: 'appt.saved' }, need: [{ do: 'reopen', window: 'appt.create' }], safeTest: ST, text: 'שומרים את התור.' }; }, 'sample-no-need@book:4,sample-no-need@book:5'],
    ['P3: the picker after a step that opened another window (passes: stated, NOT_COVERED, the reviewer checks the step opened the picker\'s own window)', m => { tourOf(m, 'book').steps[1] = { kind: 'do', act: 'open', on: 'none', anchor: 'cal.filters', result: { kind: 'open', arg: 'cal.filter-panel' }, safeTest: ST, text: 'פותחים את המסננים.' }; }, ''],
    ['a recordOpen opener after the picker: the steps after it need no selectSample', m => { const b = tourOf(m, 'book'); b.steps.splice(4, 0, { kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: ST, text: 'פותחים את התור.' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: ST, text: 'כותבים סיכום.' }); }, ''],
    ['after a picker on the computer only, a step shown on both devices still names selectSample', m => { const b = tourOf(m, 'book'); b.steps[1].when = 'desktop'; b.steps[3].need = [{ do: 'reopen', window: 'appt.create' }]; }, 'sample-not-opened@book:3,sample-not-opened@book:4,sample-no-need@book:4'],
    ['a second picker after the first, its own need only the reopen (passes: the picker itself names no selectSample)', m => { const b = tourOf(m, 'book'); b.steps.splice(4, 0, clone(b.steps[1]), clone(b.steps[2])); }, ''],
    ['a picker shown on the phone only does not ask selectSample of a step shown on the computer only after an earlier opener (passes)', m => { const b = tourOf(m, 'book'); m.tours.push({ id: 'mixed', title: 'x', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], finish: 'סוף.', steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: ST, text: 'פותחים את התור.' }, clone(b.steps[1]), { ...clone(b.steps[2]), when: 'phone' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', when: 'desktop', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: ST, text: 'כותבים סיכום.' }] }); }, ''],
    ['the window step and the picker both on the computer only (passes)', m => { const b = tourOf(m, 'book'); for (const k of [1, 2, 3]) b.steps[k].when = 'desktop'; }, ''],
  ];
  const why = [];
  for (const [name, change, want] of cases) {
    const m = clone(TOUR_EX);
    const inv = clone(INV_EX);
    change(m, inv);
    const got = c => { const r = tourCheck(m, inv, c, ['--require-stage', 'app']); return r.out ? r.out.findings.map(f => `${f.code}@${f.tour}:${f.step}`).join(',') : `exit ${r.status}`; };
    const g = got();
    if (g !== want) why.push(`${name}: ${g}`);
    const mu = got(mutant('sample-not-opened'));
    const rest = want.split(',').filter(x => !x.startsWith('sample-not-opened@')).join(',');
    if (mu !== rest) why.push(`${name} without M:sample-not-opened: ${mu}`);
  }
  return why.join(' · ');
});
// the need rule is text for the engine and the bindings, which the checker cannot see: its key sentences are pinned in
// each place that states it, so a later edit cannot quietly drop the per-reopen isOpen, the picker's window or selectSample
await test('TOUR-need-texts', 'the need rule\'s sentences (a reopen skipped only when its window is open on her, a window that picks a person open only while it is the tour\'s own and each of its person fields holds the sample or is empty, selectSample always run, and selectSample named after the picker) stand in help-system.md, both schemas (on and need) and experience.md', async () => {
  const why = [];
  const norm = t => t.replace(/`/g, '').replace(/\s+/g, ' ');
  const read = f => norm(fs.readFileSync(path.join(TOURS, f), 'utf8'));
  const RUNS = "each time the run reaches the step: a reopen is skipped only when its window is already open on her (isOpen; a window that picks a person counts as open only while it is the tour's own and every person field it has (a second person, such as a family member or a referrer, included) holds the sample or is empty), and selectSample always runs, asking first when she picked someone since";
  const NAMES = "names a need that reopens the window its control sits in, and a step after the picker names selectSample as well (the picker's own step names the reopen too)";
  const pins = [
    ['../help-system.md', RUNS, 1], ['../help-system.md', NAMES, 1], ['../help-system.md', 'how the run selects the sample record again (selectSample)', 1],
    ['tours.schema.json', RUNS, 2], ['tours.schema.json', NAMES, 2],
    ['inventory.schema.json', RUNS, 1], ['inventory.schema.json', NAMES, 1],
    ['../experience.md', RUNS, 1], ['../experience.md', 'names no need that reopens a window (the window its control sits in, and after the picker selectSample as well;', 1],
  ];
  for (const [f, text, n] of pins) { const got = read(f).split(text).length - 1; if (got < n) why.push(`${f}: "${text.slice(0, 60)}…" ${got} times, not ${n}`); }
  return why.join(' · ');
});
await test('TOUR-save-stop-message', 'the tenth review\'s K5d and the eleventh\'s N1: the reminder save at on: sample with no class fails sample-not-record only, and with no on do-no-on only; each message, like the S and the practice-only one, says a save of a business-wide setting is a stop step, so following it ends at the example\'s own stop step', async () => {
  const why = [];
  const snr = 'a save there (a business-wide setting) is a stop step, never a do step';
  const dno = 'a save of a business-wide setting, including a switch or a field that saves as it changes, is a stop step, never a do step';
  const save = { kind: 'do', act: 'open', on: 'sample', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: 'e2e/x.spec.ts: saving the rule sends nothing', text: 'לוחצים "שמירה".' };
  const cases = [
    ['no class (K5d)', m => { tourOf(m, 'reminder').steps[3] = { ...save }; }, 'sample-not-record', snr],
    ['classed S (K5)', m => { tourOf(m, 'reminder').steps[3] = { ...save, class: 'S' }; }, 'sample-not-record', snr],
    ['practice-only', m => { tourOf(m, 'close-3').steps[3].anchor = 'pay.month-close'; }, 'sample-not-record', snr],
    ['no class and no on (N1)', m => { const s = { ...save }; delete s.on; tourOf(m, 'reminder').steps[3] = s; }, 'do-no-on', dno],
  ];
  for (const [what, change, code, clause] of cases) {
    const m = clone(TOUR_EX);
    change(m);
    const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
    const f = r.out ? r.out.findings : [];
    if (r.status !== 1 || f.length !== 1 || f[0].code !== code || !f[0].message.includes(clause)) why.push(`${what}: exit ${r.status} ${JSON.stringify(f.map(x => [x.code, x.message]))}`);
  }
  // the step the clause leads to is the example's own: the reminder save as a stop step classed S, which passes
  const stop = tourOf(TOUR_EX, 'reminder').steps[3];
  if (stop.kind !== 'stop' || stop.anchor !== 'settings.save') why.push(`the example's reminder step 4 is no longer the stop step on settings.save (${JSON.stringify(stop)})`);
  return why.join(' · ');
});
// Every finding kind of tour-check, and each branch of its message, with the message word for word; NOT_COVERED and the
// app-stage usage error word for word too. A message is what an author follows literally, so its wording is behaviour.
// A test that a clause is present lets a reversal through (", except at on: none" appended, "you may ignore this: "
// put in front); equality turns any edit red. A changed message is a deliberate update of this table, a fresh run of
// the follow-the-message cases, and a reviewer reading the new sentence: equality pins the words, only a person judges
// what they mean. [label, change, ('no-inventory'), code, message]
const ST = 'e2e/x.spec.ts: y';
const GOLDEN = [
    ['schema', m => { tourOf(m, 'book').steps[0].autoClick = true; }, "schema", "/tours/0/steps/0: \"autoClick\" is not a field of this format"],
    ['schema-inventory', (m, i) => { i.screens['cal-day'].menu = 'yes'; }, "schema-inventory", "inventory /screens/cal-day/menu: should be boolean"],
    ['anchor-both', (m, i) => { i.screens['cal-week'].recordAnchors.push('cal.print'); }, "anchor-both", "\"cal.print\" is in recordAnchors and bulkAnchors of the inventory: a control is one person's, many people's at once, or a container of people's rows, never two of these; an id every row of a list carries is a container, and only a resolver's own id or a control in a window opened on her is in recordAnchors"],
    ['duplicate-id', m => { m.tours.push(clone(tourOf(m, 'reminder'))); }, "duplicate-id", "tour id \"reminder\" is used twice; a start by id reaches only the first"],
    ['auto-screen', m => { tourOf(m, 'book').auto.push('patients'); }, "auto-screen", "opens by itself on \"patients\", which is not one of its screens"],
    ['start-screen', m => { tourOf(m, 'book').start.screen = 'settings-msgs'; }, "start-screen", "starts on \"settings-msgs\", which is not one of its screens"],
    ['practice-kind', m => { Object.assign(tourOf(m, 'close-1').steps[1], { on: 'sample', practiceOnly: { modeTest: 'a', stopTest: 'b' } }); }, "practice-kind", "practiceOnly is for a do step (this one is \"stop\")"],
    ['chapter-set', m => { tourOf(m, 'close-2').chapter = [2, 4]; }, "chapter-set", "job \"close\": its chapters disagree on how many there are (3, 4)"],
    ['stage-required', m => { m.stage = 'demo'; }, "stage-required", "the manifest is at stage \"demo\", and this run requires \"app\""],
    ['view-of (itself)', (m, i) => { i.screens['cal-day'].viewOf = 'cal-day'; }, "view-of", "viewOf names the key itself; a key is a view only of another screen of the inventory that is not a view, in the same core entry"],
    ['view-of (phantom)', (m, i) => { i.screens['cal-day'].viewOf = 'ghost'; }, "view-of", "viewOf names \"ghost\", which the inventory does not have; a key is a view only of another screen of the inventory that is not a view, in the same core entry"],
    ['view-of (a view)', (m, i) => { i.screens.import.viewOf = 'cal-day'; }, "view-of", "viewOf names \"cal-day\", which is itself a view of \"cal-week\"; a key is a view only of another screen of the inventory that is not a view, in the same core entry"],
    ['view-of (another core entry)', m => { m.core = [{ id: 'calendar', screens: ['cal-week'] }, { id: 'day', screens: ['cal-day'] }, { id: 'patients', screens: ['patients'] }]; }, "view-of", "viewOf names \"cal-week\", which is not in the same core entry as \"cal-day\"; a key is a view only of another screen of the inventory that is not a view, in the same core entry"],
    ['core-count (inventory)', m => { m.core.push(...['leads', 'chats', 'money', 'forms'].map(id => ({ id, screens: [id] }))); }, "core-count", "6 core screens (cal-week, patients, leads, chats, money, forms), at most five; keys of one core entry count as one screen only where inventory.json marks them viewOf it"],
    ['core-count (no inventory)', m => { m.core.push(...['leads', 'chats', 'money', 'forms'].map(id => ({ id, screens: [id] }))); }, 'no-inventory', "core-count", "6 core entries, so more than five core screens"],
    ['words', m => { tourOf(m, 'reminder').steps[2].text = 'אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר אחת עשרה שתים עשרה'; }, "words", "text has 14 words, at most 12: the fix is two steps, never a trimmed one"],
    ['no-skip', m => { tourOf(m, 'book').steps[0].skip = false; }, "no-skip", "the step cannot be skipped; every step can be"],
    ['do-no-result', m => { delete tourOf(m, 'reminder').steps[1].result; }, "do-no-result", "a do step with no result condition: it moves on only when the screen shows the result it names"],
    ['chapter-end', m => { tourOf(m, 'close-1').steps[1].kind = 'next'; }, "chapter-end", "chapter 1 of 3 can end at this \"next\" step, neither at a result nor at a stop step"],
    ['auto-not-core', m => { tourOf(m, 'reminder').auto = ['settings-msgs']; }, "auto-not-core", "opens by itself on \"settings-msgs\", which is not a core screen"],
    ['do-class (T, practice-only)', m => { tourOf(m, 'close-3').steps[1].class = 'T'; }, "do-class", "a do step classed T tells a real person: it is a stop step, in practice mode too (the mode is for a numbered document, a payment and a close for good, classed P)"],
    ['do-class (practice-only, no class)', m => { delete tourOf(m, 'close-3').steps[1].class; }, "do-class", "a practice-only do step with no class: practice mode is only for a numbered document, a payment and a close for good: if it issues a numbered document, takes a payment or closes for good, class it P and keep it practice-only; only any other do step that tells no one drops practiceOnly and names its G-20 safeTest"],
    ['do-class (practice-only, classed S)', m => { tourOf(m, 'close-3').steps[1].class = 'S'; }, "do-class", "a practice-only do step classed S: practice mode is only for a numbered document, a payment and a close for good: if it issues a numbered document, takes a payment or closes for good, class it P and keep it practice-only; only any other do step that tells no one drops practiceOnly and names its G-20 safeTest"],
    ['do-class (practice-only, a test missing)', m => { delete tourOf(m, 'close-3').steps[1].practiceOnly.modeTest; }, "do-class", "a practice-only do step without modeTest: it is a stop step in the mode too"],
    ['do-class (T, not practice-only)', m => { tourOf(m, 'pat-debt').steps[0].class = 'T'; }, "do-class", "a do step classed T is not practice-only: it is a stop step"],
    ['do-class (P, not practice-only)', m => { tourOf(m, 'pat-debt').steps[0].class = 'P'; }, "do-class", "a do step classed P is not practice-only: it is a stop step"],
    ['do-no-on (N1)', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: ST, text: 'לוחצים "שמירה".' }; }, "do-no-on", "a do step that does not say whose record it acts on: on: \"sample\", or on: \"none\" when it acts on no person's record (an empty slot, a filter, a settings tab, a field in a settings form that has its own save); a save of a business-wide setting, including a switch or a field that saves as it changes, is a stop step, never a do step"],
    ['none-on-record (anchor)', m => { tourOf(m, 'close-3').steps[2].on = 'none'; }, "none-on-record", "a do step with on: \"none\" on \"pay.method\", which the inventory lists as a control of the sample's record (recordAnchors); the step is at on: \"sample\", and on a row in a list it is lit through a resolver's own id that picks the sample's row (as cal.ended-appointment), never the row's plain id, which binds the first visible row"],
    ['none-on-record (result, K1)', m => { tourOf(m, 'pat-debt').steps[1] = { kind: 'do', act: 'open', on: 'none', anchor: 'patients.list', result: { kind: 'present', arg: 'patients.charge' }, safeTest: ST, text: 'לוחצים על שורה ברשימה.' }; }, "none-on-record", "a do step with on: \"none\" whose result names a control the inventory lists in recordAnchors, or a container (a list of people's rows, or an id every row carries), so its lit target reaches a person's record; for a step that filters a list or opens a window, name the state (stateEquals) or the window (open) as the result, not a control inside it, and name a window only when it is nobody's (a menu, a filter panel); a list of people, and the plain id every row in it carries, go in containerAnchors, and the step lights the sample's own row at on: \"sample\" through a resolver's own id"],
    ['save-not-sample', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', class: 'S', on: 'none', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: ST, text: 'לוחצים "שמירה".' }; }, "save-not-sample", "a do step classed S (it saves) that does not carry on: \"sample\": a save done in a tour is done on the sample's record, on a control that record carries; saving a business-wide rule or a real person's record is a stop step"],
    ['do-on-bulk (anchor)', m => { m.tours.push({ id: 'cal-print', title: 'הדפסה', screens: ['cal-week'], area: 'יומן', where: 'יומן', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'none', anchor: 'cal.print', result: { kind: 'open', arg: 'cal.print-sheet' }, safeTest: ST, text: 'לוחצים "הדפסה".' }], finish: 'סוף.' }); }, "do-on-bulk", "a do step on \"cal.print\", which the inventory lists in bulkAnchors (an export, a print, a download or share, an import, or an action on many people's records at once): a tour never does one, whatever its on and its class; it shows that control or stops at it (a stop step there is classed T); for a step that opens a menu or a window, name the window (open) as the result, not a control inside it"],
    ['do-on-bulk (result)', m => { tourOf(m, 'pat-debt').steps[0].result = { kind: 'present', arg: 'cal.print' }; }, "do-on-bulk", "a do step whose result names \"cal.print\", which the inventory lists in bulkAnchors (an export, a print, a download or share, an import, or an action on many people's records at once): a tour never does one, whatever its on and its class; it shows that control or stops at it (a stop step there is classed T); for a step that opens a menu or a window, name the window (open) as the result, not a control inside it"],
    ['do-on-container (K3c)', m => { tourOf(m, 'book').steps[1].anchor = 'cal.grid'; }, "do-on-container", "a do step lit on \"cal.grid\", which the inventory lists in containerAnchors (a list, a column, the calendar grid, or an id every row of a list carries): the lit target of a do step is live, so she could press any person's row inside it, or the first visible row, whatever its on and its class; light the sample's own row or control at on: \"sample\", through a resolver that picks it and is listed in recordAnchors (its own id, as cal.ended-appointment, never the plain id every row carries, which binds the first visible row), or, for an empty slot, the slot through a resolver (cal.free-slot) at on: \"none\""],
    ['sample-not-record (no class, K5d)', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', on: 'sample', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: ST, text: 'לוחצים "שמירה".' }; }, "sample-not-record", "a do step at on: \"sample\" on \"settings.save\", which no recordAnchors lists. If it sits in a window opened on her (a step before it in the tour opened it on her), list it in recordAnchors and keep on: \"sample\"; if it sits on her row in a list, light it through a resolver's own id that picks her row and list that id; only a control that is nobody's record (a tab, a filter, a business-wide setting) changes the step, to on: \"none\", and a save there (a business-wide setting) is a stop step, never a do step; never answer this finding by setting on: \"none\" on a person's control"],
    ['sample-not-record (classed S, K5)', m => { tourOf(m, 'reminder').steps[3] = { kind: 'do', act: 'open', class: 'S', on: 'sample', anchor: 'settings.save', result: { kind: 'present', arg: 'settings.saved-toast' }, safeTest: ST, text: 'לוחצים "שמירה".' }; }, "sample-not-record", "a do step at on: \"sample\" on \"settings.save\", which no recordAnchors lists. If it sits in a window opened on her (a step before it in the tour opened it on her), list it in recordAnchors and keep on: \"sample\"; if it sits on her row in a list, light it through a resolver's own id that picks her row and list that id; only a control that is nobody's record (a tab, a filter, a business-wide setting) changes the step, to on: \"none\", and a save there (a business-wide setting) is a stop step, never a do step; never answer this finding by setting on: \"none\" on a person's control"],
    ['sample-not-record (practice-only)', m => { tourOf(m, 'close-3').steps[3].anchor = 'pay.month-close'; }, "sample-not-record", "a do step at on: \"sample\" on \"pay.month-close\", which no recordAnchors lists. If it sits in a window opened on her (a step before it in the tour opened it on her), list it in recordAnchors and keep on: \"sample\"; if it sits on her row in a list, light it through a resolver's own id that picks her row and list that id; only a control that is nobody's record (a tab, a filter, a business-wide setting) changes the step, to on: \"none\", and a save there (a business-wide setting) is a stop step, never a do step; never answer this finding by setting on: \"none\" on a person's control; a practice-only step stays on the sample's copy"],
    ['practice-not-sample', (m, i) => { tourOf(m, 'close-3').steps[1].on = 'none'; offRecord(i, 'appt.paid'); }, "practice-not-sample", "a practice-only step without on: \"sample\": inside the mode the tour runs on the sample record's copy, never on a real person's"],
    ['record-not-sample (N3a)', m => { m.tours.push({ id: 'find', title: 'x', screens: ['patients'], area: 'מטופלים', where: 'מטופלים', tasks: [], steps: [{ kind: 'do', act: 'type', on: 'none', anchor: 'patients.search', result: { kind: 'recordOpen', arg: 'patients.row' }, safeTest: ST, text: 'מקלידים "נועה" בחיפוש.' }], finish: 'סוף.' }); }, "record-not-sample", "a do step opens a person's record (recordOpen) and does not carry on: \"sample\": tours run on the sample record, never on real data; if the control is nobody's (a search, a button that opens a list), split the step: it filters or opens at on: \"none\" with a stateEquals or open result (a window that is nobody's), and the next step lights the sample's own row at on: \"sample\" through a resolver, with the recordOpen result, or is a stop step"],
    ['sample-not-opened (both devices, W1)', m => { m.tours.push({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: ST, text: 'כותבים סיכום.' }], finish: 'סוף.' }); }, "sample-not-opened", "a do step at on: \"sample\" on \"appt.note\" with no earlier step in this tour that opened the sample's record (a do step at on: \"sample\" whose recordOpen result names its own control, a resolver's own id) or picked her (an unclassed pick step, after the step at on: \"none\" that opened its window on that device, under no other condition, whose custom result checks the sample was picked): a control in a window acts on whichever record that window shows, a real person's when the tour starts over it; put the step that opens her record or picks her before this one, or, when this step itself opens her record through a resolver's own id, give it the recordOpen result that names that id"],
    ['sample-not-opened (one device)', m => { const t = tourOf(m, 'close-3'); for (const k of [0, 2, 3]) t.steps[k].when = 'desktop'; t.steps[1].when = 'phone'; }, "sample-not-opened", "a do step at on: \"sample\" on \"appt.paid\" with no earlier step in this tour that opened the sample's record (a do step at on: \"sample\" whose recordOpen result names its own control, a resolver's own id) or picked her (an unclassed pick step, after the step at on: \"none\" that opened its window on that device, under no other condition, whose custom result checks the sample was picked), on the phone: a control in a window acts on whichever record that window shows, a real person's when the tour starts over it; put the step that opens her record or picks her before this one, or, when this step itself opens her record through a resolver's own id, give it the recordOpen result that names that id"],
    ['sample-no-need (R4, selectSample alone)', m => { m.tours.push({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: ST, text: 'פותחים את התור שהסתיים.' }, { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'selectSample' }], safeTest: ST, text: 'כותבים סיכום.' }], finish: 'סוף.' }); }, "sample-no-need", "a do step at on: \"sample\" on \"appt.note\" that names no need that reopens a window: a resume or a skip reaches it without the step that opened her record, or after she opened another record at an earlier step, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen), adding selectSample where that window picks a person; the engine runs that need each time it reaches the step: a reopen only when its window is not open on her, and selectSample always"],
    ['sample-not-opened (the picker, one device: A4)', m => { const b = tourOf(m, 'book'); b.steps[1].when = 'desktop'; b.steps[3].when = 'desktop'; }, "sample-not-opened", "a do step at on: \"sample\" on \"appt.patient-picker\" with no earlier step in this tour that opened the sample's record (a do step at on: \"sample\" whose recordOpen result names its own control, a resolver's own id) or picked her (an unclassed pick step, after the step at on: \"none\" that opened its window on that device, under no other condition, whose custom result checks the sample was picked), on the phone: a control in a window acts on whichever record that window shows, a real person's when the tour starts over it; put the step that opens her record or picks her before this one, or, when this step itself opens her record through a resolver's own id, give it the recordOpen result that names that id"],
    ['sample-no-need (the picker itself: P2)', m => { delete tourOf(m, 'book').steps[2].need; }, "sample-no-need", "a do step at on: \"sample\" on \"appt.patient-picker\" that names no need that reopens a window: a resume or a skip reaches it without the step that opened its window, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen), adding selectSample where that window picks a person; the engine runs that need each time it reaches the step: a reopen only when its window is not open on her, and selectSample always"],
    ['sample-no-need (after the picker: P1b)', m => { tourOf(m, 'book').steps[3].need = [{ do: 'reopen', window: 'appt.create' }]; }, "sample-no-need", "a do step at on: \"sample\" on \"appt.service\" that names no need that reopens a window and selects the sample again: a resume or a skip reaches it without the step that opened her record, or after she opened another record at an earlier step, or after she picked another person in the picker's window, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen), and selectSample, as every step after the picker does; the engine runs that need each time it reaches the step: a reopen only when its window is not open on her, and selectSample always"],
    ['sample-no-need (R1)',m => { const n = { kind: 'do', act: 'type', class: 'S', on: 'sample', anchor: 'appt.note', result: { kind: 'fieldChanged', arg: 'appt.note' }, need: [{ do: 'reopen', window: 'appt.drawer' }], safeTest: ST, text: 'כותבים סיכום.' }; delete n.need; m.tours.push(({ id: 'summary', title: 'סיכום', screens: ['cal-week'], area: 'יומן', where: 'יומן · חלון התור', tasks: [], steps: [{ kind: 'do', act: 'open', on: 'sample', anchor: 'cal.ended-appointment', result: { kind: 'recordOpen', arg: 'cal.ended-appointment' }, safeTest: ST, text: 'פותחים את התור שהסתיים.' }, n], finish: 'סוף.' })); }, "sample-no-need", "a do step at on: \"sample\" on \"appt.note\" that names no need that reopens a window: a resume or a skip reaches it without the step that opened her record, or after she opened another record at an earlier step, and it then acts in whatever window is open, a real person's if she opened one; name the window its control sits in (reopen), adding selectSample where that window picks a person; the engine runs that need each time it reaches the step: a reopen only when its window is not open on her, and selectSample always"],
    ['need-action', m => { tourOf(m, 'book').steps[3].need.push({ do: 'press', window: 'appt.create' }); }, "need-action", "the resume action \"press\" is not one of the two a tour does by itself (reopen a window, select the sample record again)"],
    ['start-key', m => { tourOf(m, 'book').start.press = 'appt.save'; }, "start-key", "start asks for \"press\"; a tour that starts only goes to its screen and the sample record, sets the view and the date, and closes a window that holds no unsaved input"],
    ['do-no-safe-test', m => { delete tourOf(m, 'book').steps[1].safeTest; }, "do-no-safe-test", "a do step names no test of G-20 (safeTest, or the practice mode's modeTest): it is a stop step"],
    ['screen-none', m => { m.tours.push({ id: 'chat-reply', title: 'צ׳אט', screens: [], area: 'הודעות', where: 'הודעות', tasks: [], steps: [{ kind: 'stop', class: 'T', anchor: 'chats.send', text: '"שליחה" שולחת את ההודעה.' }], finish: 'סוף.' }); }, "screen-none", "names no screen, nor does its job: where it stands, and so its articles, tasks and recordAnchors, cannot be judged"],
    ['screen-unknown', m => { m.tours.push({ id: 'chats', title: 'צ׳אט', screens: ['msg-chats'], area: 'הודעות', where: 'הודעות', tasks: [], steps: [{ kind: 'stop', class: 'T', anchor: 'chats.send', text: '"שליחה" שולחת את ההודעה.' }], finish: 'סוף.' }); }, "screen-unknown", "stands on \"msg-chats\", which the inventory does not have: its articles, tasks and recordAnchors cannot be judged"],
    ['screen-no-tour', (m, i) => { i.screens.reports = { menu: true, tasks: [] }; }, "screen-no-tour", "the menu reaches this screen, and it has no tour and no written reason"],
    ['task-no-tour', (m, i) => { i.screens['cal-day'].tasks.push({ text: 'לבטל תור' }); }, "task-no-tour", "\"לבטל תור\" has no tour and no written reason"],
    ['article-anchor', (m, i) => { i.screens['cal-day'].tasks[0].anchors = ['cal.no-such-button']; }, "article-anchor", "the article on cal-day names the control \"cal.no-such-button\", which no tour on cal-day points at or names as a result and no anchors entry for cal-day lists"],
    ['article-tour (does not list the task)', (m, i) => { i.screens['cal-day'].tasks[0].tour = 'close-1'; }, "article-tour", "the article names tour \"close-1\", which does not list \"לקבוע תור\" on cal-day"],
    ['article-tour (no such tour)', (m, i) => { i.screens['cal-day'].tasks[0].tour = 'no-such-tour'; }, "article-tour", "the article names tour \"no-such-tour\", which does not exist"],
];
const GOLDEN_NOT_COVERED = [
    "tour-no-commit: the engine itself dispatching a click, a submit or a key on a step target (the running app)",
    "tour-no-commit: that a tour's start does only what its `start` says, and asks before closing a window that holds unsaved input (the running app)",
    "tour-no-commit: whether a step's class is right (a numbered document, a payment and a close for good are always P, a send is T, a save is S); the manifest's class is taken as written, so a save or a send written as an unclassed do step passes (the reviewer; at on: \"sample\" also the step's safeTest, which performs the action on the sample record; at on: \"none\" no test reaches a business-wide save, so an unclassed one there, or one on a switch or a field that saves as it changes, passes and only the reviewer stops it); a practice-only step is always classed P, so an unclassed do step always names a safeTest; a stop step on a bulk control is classed T, and its class is not read either",
    "tour-no-commit: a step classed P that also tells someone (a practice receipt that is also sent) carries one class, P; that its mode test also shows the message is held is the project's suite's (the checker reads one class)",
    "tour-no-commit: that the practice mode's test covers every outbound path (no document number; no documents, payment or messaging provider; no calendar or webhook call): the test is named, not read",
    "tour-shape: a device run left empty, every step of a tour marked for the other device (the reviewer)",
    "tour-shape: two tours that open by themselves on one core screen, or a later chapter that opens by itself (the reviewer)",
    "tour-no-commit: a step sentence that says nothing goes out, or that no one is told, where no test shows it (the reviewer, against the G-20 test or the practice mode's test)",
    "tour-no-commit: an inventory that declares no recordAnchors, or too few, leaves on: \"none\" unjudged with no note (the running app)",
    "tour-inventory: a result that routes to a screen the inventory does not have (only the screens a tour lists are read)",
    "tour-no-commit: that a do step at on: \"sample\" on a control recordAnchors lists changes only the sample's record (a save that also changes a business-wide rule): the running app (tour-anchors); the checker requires only that the control is a record control, and the step's safeTest shows that nothing leaves, not what changed",
    "tour-no-commit: a stop step followed by a step that depends on that control having been pressed (the manifest does not record what a control opens)",
    "tour-no-commit: that the named tests exist and pass (the project's own suite)",
    "tour-no-commit: without --inventory, none-on-record, sample-not-record, sample-not-opened, sample-no-need, do-on-bulk, do-on-container and anchor-both: the three lists are in the inventory (the run notes how many do steps it did not judge)",
    "tour-no-commit: an anchor family whose members differ (one exports or sits on a person's record, another only shows): a listed id covers every arg of its family, so a member that was not given its own id passes; such a control gets its own id (the reviewer)",
    "tour-no-commit: that a step marked on: \"sample\" really reaches the sample's record and no other (the bindings, in the running app: they select by the sample's record id, never the first visible row, or, inside a window opened on her, bind the window's own control); that the earlier opener opened the window the step's control sits in, that the step's need reopens that window, and that no step between them left it or opened another record (the reviewer); only the flag, and whether the control is one recordAnchors lists, are read, and recordAnchors holds only ids that resolve to the sample's record (a resolver's own id, a control in a window opened on her), while an id every row of a list carries is in containerAnchors; such an id listed in recordAnchors by mistake passes (the reviewer, and tour-anchors in the running app)",
    "tour-shape: that a key marked viewOf really is a view of that screen (the reviewer)",
    "tour-no-commit: that a need of reopen puts back the tour's own record, the sample's, and not the last one open, that a window opened on one person counts as open (isOpen) only while it shows the sample's record, and that the engine runs a step's need each time it reaches the step, not only after a resume or a skip: a reopen is skipped only when its window is already open on her (isOpen; a window that picks a person counts as open only while it is the tour's own and every person field it has (a second person, such as a family member or a referrer, included) holds the sample or is empty), and selectSample always runs, asking first when she picked someone since; and that while a window is open on her no second window of the same kind, open on someone else, holds the step's control where the binding finds it first (the bindings and the engine, in the running app; the reviewer of the bindings checks isOpen against every person field a window has; the suite checks only the example's bindings)",
    "tour-anchors: every anchor (the anchors entries and the articles' too), result, condition, window and state id resolving on its screen, and a step marked on: \"sample\" resolving to the sample's record and no other (the running app)",
    "tour-shape: whether a chapter break sits at a real result (the reviewer)",
    "tour-anchors: a showing or stop step whose lit control responds; a test of the built engine presses the lit control of a stop step and shows that nothing happens (the running app)",
    "tour-no-commit: that the inventory's three lists are complete: recordAnchors every id that resolves to the sample's record (a resolver's own id, a control in a window opened on her), bulkAnchors every control that acts on many people's records at once, containerAnchors every element that holds people's rows and every id each row carries; an unlisted one lets the step pass (the running app)",
    "tour-no-commit: that what a step at on: \"none\" lands on through its result, a window (open), a wizard window (step), a screen (route or view) or a custom result, is nobody's (a menu, a filter panel), never a person's page, card or window: the manifest does not record whose it is (the reviewer)",
    "tour-no-commit: that a person picker's step has a result that checks the sample was picked (a custom result, as appt.sample-picked), that picking saves and sends nothing by itself, and that no do step on that window's other controls comes before it, and that the step before it opened the picker's own window: the reviewer, and the bindings; the checker takes an unclassed pick step with a custom result, after a step at on: \"none\" that opened a window on the same device under no other condition, as that picker",
    "tour-no-commit: that a step the checker takes as the opener through a recordOpen result naming its own control is a resolver's own id (a key of the bindings' anchors and records, which select by the sample's record id), never a control inside a window (the reviewer, against the bindings)",
];
await test('TOUR-message-steers', 'the twelfth review\'s B2: every finding kind of tour-check, each branch of its message, fails alone with its message word for word; every code the checker can emit has a row; NOT_COVERED and the app-stage usage error are word for word', async () => {
  const why = [];
  for (const [label, change, ...rest] of GOLDEN) {
    const [code, message] = rest.slice(-2);
    const noInv = rest.length === 3;
    const m = clone(TOUR_EX);
    const inv = noInv ? null : clone(INV_EX);
    change(m, inv);
    const r = tourCheck(m, inv, undefined, noInv ? [] : ['--require-stage', 'app']);
    const f = r.out ? r.out.findings : [];
    if (r.status !== 1 || f.length !== 1 || f[0].code !== code) { why.push(`${label}: exit ${r.status} ${JSON.stringify(f.map(x => x.code))}`); continue; }
    if (f[0].message !== message) why.push(`${label}: the message is now ${JSON.stringify(f[0].message)}`);
  }
  // every code an add() in the checker can emit has a row above, so no kind is left out when one is added
  const src = fs.readFileSync(path.join(TOURS, 'tour-check.mjs'), 'utf8');
  const codes = new Set([...src.matchAll(/\badd\(\s*['"`][a-z-]+['"`],[\s\S]*?,\s*['"`]([a-z0-9-]+)['"`]\s*,/g)].map(x => x[1]));
  // every finding goes through add(): the name add appears ADD_REFS times (its definition and each call, any shape:
  // other quotes, a digit in a code, split over lines, an alias, add.call), findings is written twice (its declaration and
  // the push inside add), and the whole checker file hashes to CHECKER_HASH (a helper a message interpolates, such as
  // named or missing, and the text output's loc, steer an author as much as a message does). A new finding, a new branch of
  // an existing message, a new write to findings, or any other edit of the checker turns this red until the table, the
  // count and the hash are updated on purpose, after a reviewer has read the change
  const ADD_REFS = 40;
  const CHECKER_HASH = 'd0521a608d59e60e004ec9bd2c4be2ee933a44760ef1ec7b9b7cb5edf4ed7e73';
  const refs = (src.match(/\badd\b/g) || []).length;
  if (refs !== ADD_REFS) why.push(`the checker names add ${refs} times, not ${ADD_REFS}: a finding was added, removed or aliased without its row`);
  const pushes = (src.match(/\bfindings\s*(\.\s*(push|unshift|splice|pop|shift|fill|copyWithin|reverse|sort)\s*\(|\.\s*length\s*=[^=]|\[|=[^=>])/g) || []).length;
  if (pushes !== 2) why.push(`findings is written ${pushes} times, not twice (its declaration and the push inside add): a finding bypasses add() or one is removed`);
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(src).digest('hex');
  if (hash !== CHECKER_HASH) why.push(`the checker hashes to ${hash}, not ${CHECKER_HASH}: it changed; read the change, then update GOLDEN, ADD_REFS and CHECKER_HASH`);
  const rows = new Set(GOLDEN.map(e => e[e.length - 2]));
  for (const c of codes) if (!rows.has(c)) why.push(`no GOLDEN row for the finding "${c}"`);
  if (codes.size < 34) why.push(`only ${codes.size} finding codes read from the checker`);
  const ex = tourCheck(TOUR_EX, INV_EX);
  if (!ex.out || JSON.stringify(ex.out.notCovered) !== JSON.stringify(GOLDEN_NOT_COVERED)) why.push(`NOT_COVERED differs: ${JSON.stringify(ex.out && ex.out.notCovered.filter(x => !GOLDEN_NOT_COVERED.includes(x)))} / missing ${JSON.stringify(GOLDEN_NOT_COVERED.filter(x => !(ex.out && ex.out.notCovered.includes(x))))}`);
  const u = tourCheck(TOUR_EX, null, undefined, ['--require-stage', 'app']);
  if (u.status !== 2 || !u.out || u.out.error !== "--require-stage app needs --inventory: the app's check judges every do step against recordAnchors, bulkAnchors and containerAnchors and runs tour-inventory and help-refs, and none of that runs without it") why.push(`the app-stage usage error is now ${JSON.stringify(u.out && u.out.error)}`);
  return why.join(' · ');
});
await test('TOUR-stage', 'with --require-stage app the example passes and a manifest at demo fails with stage-required only; without its line it passes; another value is a usage error, and so is app without --inventory (without that line it passes)', async () => {
  const why = [];
  const ok = tourCheck(TOUR_EX, INV_EX, undefined, ['--require-stage', 'app']);
  if (ok.status !== 0 || !ok.out || ok.out.findings.length) why.push(`example: exit ${ok.status}`);
  const m = clone(TOUR_EX);
  m.stage = 'demo';
  const r = tourCheck(m, INV_EX, undefined, ['--require-stage', 'app']);
  if (r.status !== 1 || !r.out || r.out.findings.map(f => f.code).join(',') !== 'stage-required') why.push(`demo: exit ${r.status} ${JSON.stringify(r.out && r.out.findings.map(f => f.code))}`);
  const mu = tourCheck(m, INV_EX, mutant('stage-required'), ['--require-stage', 'app']);
  if (mu.status !== 0) why.push(`mutant without M:stage-required: exit ${mu.status}`);
  const u = sh('node', [path.join(TOURS, 'tour-check.mjs'), path.join(TOURS, 'example', 'tours.json'), '--require-stage', 'beta']);
  if (u.status !== 2) why.push(`--require-stage beta: exit ${u.status}`);
  // the app's check without --inventory is a usage error, never a pass; without its line it would pass
  const ni = tourCheck(TOUR_EX, null, undefined, ['--require-stage', 'app']);
  if (ni.status !== 2 || !ni.out || ni.out.ok !== false || !/--require-stage app needs --inventory/.test(ni.out.error)) why.push(`--require-stage app without --inventory, --json: exit ${ni.status} ${ni.raw}`);
  const nt = sh('node', [path.join(TOURS, 'tour-check.mjs'), path.join(TOURS, 'example', 'tours.json'), '--require-stage', 'app']);
  if (nt.status !== 2 || !/--require-stage app needs --inventory/.test(nt.stderr)) why.push(`--require-stage app without --inventory, text: exit ${nt.status} ${nt.stderr.trim()}`);
  const nim = tourCheck(TOUR_EX, null, mutant('stage-app-inventory'), ['--require-stage', 'app']);
  if (nim.status !== 0) why.push(`mutant without M:stage-app-inventory: exit ${nim.status}`);
  const nd = tourCheck(TOUR_EX, null, undefined, ['--require-stage', 'demo']);
  if (nd.status !== 1 || !nd.out || nd.out.findings.map(x => x.code).join(',') !== 'stage-required') why.push(`--require-stage demo without --inventory: exit ${nd.status}`);
  return why.join(' · ');
});
await test('TOUR-demo','at stage demo, do steps that name no G-20 test are one note with their count, not findings; without the stage line they are findings', async () => {
  const m = clone(TOUR_EX);
  m.stage = 'demo';
  delete tourOf(m, 'book').steps[1].safeTest;
  delete tourOf(m, 'reminder').steps[2].safeTest;
  const r = tourCheck(m, INV_EX);
  const note = '2 do steps name no G-20 test; each needs one before the app runs this tour';
  if (r.status !== 0 || !r.out || r.out.findings.length || !r.out.notes.some(n => n.check === 'tour-no-commit' && n.message === note)) return `fixture: exit ${r.status} ${JSON.stringify(r.out && { f: r.out.findings.map(f => f.code), n: r.out.notes })}`;
  const mu = tourCheck(m, INV_EX, mutant('demo-stage'));
  const got = mu.out ? mu.out.findings.map(f => f.code) : [];
  if (mu.status !== 1 || got.join(',') !== 'do-no-safe-test,do-no-safe-test') return `mutant without M:demo-stage: exit ${mu.status} ${JSON.stringify(got)}`;
  return '';
});
for (const [n, [code, check, rule, what, change, marker = code]] of TOUR_FIXTURES.entries()) {
  await test(`TOUR-${n + 1}`, `tour-check: ${what} fails ${check} (${code}) and nothing else; without the line M:${marker} the checker passes it`, async () => {
    const m = clone(TOUR_EX);
    const inv = clone(INV_EX);
    change(m, inv);
    const r = tourCheck(m, inv);
    const got = r.out ? r.out.findings.map(f => `${f.check}/${f.code}/${f.rule}`) : [];
    if (r.status !== 1 || got.length !== 1 || got[0] !== `${check}/${code}/${rule}`) return `fixture: exit ${r.status}, findings ${JSON.stringify(got)} ${r.out ? '' : r.raw}`;
    const mu = tourCheck(m, inv, mutant(marker));
    if (mu.status !== 0 || !mu.out || mu.out.findings.length) return `mutant without M:${marker}: exit ${mu.status}, findings ${JSON.stringify(mu.out && mu.out.findings.map(f => f.code))} ${mu.out ? '' : mu.raw}`;
    return '';
  });
}

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

const report = results.map(r => `${r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(8)} ${r.name}${r.ok && !r.skip ? '' : `\n         ${r.why}`}`);
const failed = results.filter(r => !r.ok).length;
const skipped = results.filter(r => r.skip).length;
report.push(`${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
if (failed) report.push(`the fixture copies are kept in ${TMP}`);
else fs.rmSync(TMP, { recursive: true, force: true });
// one write, and the exit only after it has drained: process.exit right after console.log can cut a piped stdout short
process.stdout.write(`${report.join('\n')}\n`, () => process.exit(failed ? 1 : 0));
