#!/usr/bin/env node
// Memory index guard. Claude Code loads only the first 200 lines / 25 KB of a project's
// memory/MEMORY.md into each session; anything past that is cut silently, so the newest
// memories (appended last) are the first to disappear.
//
// SessionStart: checks the current project's index (plain stdout goes to Claude's context).
// PostToolUse (Write|Edit|MultiEdit): checks MEMORY.md right after it is edited, and a memory
// file that is still missing from the index.
// Silent when everything is within bounds. Never blocks, never fails the hook.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

const LIMIT_LINES = 200;
const LIMIT_BYTES = 25 * 1024;
const WARN_LINES = Number(process.env.MEMORY_INDEX_WARN_LINES || 160);
const WARN_BYTES = Number(process.env.MEMORY_INDEX_WARN_BYTES || 20 * 1024);
const LONG_LINE = 200;

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

// Same rule Claude Code uses for ~/.claude/projects/<slug>: every non-alphanumeric char -> "-".
// Worktrees share the main checkout's memory, so the slug comes from the git common dir.
function memoryDirFor(cwd) {
  let root = cwd;
  try {
    const common = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
    root = basename(common) === ".git" ? dirname(common) : cwd;
  } catch { /* not a git repo: the cwd is the project */ }
  const slug = root.replace(/[^a-zA-Z0-9]/g, "-");
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return join(configDir, "projects", slug, "memory");
}

function linkedFiles(text) {
  return new Set([...text.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1]));
}

function check(indexPath, { coverage }) {
  if (!existsSync(indexPath)) return [];
  const text = readFileSync(indexPath, "utf8");
  const bytes = Buffer.byteLength(text, "utf8");
  const lines = text.split("\n");
  const lineCount = text.endsWith("\n") ? lines.length - 1 : lines.length;
  const issues = [];
  const kb = (n) => (n / 1024).toFixed(1);

  if (lineCount > LIMIT_LINES || bytes > LIMIT_BYTES) {
    issues.push(`MEMORY INDEX OVER LIMIT: ${indexPath} is ${lineCount} lines / ${kb(bytes)} KB; Claude Code loads only the first ${LIMIT_LINES} lines / 25 KB, so the entries past that are already cut from every session.`);
  } else if (lineCount > WARN_LINES || bytes > WARN_BYTES) {
    issues.push(`MEMORY INDEX NEAR LIMIT: ${indexPath} is ${lineCount} lines / ${kb(bytes)} KB of the ${LIMIT_LINES} lines / 25 KB Claude Code loads; past that, the newest memories are cut silently.`);
  }
  if (issues.length) {
    const long = lines.filter((l) => l.length > LONG_LINE).length;
    issues.push(`Compact it now (index only, no approval needed): one line per memory, "- [Short title](file.md) — hook" with the hook under ~80 characters, grouped under a few topic headings; keep every entry and touch no memory file.${long ? ` ${long} lines are longer than ${LONG_LINE} characters.` : ""} Merging or deleting memory files themselves needs Nadav's word. Afterwards confirm every memory file is linked exactly once. Tell Nadav in one Hebrew line what you did.`);
  }

  const dir = dirname(indexPath);
  const linked = linkedFiles(text);
  const broken = [...linked].filter((f) => !f.includes("/") && !existsSync(join(dir, f)));
  if (broken.length) issues.push(`MEMORY INDEX BROKEN LINKS in ${indexPath}: ${broken.join(", ")}. Fix or drop those lines.`);

  if (coverage) {
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md"); } catch { /* unreadable */ }
    const missing = files.filter((f) => !linked.has(f));
    if (missing.length) issues.push(`MEMORY FILES NOT IN INDEX (${dir}): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` and ${missing.length - 10} more` : ""}. A memory without an index line is never recalled; add one short line each.`);
  }
  return issues;
}

let input = {};
try { input = JSON.parse(readStdin() || "{}"); } catch { input = {}; }
const event = input.hook_event_name || (input.tool_name ? "PostToolUse" : "SessionStart");

try {
  if (event === "PostToolUse") {
    const fp = input.tool_input?.file_path || "";
    if (!/\/memory\/[^/]+\.md$/.test(fp)) process.exit(0);
    const indexPath = join(dirname(fp), "MEMORY.md");
    let issues;
    if (basename(fp) === "MEMORY.md") {
      issues = check(indexPath, { coverage: false });
    } else {
      // A new memory file: remind only if the index does not link it yet.
      const linked = existsSync(indexPath) ? linkedFiles(readFileSync(indexPath, "utf8")) : new Set();
      issues = linked.has(basename(fp)) ? [] : [`MEMORY FILE NOT IN INDEX: add a one-line pointer for ${basename(fp)} to ${indexPath} (short hook, under its topic heading).`];
      issues.push(...check(indexPath, { coverage: false }).filter((s) => !s.startsWith("MEMORY INDEX BROKEN")));
    }
    if (issues.length) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: issues.join("\n") } }) + "\n");
    }
  } else {
    const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const issues = check(join(memoryDirFor(cwd), "MEMORY.md"), { coverage: true });
    if (issues.length) process.stdout.write(issues.join("\n") + "\n");
  }
} catch {
  // A guard that breaks must not break the session.
}
process.exit(0);
