// Hook (UserPromptSubmit): in one week of 2026-11, API keys and client credentials were pasted
// into chat about 10 times, and history.jsonl kept two of them. Nadav approved this guard on
// 2026-11-07 (rules/acting-on-behalf.md: secrets never pass through the agent). When a prompt
// holds a key that matches one of the tight patterns below, the hook saves every matched value
// to ~/.claude/secrets/pasted-<time>.env (600), blocks the prompt with a Hebrew reason that
// names only the type and the last 4 characters, and starts a detached child that scrubs the
// values from history.jsonl, paste-cache and Orca's hook spool (Claude Code and Orca may write
// them after the hook returns). Payment cards (with the expiry and code after them) and a prompt
// that is only one bare token count too (2026-11-10). Malformed input never blocks.
// Tests: plugins/nadavai/tests/test-secret-paste-guard.sh.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readInput } from "./guard-turn.mjs";

const HOME = os.homedir();
const SECRETS = path.join(HOME, ".claude", "secrets");
const REDACTED = "[REDACTED-SECRET]";
const MAX = 50; // matches collected per prompt: enough to block, bounded so a huge paste stays fast

const PEM_HEAD = String.raw`-----BEGIN ([A-Z ]*)PRIVATE KEY-----\s+(?:[A-Za-z-]+:[^\n]*\n\s*)*`;
const b64count = (v) => v.replace(/-----[A-Z ]+-----/g, "").replace(/^[A-Za-z-]+:.*$/gm, "").replace(/[^A-Za-z0-9+/=]/g, "").length;

// Payment card: 13-19 digits starting 2-6 (Mastercard, Amex, Visa, Discover), contiguous or
// grouped 4-4-4-4 / 4-6-5; an expiry and a 3-4 digit code right after it belong to the match.
const CARD = "כרטיס אשראי";
const CARD_NUM = String.raw`[2-6]\d{3}(?<s1>[ -])\d{4}\k<s1>\d{4}\k<s1>\d{4}|[2-6]\d{3}(?<s2>[ -])\d{6}\k<s2>\d{4,5}|[2-6]\d{12,18}`;
const CARD_HEAD = new RegExp(`^(?:${CARD_NUM})`);
const EXPIRY = String.raw`(?:0[1-9]|1[0-2])[\/.-](?:20[2-4]\d|[23]\d|4[0-5])(?![\/.-]?\d)`;
const EXPIRY_RE = new RegExp(String.raw`(?<![\d\/.-])${EXPIRY}`);
const CARD_SEP = String.raw`\s{0,4}(?:[\/,|;:-]\s{0,4})?(?:(?:exp(?:iry|ires)?|valid(?: thru)?|ו?תוקף|cvv2?|cvc|cid|ו?קוד(?: אבטחה)?)\s{0,2}[:=.-]?\s{0,4})?`;
const CARD_WORD = /כרטיס|אשראי|תוקף|\b(?:cvv2?|cvc|cards?|visa|mastercard|amex)\b/i;
const luhn = (d) => {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let n = +d[d.length - 1 - i];
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    s += n;
  }
  return s % 10 === 0;
};

