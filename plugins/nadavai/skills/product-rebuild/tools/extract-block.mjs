// Extract the first ```markdown fenced block from an agent's final message (JSONL transcript) and save it.
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out, needle] = process.argv.slice(2);
let last = '';
for (const l of readFileSync(src, 'utf8').split('\n')) {
  if (!l) continue;
  let j; try { j = JSON.parse(l); } catch { continue; }
  const m = j.message;
  if (j.type === 'assistant' && m && Array.isArray(m.content)) {
    const t = m.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (t.includes(needle)) last = t;
  }
}
if (!last) throw new Error('message not found');
const open = last.indexOf('```markdown\n');
if (open < 0) throw new Error('no fenced block');
const bodyStart = open + '```markdown\n'.length;
const close = last.lastIndexOf('\n```');
if (close <= bodyStart) throw new Error('no closing fence');
const body = last.slice(bodyStart, close).trimEnd() + '\n';
writeFileSync(out, body);
console.log(body.length, body.split('\n').length);
