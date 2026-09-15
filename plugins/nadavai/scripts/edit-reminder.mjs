import fs from "node:fs";
import path from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let file;
try { file = JSON.parse(raw)?.tool_input?.file_path; } catch { /* not JSON */ }
if (!file) process.exit(0);

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const inside = (f, dir) => f === dir || f.startsWith(dir + path.sep);

const repo = real(process.env.NADAVAI_HOME);
const cache = real(path.join(process.env.CLAUDE_CONFIG_DIR, "plugins", "cache", "nadavai"));
const f = real(file);

let msg;
if (inside(f, repo)) {
  msg = `${path.relative(repo, f)} is tracked in the nadavai repo (${repo}). ` +
    `When this change is complete: commit it there with a Conventional Commit message, push, ` +
    `then run ${repo}/update.sh so the installed plugin matches. Tell Nadav that you did this.`;
} else if (inside(f, cache)) {
  msg = `You edited the installed copy of the nadavai plugin (${f}); it is overwritten on the next update. ` +
    `Make the same change under ${repo}/plugins/nadavai/ instead, then commit, push and run ${repo}/update.sh.`;
}
if (!msg) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg },
}));
