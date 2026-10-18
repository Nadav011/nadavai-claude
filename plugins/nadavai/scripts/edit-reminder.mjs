import fs from "node:fs";
import path from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let parsed;
try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
const isAgy = Boolean(parsed?.toolCall);
const file = parsed?.tool_input?.file_path ?? parsed?.toolCall?.args?.TargetFile;
if (!file) {
  if (isAgy) process.stdout.write("{}\n");
  process.exit(0);
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const inside = (f, dir) => f === dir || f.startsWith(dir + path.sep);

const repo = real(process.env.NADAVAI_HOME);
const cache = real(path.join(process.env.CLAUDE_CONFIG_DIR, "plugins", "cache", "nadavai"));
const agyCache = real(path.join(process.env.GEMINI_CONFIG_DIR || path.join(process.env.HOME || "", ".gemini", "config"), "plugins", "nadavai"));
const f = real(file);

let msg;
if (inside(f, repo)) {
  msg = `${path.relative(repo, f)} is tracked in the nadavai repo (${repo}). ` +
    `When this change is complete: commit it there with a Conventional Commit message, push, ` +
    `then run ${repo}/update.sh so the installed plugin matches. Tell Nadav that you did this.`;
} else if (inside(f, cache) || inside(f, agyCache)) {
  msg = `You edited the installed copy of the nadavai plugin (${f}); it is overwritten on the next update. ` +
    `Make the same change under ${repo}/plugins/nadavai/ instead, then commit, push and run ${repo}/update.sh.`;
}
if (!msg) {
  if (isAgy) process.stdout.write("{}\n");
  process.exit(0);
}

if (isAgy) {
  if (process.env.NADAVAI_EDIT_STATE_FILE) {
    try { fs.writeFileSync(process.env.NADAVAI_EDIT_STATE_FILE, msg, "utf8"); } catch {}
  }
  process.stdout.write("{}\n");
} else {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg },
  }));
}