// Order matters: a match that overlaps an earlier one is skipped (sk-ant- before generic sk-).
const PATTERNS = [
  // A real body is required, so code that only mentions the header passes.
  ["private key", new RegExp(PEM_HEAD + String.raw`[A-Za-z0-9+\/=\s]{64,}?-----END \1PRIVATE KEY-----`, "g")],
  // Truncated paste without the END line: base64 lines only, at least 200 characters.
  ["private key", new RegExp(PEM_HEAD + String.raw`(?:[A-Za-z0-9+\/=]{40,}(?:\s+|$))+[A-Za-z0-9+\/=]*`, "g"), (v) => b64count(v) >= 200],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  // Random keys mix cases and digits and have long runs without a dash; a branch slug does not.
  // sk-proj keys are ~160 characters with - and _, so length alone also counts.
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/g, (v) => {
    const body = v.replace(/^sk-(?:proj-)?/, "");
    return /[a-z]/.test(body) && /[A-Z]/.test(body) && /\d/.test(body) && (/[A-Za-z0-9]{20,}/.test(body) || body.length >= 100);
  }],
  ["GitHub token", /\bghp_[A-Za-z0-9]{36}\b/g],
  ["GitHub token", /\bgh[ousr]_[A-Za-z0-9]{36}\b/g],
  ["GitHub token", /\bgithub_pat_[A-Za-z0-9_]{60,}/g],
  // AKIA…EXAMPLE is the placeholder in AWS's own docs.
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g, (v) => !v.endsWith("EXAMPLE")],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["GitLab token", /\bglpat-[A-Za-z0-9_-]{20,}/g],
  ["Stripe secret key", /\bsk_live_[A-Za-z0-9]{20,}/g],
  ["Stripe restricted key", /\brk_live_[A-Za-z0-9]{20,}/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}/g],
  // Firebase web keys (AIza…) are public; only a line that calls it a server key counts.
  ["Google server key", /\bAIza[0-9A-Za-z_-]{35}\b/g, (_v, line) => /\b(?:secret|server|service)\b/i.test(line)],
  // Luhn-valid, not inside a URL or path, and an expiry or a card word within ~60 characters:
  // an order number, a phone, an ID or a timestamp alone passes.
  [CARD, new RegExp(String.raw`(?<![\w.\/\\-])(?:${CARD_NUM})(?![\w\/\\]|\.\w)(?:${CARD_SEP}(?:${EXPIRY}|\d{3,4}(?![\w\/.]|-\d))){0,2}`, "gi"),
    (v, _line, before, after) => {
      const num = v.match(CARD_HEAD)[0];
      if (!luhn(num.replace(/\D/g, ""))) return false;
      if (/[\/\\?&#@]|www\./i.test(before.match(/\S*$/)[0])) return false;
      const near = before.slice(-60) + " " + v.slice(num.length) + " " + after.slice(0, 60);
      return CARD_WORD.test(near) || EXPIRY_RE.test(near);
    }],
  // A prompt that is nothing but one random-looking token. Inside a longer message such a string
  // is usually an id, so only the whole prompt counts. No "." in the set keeps JWTs and URLs out.
  ["טוקן ללא קידומת", /(?<=^\s{0,20})[A-Za-z0-9_+\/=-]{32,200}(?=\s{0,20}$)/g, (v) => {
    if (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v) || new Set(v).size < 20) return false;
    if (/^[0-9a-f-]+$/i.test(v)) return false; // UUID, git sha, hash
    if (/^\/|\/$|\/\//.test(v)) return false; // file path
    // A slug or identifier of words (kebab, snake, path segments or camelCase) is not a token.
    const parts = v.split(/[-_\/+=]+|(?<=[a-z\d])(?=[A-Z])/).filter(Boolean);
    return !(parts.length >= 3 && parts.every((p) => /^[A-Za-z][a-z]*\d*$|^\d+$/.test(p)));
  }],
];

function findSecrets(text) {
  const found = [], seen = new Set();
  for (const [type, re, keep] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (seen.has(m[0])) continue;
      const start = m.index, end = start + m[0].length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      if (keep) {
        const before = text.slice(Math.max(0, start - 300), start), after = text.slice(end, end + 300);
        if (!keep(m[0], before.slice(before.lastIndexOf("\n") + 1) + m[0] + after.split("\n")[0], before, after)) continue;
      }
      seen.add(m[0]);
      found.push({ type, value: m[0], start, end });
      if (found.length >= MAX) return { found: found.sort((a, b) => a.start - b.start), capped: true };
    }
  }
  return { found: found.sort((a, b) => a.start - b.start), capped: false };
}

const tail = ({ type, value }) =>
  (type === "private key" ? value.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "")
    : type === CARD ? value.match(CARD_HEAD)[0].replace(/\D/g, "") : value).slice(-4);

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function secretsDir() {
  fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
  fs.chmodSync(SECRETS, 0o700);
}

function saveSecrets(found) {
  secretsDir();
  const body = [`# Pasted into Claude Code chat on ${new Date().toISOString()}; stopped by secret-paste-guard.`,
    "# Treat each value as exposed: rotate it at its provider.", ""];
  found.forEach((f, i) => {
    body.push(`# ${f.type}`);
    body.push(`PASTED_${i + 1}='${f.value.replace(/'/g, "'\\''")}'`); // safe to source
  });
  const base = `pasted-${stamp()}`;
  for (let n = 1; ; n++) {
    const file = path.join(SECRETS, n === 1 ? `${base}.env` : `${base}-${n}.env`);
    try {
      fs.writeFileSync(file, body.join("\n") + "\n", { mode: 0o600, flag: "wx" });
      return file;
    } catch (e) { if (e.code !== "EEXIST" || n > 50) throw e; }
  }
}

// --- scrub (detached child) ---

function targets() {
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  const roots = [...new Set([cfg, path.join(HOME, ".claude")].filter(Boolean))];
  const ls = (dir, re) => { try { return fs.readdirSync(dir).filter((n) => !re || re.test(n)).map((n) => path.join(dir, n)); } catch { return []; } };
  const list = []; // [file, takes Claude Code's history lock]
  for (const r of roots) for (const f of ls(path.join(r, "paste-cache"))) list.push([f, false]);
  // Orca's UserPromptSubmit hook spools the prompt here while Orca is unreachable.
  const spools = [path.join(HOME, ".config", "orca", "agent-hooks", "spool")];
  if (process.env.ORCA_AGENT_HOOK_ENDPOINT) spools.push(path.join(path.dirname(process.env.ORCA_AGENT_HOOK_ENDPOINT), "spool"));
  for (const d of new Set(spools)) for (const f of ls(d, /^pane-.*\.jsonl$/)) list.push([f, false]);
  for (const r of roots) list.push([path.join(r, "history.jsonl"), true]); // last: its lock may make us wait
  const secrets = (() => { try { return fs.realpathSync(SECRETS); } catch { return SECRETS; } })();
  const real = new Map();
  for (const [f, lock] of list) {
    try {
      const p = fs.realpathSync(f); // history.jsonl may be a symlink: rename must hit its target
      if (p === secrets || p.startsWith(secrets + path.sep)) continue;
      if (fs.statSync(p).isFile() && !real.has(p)) real.set(p, lock);
    } catch {}
  }
  return [...real];
}

