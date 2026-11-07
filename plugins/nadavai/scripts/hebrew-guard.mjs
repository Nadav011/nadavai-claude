// Hook: Nadav reads everything Claude shows him in Hebrew. The `language` setting and the
// system prompt alone did not stop English from reaching him (2026-10-26, 10-31, 11-03), so
// two events check the text:
//  - Stop: the text Claude showed in the turn that just ended. When a block of it is mostly
//    English prose, blocks the stop once and asks for the reply again in Hebrew.
//  - PreToolUse on AskUserQuestion (Grok: ask_user_question, Cursor preset: AskQuestion):
//    the dialog itself (question, header, option labels and descriptions). The Stop check
//    never sees it, because a dialog is a tool call, not text
//    (2026-11-03: the SSH and Sunshine questions reached him in English).
// Code, paths, URLs and identifiers are stripped before counting, so a Hebrew reply or
// dialog full of code passes.
import { readTurn, firstTime } from "./guard-turn.mjs";

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

const toolName = input.tool_name || input.toolName || "";
const toolInput = input.tool_input || input.toolInput;
if (input.hook_event_name === "PreToolUse" || input.hookEventName === "pre_tool_use") {
  if (toolName !== "AskUserQuestion" && toolName !== "ask_user_question" && toolName !== "AskQuestion") process.exit(0);
  // All the dialog's strings, except `preview` (mockups and code snippets, not prose).
  const strings = [];
  const walk = (v, key) => {
    if (key === "preview") return;
    if (typeof v === "string") strings.push(v);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(toolInput);
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

if (input.hook_event_name && input.hook_event_name !== "Stop") process.exit(0);
// Grok also fires Stop at session end (channel_closed / shutdown). That decision is ignored,
// and counting it would mark the turn as already checked.
if (input.reason === "channel_closed" || input.reason === "shutdown") process.exit(0);

// Stop: every English block of the turn not blocked before is marked at once (guard-turn.mjs
// explains why not stop_hook_active), so one Stop blocks once for all of them. Marking them one
// per Stop forced a full rewrite per English progress note: 476 re-asks in 14 days, 113 in one
// session (2026-11-07). A full rewrite is asked only when the final reply is English; English
// notes between tool calls are already on his screen, so for those a short Hebrew line is enough.
const { texts, promptId } = readTurn(input);
const fresh = texts.filter((t) => isEnglish(t) && firstTime(input, "hebrew", promptId, t.trim().slice(0, 400)));
if (!fresh.length) process.exit(0);
const last = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
const finalIsEnglish = last !== "" && isEnglish(last);
const notes = fresh.filter((t) => t !== last);
const began = (t) => `"${t.trim().slice(0, 120)}"`;

const reason = finalIsEnglish
  ? "Your reply to Nadav was written in English. He reads only Hebrew: write the reply again, " +
    "in full, in Hebrew. Keep code, commands, paths and identifiers as they are. " +
    `It began: ${began(last)}` +
    (notes.length ? ` (${notes.length} earlier note(s) in this turn were English too; fold what he needs from them into the Hebrew reply.)` : "")
  : `${notes.length} note(s) you showed Nadav between tool calls in this turn were in English ` +
    `(the first began: ${began(notes[0] || fresh[0])}). They are already on his screen, so do not ` +
    "rewrite the whole reply: add one or two short lines in Hebrew with anything from them he " +
    "still needs, and write every later note in Hebrew.";

process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
