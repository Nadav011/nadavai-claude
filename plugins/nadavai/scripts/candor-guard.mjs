// Hook (Stop): Nadav asked on 2026-11-03 for protection from a model that flatters him and
// agrees before it checks (rules/candor.md). This hook reads the text Claude showed in the
// turn that just ended. When a paragraph opens with praise ("great idea", "רעיון מצוין") or
// any text gives blanket agreement ("you're absolutely right", "צודק לגמרי"), it blocks the
// stop once and asks for the reply again, without the praise and with the evidence for any
// agreement. Code, quotes and blockquotes are stripped first, so quoting a phrase passes.
import fs from "node:fs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }
if (!input || input.stop_hook_active) process.exit(0); // second stop after a block: never loop

const prose = (t) => t
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/`[^`\n]*`/g, " ")
  .replace(/^\s*>.*$/gm, " ")
  .replace(/"[^"\n]*"|“[^”\n]*”|„[^“”\n]*[“”]|״[^״\n]*״/g, " ");

// Anywhere in the text.
const ANYWHERE = [
  /\byou(?:'|’)?re (?:absolutely|totally|completely|so|100%) right\b/i,
  /\byou are (?:absolutely|totally|completely|so) right\b/i,
  /צודק(?:ת)? (?:לגמרי|לחלוטין|במאה אחוז|ב-?100%)/,
];
// Only at the start of a paragraph (after list or heading markers).
const OPENING = [
  /^(?:what an? |such an? )?(?:great|excellent|brilliant|fantastic|amazing|wonderful|awesome|good|smart) (?:idea|question|point|catch|call|thinking|instinct)\b/i,
  /^(?:perfect|excellent|brilliant|fantastic|amazing)\s*!/i,
  /^you(?:'|’)?re (?:right|correct)\b/i,
  /^(?:איזה |זה )?(?:רעיון|שאלה|נקודה|הערה|תפיסה|הבחנה|כיוון|אינסטינקט) (?:מצוי[ןנ]|מעול|נהדר|מבריק|חכ[םמ]|גאוני|מדהי)/,
  /^(?:אתה|את) צודק(?:ת)?(?=[\s!.,:;]|$)/,
  /^צודק(?:ת)?[!.,]/,
  /^(?:מושלם|מבריק|גאוני|מדהים)\s*!/,
];

const find = (t) => {
  const p = prose(t);
  for (const re of ANYWHERE) { const m = p.match(re); if (m) return m[0]; }
  for (const para of p.split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.|#+)\s)/)) {
    const start = para.replace(/^[\s#>*_\-–•\d.)]+/, "").replace(/^\*\*|^__/, "");
    for (const re of OPENING) { const m = start.match(re); if (m) return m[0]; }
  }
  return null;
};

const texts = [];
if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);

// Text blocks shown earlier in the same turn (between tool calls): praise usually opens the
// turn, before the tools run, so last_assistant_message alone would miss it.
try {
  const TAIL = 2 * 1024 * 1024; // transcripts reach 140 MB; the turn sits at the end
  const fd = fs.openSync(input.transcript_path, "r");
  const size = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(Math.min(size, TAIL));
  fs.readSync(fd, buf, 0, buf.length, size - buf.length);
  fs.closeSync(fd);
  const lines = buf.toString("utf8").trim().split("\n");
  if (size > TAIL) lines.shift(); // first line is cut mid-record
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    if (e.isSidechain) continue;
    const c = e.message?.content;
    if (e.type === "user") {
      const isPrompt = typeof c === "string" || (Array.isArray(c) && c.some((b) => b.type === "text"));
      if (isPrompt && !e.isMeta) break;
      continue;
    }
    if (e.type === "assistant" && Array.isArray(c)) {
      for (const b of c) if (b.type === "text" && b.text) texts.push(b.text);
    }
  }
} catch { /* no transcript: check last_assistant_message only */ }

let hit = null;
for (const t of texts) { hit = find(t); if (hit) break; }
if (!hit) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: "block",
  reason:
    `Your reply contains praise or blanket agreement ("${hit.trim()}"), which rules/candor.md ` +
    "forbids. Write the reply again without it. If you agree with Nadav, say what you checked " +
    "that supports it; if you have not checked, check now or say plainly that it is an " +
    "assumption. If his point is wrong or risky, say so with the evidence. Keep the reply in Hebrew.",
}) + "\n");