function rewrite(file, forms) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = fs.statSync(file);
    const text = fs.readFileSync(file, "utf8");
    let out = text;
    for (const f of forms) out = out.split(f).join(REDACTED);
    if (out === text) return;
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.scrub-${process.pid}`);
    try {
      fs.writeFileSync(tmp, out, { mode: before.mode & 0o7777, flag: "wx" });
      fs.chmodSync(tmp, before.mode & 0o7777);
      const now = fs.statSync(file);
      if (now.size !== before.size || now.mtimeMs !== before.mtimeMs) continue; // appended meanwhile: redo
      fs.renameSync(tmp, file);
      return;
    } finally { try { fs.unlinkSync(tmp); } catch {} }
  }
}

// Claude Code appends to history.jsonl under a lock dir <realpath>.lock, and every Orca profile's
// history.jsonl links to the same file: take that lock so no other session's line is lost.
async function scrubFile([file, lock], forms) {
  if (!lock) return rewrite(file, forms);
  const dir = file + ".lock", until = Date.now() + 5000;
  for (;;) {
    try { fs.mkdirSync(dir); break; } catch (e) { if (e.code !== "EEXIST") return; }
    try { if (Date.now() - fs.statSync(dir).mtimeMs > 10000) fs.rmdirSync(dir); } catch {} // stale
    if (Date.now() > until) return; // the next pass retries
    await sleep(100);
  }
  try { rewrite(file, forms); } finally { try { fs.rmdirSync(dir); } catch {} }
}

async function scrubMain(valuesFile) {
  if (path.dirname(valuesFile || "") !== SECRETS || !/^\.scrub-[0-9a-f]+\.json$/.test(path.basename(valuesFile))) return;
  let values = [];
  try { values = JSON.parse(fs.readFileSync(valuesFile, "utf8")); } catch {}
  try { fs.unlinkSync(valuesFile); } catch {}
  values = Array.isArray(values) ? values.filter((v) => typeof v === "string" && v) : [];
  if (!values.length) return;
  // Keys are also stored JSON-escaped (history.jsonl, Orca's spool); a private key's newlines become \n.
  const forms = [...new Set(values.flatMap((v) => [v, JSON.stringify(v).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length);
  for (const delay of [3000, 10000]) {
    await sleep(delay);
    for (const t of targets()) { try { await scrubFile(t, forms); } catch {} }
  }
}

function startScrub(values) {
  secretsDir(); // the scrub never touches this folder, and the child deletes the file on start
  const file = path.join(SECRETS, `.scrub-${crypto.randomBytes(8).toString("hex")}.json`);
  fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600, flag: "wx" });
  spawn(process.execPath, [new URL(import.meta.url).pathname, "--scrub", file],
    { detached: true, stdio: "ignore", cwd: "/" }).unref();
}

// --- main ---

if (process.argv[2] === "--scrub") {
  await scrubMain(process.argv[3]);
  process.exit(0);
}

let input = null;
try { input = await readInput(); } catch {}
if (!input || typeof input.prompt !== "string") process.exit(0);
if (input.hook_event_name && input.hook_event_name !== "UserPromptSubmit") process.exit(0);

const { found, capped } = findSecrets(input.prompt);
if (!found.length) process.exit(0);

let saved = null;
try { saved = saveSecrets(found); } catch {}
try { startScrub(found.map((f) => f.value)); } catch {}

const SHOWN = 5;
const list = found.slice(0, SHOWN).map((f) => `- ${f.type} שמסתיים ב-${tail(f)}`);
if (found.length > SHOWN) list.push(`- ועוד ${capped ? "לפחות " : ""}${found.length - SHOWN} מפתחות`);
const many = found.length > 1;
const savedLine = saved
  ? `${many ? "המפתחות נשמרו" : "המפתח נשמר"} בקובץ ${saved} (הרשאות 600).`
  : `השמירה בתיקייה ${SECRETS} נכשלה, ולכן ${many ? "המפתחות לא נשמרו" : "המפתח לא נשמר"} בשום מקום.`;
const reason = [
  "ההודעה נעצרה ולא הגיעה למודל: היא מכילה מפתח סודי.",
  ...list,
  savedLine,
  many ? "התייחס למפתחות כאל חשופים: החלף כל אחד (rotate) אצל הספק שלו." : "התייחס למפתח כאל חשוף: החלף אותו (rotate) אצל הספק שלו.",
  "בפעם הבאה שים סודות בקובץ ~/.claude/secrets/<service>.env, או השתמש ב-vault-login-add לסיסמאות.",
  `אפשר לשלוח את ההודעה שוב בלי ${many ? "המפתחות" : "המפתח"}.`,
].join("\n");

process.stdout.write(JSON.stringify({
  decision: "block",
  reason,
  // Without this the block message ends with the original prompt (the key) and is saved to the transcript.
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
}) + "\n");
process.exit(0);
