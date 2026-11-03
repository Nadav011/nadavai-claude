// Hook: Nadav reads everything Claude shows him in Hebrew. The `language` setting and the
// system prompt alone did not stop English from reaching him (2026-10-26, 10-31, 11-03), so
// two events check the text:
//  - Stop: the text Claude showed in the turn that just ended. When a block of it is mostly
//    English prose, blocks the stop once and asks for the reply again in Hebrew.
//  - PreToolUse on AskUserQuestion: the dialog itself (question, header, option labels and
//    descriptions). The Stop check never sees it, because a dialog is a tool call, not text
//    (2026-11-03: the SSH and Sunshine questions reached him in English).
// Code, paths, URLs and identifiers are stripped before counting, so a Hebrew reply or
// dialog full of code passes.
import fs from "node:fs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }
if (!input) process.exit(0);

const prose = (t) => t
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/`[^`\n]*`/g, " ")
  .replace(/https?:\/\/\S+/g, " ")
  .replace(/(?:~|\.{0,2})?\/[\w.\/-]+/g, " ")
  .replace(/\b[\w-]+\.(?:md|json|jsonc|sh|mjs|js|ts|tsx|py|yml|yaml|toml)\b/g, " ")
  .replace(/\b\w*[_@#$]\w*\b/g, " ");

const isEnglish = (t, minLatin = 60) => {
  const p = prose(t);
  const latin = (p.match(/[A-Za-z]/g) || []).length;
  const hebrew = (p.match(/[֐-׿]/g) || []).length;
  return latin >= minLatin && hebrew < latin * 0.25;
};

if (input.hook_event_name === "PreToolUse") {
  if (input.tool_name !== "AskUserQuestion") process.exit(0);
  // All the dialog's strings, except `preview` (mockups and code snippets, not prose).
  const strings = [];
  const walk = (v, key) => {
    if (key === "preview") return;
    if (typeof v === "string") strings.push(v);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(input.tool_input);
  const dialog = strings.join("\n");
  // A dialog is short and all of it is prose, so the bar is lower than for a reply.
  if (!isEnglish(dialog, 25)) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "This question to Nadav is written in English. He reads only Hebrew: ask it again with the " +
        "question, the header, every option label and every option description in Hebrew. Keep code, " +
        "commands, paths and identifiers as they are. " +
        `It began: "${dialog.trim().slice(0, 120)}"`,
    },
  }) + "\n");
  process.exit(0);
}

// Stop: second stop after a block, never loop.
if (input.stop_hook_active) process.exit(0);

const texts = [];
if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);

// Text blocks shown earlier in the same turn (between tool calls).
try {
  // Only the tail: the turn that just ended sits at the end, and transcripts reach 140 MB.
  const TAIL = 2 * 1024 * 1024;
  const fd = fs.openSync(input.transcript_path, "r");
  const size = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(Math.min(size, TAIL));
  fs.readSync(fd, buf, 0, buf.length, size - buf.length);
  fs.closeSync(fd);
  const lines = buf.toString("utf8").trim().split("\n");
  if (size > TAIL) lines.shift(); // first line is cut mid-record
  const turn = [];
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
      for (const b of c) if (b.type === "text" && b.text) turn.push(b.text);
    }
  }
  texts.push(...turn);
} catch { /* no transcript: check last_assistant_message only */ }

const bad = texts.find((t) => isEnglish(t));
if (!bad) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: "block",
  reason:
    "Your reply to Nadav was written in English. He reads only Hebrew: write the reply again, " +
    "in full, in Hebrew. Keep code, commands, paths and identifiers as they are. " +
    `It began: "${bad.trim().slice(0, 120)}"`,
}) + "\n");
