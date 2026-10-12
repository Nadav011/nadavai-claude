#!/usr/bin/env python3
"""Read a Workflow run's journal and decide between resuming it and restarting the round at spec.

usage: python3 journal-state.py <run-dir> [out.json]
  <run-dir>: ~/.claude/projects/<project>/<session>/subagents/workflows/wf_<id>/ (journal.jsonl, agent-*.meta.json)
  out.json:  default ./wf-state.json; one entry per agent in start order:
             {i, label, phase, agentId, done, models, result}

Why: resume (resumeFromRunId) replays cached results only for the unchanged prefix of agent() calls. An agent whose
first attempt failed (a usage cut, a 529, a login expiry) has no cached result, so on resume it and EVERY agent after
it run live again: on 6.10.2026 a resume of a SporChat round restarted about 40 finished agents. The verdict line says
whether that would happen. When it would, restart the round at spec WITH the cut run's args.spec (and item files)
again (README «When a run is cut»): the lanes re-check every item, so what the finished agents did is a no-op. Their
needs, from out.json, go into DECISIONS-OPEN.md and to Nadav first.

It also lists the models the agents ran on: after a usage-limit resume on 29.9.2026 the agents silently ran on a
smaller model, so a round whose models are not all Opus is not trusted.

Exit 0 when the journal read cleanly (whatever the verdict). Exit 3, verdict «unknown», when the evidence is
incomplete: a malformed journal line (a last line cut mid-write is named as such), an agent with no meta file, or a
finished agent whose transcript shows no model. Never resume on an «unknown».
"""
import collections
import json
import pathlib
import sys

if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help'):
    print(__doc__)
    sys.exit(0)
if len(sys.argv) < 2:
    print(__doc__, file=sys.stderr)
    sys.exit(2)
run = pathlib.Path(sys.argv[1]).expanduser()
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'wf-state.json')
out.parent.mkdir(parents=True, exist_ok=True)
journal = run / 'journal.jsonl'
if not journal.exists():
    sys.exit(f'no journal.jsonl in {run}')

order, results, bad = [], {}, []
lines = journal.read_text(encoding='utf-8').splitlines()
for n, line in enumerate(lines, 1):
    if not line.strip():
        continue
    try:
        e = json.loads(line)
    except json.JSONDecodeError:
        bad.append(n)
        continue
    aid = e.get('agentId')
    if e.get('type') == 'started' and aid not in order:
        order.append(aid)
    elif e.get('type') == 'result':
        results[aid] = e.get('result')


def meta(aid):
    p = run / f'agent-{aid}.meta.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def models(aid):
    p = run / f'agent-{aid}.jsonl'
    seen = collections.Counter()
    if p.exists():
        for line in p.read_text(encoding='utf-8').splitlines():
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            m = e.get('message')
            # '<synthetic>' marks a message the harness wrote itself, not a model
            if e.get('type') == 'assistant' and isinstance(m, dict) and m.get('model') and m['model'] != '<synthetic>':
                seen[m['model']] += 1
    return sorted(seen)


state = []
for i, aid in enumerate(order):
    m = meta(aid)
    state.append({'i': i, 'label': m.get('description', ''), 'phase': m.get('workflowPhase', ''), 'agentId': aid,
                  'done': aid in results and results[aid] is not None, 'models': models(aid), 'result': results.get(aid)})
out.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')

done = [s for s in state if s['done']]
unfinished = [s for s in state if not s['done']]
retries = [s['label'] for s in state if '~retry' in s['label']]
used = collections.Counter(m for s in state for m in s['models'])
print(f'{len(state)} agents started, {len(done)} finished, {len(unfinished)} never finished -> {out}')
print(f'models: {dict(used)}' + ('' if all('opus' in m for m in used) else '  <- NOT all Opus: re-run what a smaller model did'))
gaps = []
if bad:
    cut = bad == [len(lines)]
    gaps.append(f'the last journal line is cut (written while the run stopped)' if cut else f'malformed journal lines {bad[:10]}')
no_meta = [s['agentId'] for s in state if not (run / f'agent-{s["agentId"]}.meta.json').exists()]
if no_meta:
    gaps.append(f'{len(no_meta)} agents have no meta file (labels unknown)')
no_model = [s['label'] or s['agentId'] for s in done if not s['models']]
if no_model:
    gaps.append(f'{len(no_model)} finished agents show no model ({", ".join(no_model[:5])})')
if gaps:
    print('verdict: unknown; ' + '; '.join(gaps) + '. Do not resume on this evidence: read the run by hand.')
    sys.exit(3)
if retries:
    print(f'retried: {", ".join(retries[:10])}' + (' …' if len(retries) > 10 else ''))
if unfinished:
    first = unfinished[0]
    after = sum(1 for s in done if s['i'] > first['i'])
    print(f'first unfinished: #{first["i"]} {first["label"]} ({first["phase"]})')
    if after:
        print(f'verdict: do NOT resume; it would re-run {after} finished agents after #{first["i"]}. '
              'Restart the round at spec with the cut run\'s args.spec again; its needs go to Nadav first.')
    else:
        print('verdict: resume is safe; nothing finished after the first unfinished agent.')
else:
    print('verdict: the run finished every agent it started; nothing to resume.')
