// Shared by the Stop-hook guards (hebrew-guard.mjs, candor-guard.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export async function readInput() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try { return JSON.parse(raw) || null; } catch { return null; }
}

// The text Claude showed in the current turn, and the uuid of the prompt that opened it.
// Earlier text blocks of the turn (between tool calls) count too: last_assistant_message
// alone misses them.
export function readTurn(input) {
  const texts = [];
  let promptId = null;
  if (typeof input.last_assistant_message === "string") texts.push(input.last_assistant_message);
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
        // A prompt is any non-meta user entry that is not a tool result (text, or an image only).
        const isPrompt = typeof c === "string" ||
          (Array.isArray(c) && c.length > 0 && !c.some((b) => b.type === "tool_result"));
        if (isPrompt && !e.isMeta) { promptId = e.uuid || `line-${i}`; break; }
        continue;
      }
      if (e.type === "assistant" && Array.isArray(c)) {
        for (const b of c) if (b.type === "text" && b.text) texts.push(b.text);
      }
    }
  } catch { /* no transcript: last_assistant_message only */ }
  return { texts, promptId };
}

// True the first time this guard sees `key` in this turn, false after. Replaces the shared
// stop_hook_active flag, which turns every Stop guard off once any Stop hook blocked
// (another guard, or OMC's persistent-mode in ralph/autopilot loops). Without a turn id
// (no transcript), falls back to stop_hook_active.
export function firstTime(input, guard, promptId, key) {
  if (!promptId || !input.session_id) return !input.stop_hook_active;
  try {
    const dir = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "nadavai-guards");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const id = crypto.createHash("sha256").update(`${input.session_id}\0${guard}`).digest("hex").slice(0, 32);
    const file = path.join(dir, id);
    const mark = crypto.createHash("sha256").update(`${promptId}\0${key}`).digest("hex");
    let seen = [];
    try { seen = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); } catch {}
    if (seen.includes(mark)) return false;
    fs.writeFileSync(file, [...seen.slice(-50), mark].join("\n") + "\n", { mode: 0o600 });
    return true;
  } catch {
    return !input.stop_hook_active;
  }
}
