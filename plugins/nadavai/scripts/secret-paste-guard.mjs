// Hook (UserPromptSubmit): in one week of 2026-11, API keys and client credentials were pasted
// into chat about 10 times, and history.jsonl kept two of them. Nadav approved this guard on
// 2026-11-07 (rules/acting-on-behalf.md: secrets never pass through the agent). When a prompt
// holds a key that matches one of the tight patterns below, the hook saves every matched value
// to ~/.claude/secrets/pasted-<time>.env (600), blocks the prompt with a Hebrew reason that
// names only the type and the last 4 characters, and starts a detached child that scrubs the
// values from history.jsonl, paste-cache and Orca's hook spool (Claude Code and Orca may write
// them after the hook returns). Payment cards (with the expiry and code next to them) and a prompt
// that is only one bare token count too (2026-11-10); card details are scrubbed but never saved.
// Malformed input never blocks.
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
// grouped 4-4-4-4 / 4-6-5 (spaces, no-break or thin spaces, dots or dashes between groups). An
// expiry or a 3-4 digit code next to it, labelled or not, before or after it, belongs to the match
// so the scrub removes it too. Card details are never written to disk (see saveSecrets).
const CARD = "כרטיס אשראי";
const GSEP = String.raw`(?:[    ]{1,2}|[.-])`;
const CARD_NUM = String.raw`[2-6]\d{3}(?:${GSEP}\d{4}){3}|[2-6]\d{3}${GSEP}\d{6}${GSEP}\d{4,5}|[2-6]\d{12,18}`;
const YEAR = String.raw`(?:20[2-4]\d|[23]\d|4[0-5])`;
// A unit right after it ("12.35ms", "12.30%", "12.30 ₪") makes it a number, not an expiry.
const NOT_UNIT = String.raw`(?![\/.-]?\d|[a-z%₪$€£]|\s?(?:[%₪$€£]|ש["״]?ח))`;
const EXPIRY = String.raw`(?:0[1-9]|1[0-2])\s?[\/.-]\s?${YEAR}${NOT_UNIT}`;
const EXPIRY_RE = new RegExp(String.raw`(?<![\d\/.-])${EXPIRY}`, "i");
// Away from the number only MM/YY with a slash counts: "12.30" nearby is usually a price.
// A month that already passed ("since 03/2025") is a date, so only this month up to twelve years on counts.
const SLASH_EXPIRY = new RegExp(String.raw`(?<![\d\/.-])(0[1-9]|1[0-2])\s?\/\s?((?:20)?\d{2})${NOT_UNIT}`, "gi");
const futureExpiry = (text) => {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth() + 1;
  for (const m of text.matchAll(SLASH_EXPIRY)) {
    const y = 2000 + (+m[2] % 100), mo = +m[1];
    if (y > y0 + 12) continue;
    if (y > y0 || (y === y0 && mo >= m0)) return true;
  }
  return false;
};
const EXP_LABEL = String.raw`exp(?:iry|ires|iration)?(?:\.?\s?date)?|valid(?:\s(?:thru|until))?|good\sthru|ו?ב?תוקף(?:\sעד)?`;
const CODE_LABEL = String.raw`security\scode|cvv2?(?:\scode)?|cvc2?|cid|ו?קוד(?:\sאבטחה)?|\d\sספרות(?:\sבגב)?`;
const CARD_SEP = String.raw`[\s"',|;:=\/-]{0,8}(?:(?:${EXP_LABEL}|${CODE_LABEL})[\s"':=.-]{0,6})?`;
const CARD_PRE = String.raw`(?:(?:${CODE_LABEL})\s{0,2}[:=]?\s{0,4}\d{3,4}|(?:(?:${EXP_LABEL})[\s:=-]{0,4})?${EXPIRY})[\s"',|;:=]{1,8}(?:(?:card(?:\s(?:number|no\.?))?|(?:מספר\s)?ה?כרטיס|number)[\s"':=-]{0,6})?`;
// Whole words only: "כרטיסים" are tickets, "בתוקף" is "in force", "מסגרת האשראי" is a credit line.
// English "card" alone is too common ("carousel cards", "the Card component"): near the number it
// must be a card's own wording, and the bare word counts only right before the number (CARD_LEAD).
const CARD_WORD = /(?<![א-ת])(?:[הבלמשוכ]{0,2}כרטיס|אשראי)(?![א-ת])|\b(?:cvv2?|cvc|visa|mastercard|amex)\b|\b(?:credit|debit|bank|my)\s?cards?\b|\bcard\s?(?:number|no\.?|#|:|details)|card\[number\]/i;
const CARD_LEAD = /\bcards?\s{0,3}[#:=-]?\s{0,3}$/i;
// Stripe's own JSON keeps month and year apart: "exp_month":12,"exp_year":2029.
const EXP_PART = String.raw`[&\s"',|;:=]{0,8}(?:card\[)?(?:exp_(?:month|year)|cvc)\]?[\s"':=]{0,6}\d{1,4}(?!\d)`;
// Public test numbers from the Stripe, PayPal and Adyen docs: payment work pastes them all the time.
const TEST_CARDS = new Set(["4242424242424242", "4000056655665556", "5555555555554444", "2223003122003222",
  "5200828282828210", "5105105105105100", "378282246310005", "371449635398431", "6011111111111117",
  "6011000990139424", "6011981111111113", "3056930009020004", "36227206271667", "30569309025904",
  "38520000023237", "6555900000604105", "3566002020360505", "3530111333300000", "6200000000000005",
  "4111111111111111", "4012888888881881", "4000000000000002", "4111111145551142", "5555341244441115",
  "370000000000002", "4988438843884305", "2222400070000005"]);
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
  // Luhn-valid, not a public test number, not inside a URL or path, and an expiry next to it, or a
  // card word or an MM/YY within ~60 characters: an order number, a phone, an ID or a timestamp
  // alone passes.
  [CARD, new RegExp(String.raw`(?:${CARD_PRE})?(?<![\w.\/\\-])(?<num>${CARD_NUM})(?![\w\/\\]|\.\w)(?:${EXP_PART}|${CARD_SEP}(?:${EXPIRY}|\d{3,4}(?![\w\/]|[.-]\d))){0,4}`, "gi"),
    (v, _line, before, after, m) => {
      const num = m.groups.num, at = v.indexOf(num), digits = num.replace(/\D/g, "");
      if (!luhn(digits) || TEST_CARDS.has(digits)) return false;
      // Inside a URL, a path or an address it is an id. "#" alone may be "card #4242…", and "&" or
      // "?" alone is a form body (card[number]=…&cvc=…), which is a card.
      if (/[\/\\@]|www\./i.test((before + v.slice(0, at)).match(/\S*$/)[0])) return false;
      const rest = v.slice(at + num.length);
      if (EXPIRY_RE.test(rest)) return true;
      const near = before.slice(-60) + " " + v.slice(0, at) + " " + rest + " " + after.slice(0, 60);
      return CARD_WORD.test(near) || CARD_LEAD.test(before + v.slice(0, at)) || futureExpiry(near);
    }],
  // A prompt that is nothing but one random-looking token (one <pasted_content> wrapper allowed).
  // Inside a longer message such a string is usually an id, so only the whole prompt counts. No
  // "." in the set keeps JWTs and URLs out.
  ["טוקן ללא קידומת", /^\s*(?:<pasted_content\b[^>\n]{0,200}>\s*)?(?<secret>[A-Za-z0-9_+\/=-]{32,200})\s*(?:<\/pasted_content\b[^>\n]{0,200}>\s*)?$/g, (v) => {
    if (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v) || new Set(v).size < 20) return false;
    if (/^[0-9a-f-]+$/i.test(v)) return false; // UUID, git sha, hash
    if (/^\/|\/$|\/\//.test(v)) return false; // file path
    // Public keys and ids (Firebase, Stripe publishable, Supabase publishable, PostHog, Vercel),
    // SRI hashes, base64 images (PNG, JPEG, GIF, WebP), Google Drive and Sheets ids.
    if (/^(?:AIza|pk_(?:live|test)_|sb_publishable_|phc_|prj_|dpl_|team_|sha(?:256|384|512)-|iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/.test(v)) return false;
    if (/^1[A-Za-z0-9_-]{32}(?:[A-Za-z0-9_-]{11})?$/.test(v)) return false;
    // A slug or identifier of words (kebab, snake, path segments, camelCase, acronyms) is not a token.
    // Each piece must look like a word: 2+ letters, Capitalized, a short acronym, or OAuth-like.
    const parts = v.split(/[-_\/+=]+|(?<=[a-z\d])(?=[A-Z])/).filter(Boolean);
    return !(parts.length >= 3 && parts.every((p) => /^(?:[A-Z]{0,5}[a-z]{2,}|[A-Z]{2,5}|v)\d*$|^\d+$/.test(p)));
  }],
];

function findSecrets(text) {
  const found = [], seen = new Set();
  for (const [type, re, keep] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = m.groups?.secret ?? m[0]; // a "secret" group narrows the value to that part
      if (seen.has(value)) continue;
      const start = m.index + m[0].indexOf(value), end = start + value.length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      if (keep) {
        const before = text.slice(Math.max(0, start - 300), start), after = text.slice(end, end + 300);
        if (!keep(value, before.slice(before.lastIndexOf("\n") + 1) + value + after.split("\n")[0], before, after, m)) continue;
      }
      seen.add(value);
      found.push({ type, value, start, end, num: m.groups?.num });
      if (found.length >= MAX) return { found: found.sort((a, b) => a.start - b.start), capped: true };
    }
  }
  return { found: found.sort((a, b) => a.start - b.start), capped: false };
}

const tail = ({ type, value, num }) =>
  (type === "private key" ? value.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "")
    : type === CARD ? num.replace(/\D/g, "") : value).slice(-4);

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

// The values file of the scrub child holds what must not stay on disk (card details too), so it
// goes to the user's runtime dir (tmpfs, 700) and to the secrets folder only when there is none.
function scrubDir() {
  const r = process.env.XDG_RUNTIME_DIR;
  try {
    const st = r && path.isAbsolute(r) ? fs.statSync(r) : null;
    if (st && st.isDirectory() && st.uid === process.getuid() && (st.mode & 0o077) === 0) return r;
  } catch {}
  secretsDir();
  return SECRETS;
}

async function scrubMain(valuesFile) {
  if (path.dirname(valuesFile || "") !== scrubDir() || !/^\.scrub-[0-9a-f]+\.json$/.test(path.basename(valuesFile))) return;
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

// Returns whether the scrub child started. The child deletes the values file as it starts; when
// it cannot start, the file is removed here.
async function startScrub(values) {
  const file = path.join(scrubDir(), `.scrub-${crypto.randomBytes(8).toString("hex")}.json`);
  const drop = () => { try { fs.unlinkSync(file); } catch {} };
  fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600, flag: "wx" });
  let child;
  try {
    child = spawn(process.execPath, [new URL(import.meta.url).pathname, "--scrub", file],
      { detached: true, stdio: "ignore", cwd: "/" });
  } catch { drop(); return false; }
  // A spawn that fails at run time (EAGAIN, ENOENT) says so with an 'error' event on the next tick, not a throw.
  const started = await new Promise((res) => { child.once("spawn", () => res(true)); child.once("error", () => res(false)); });
  if (!started) { drop(); return false; }
  child.unref();
  return true;
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

// Card details are not kept on disk: nothing can be rotated from a file, and the scrub child gets
// its own short-lived values file. Only keys are saved.
const keys = found.filter((f) => f.type !== CARD), cards = found.length - keys.length;
let saved = null;
if (keys.length) try { saved = saveSecrets(keys); } catch {}
let scrubbing = false;
try { scrubbing = await startScrub(found.map((f) => f.value)); } catch {}

const SHOWN = 5;
// Keys first, so the key that the rotate line speaks about is always among the listed ones.
const list = [...keys, ...found.filter((f) => f.type === CARD)].slice(0, SHOWN).map((f) => `- ${f.type} שמסתיים ב-${tail(f)}`);
if (found.length > SHOWN) list.push(`- ועוד ${capped ? "לפחות " : ""}${found.length - SHOWN} ${cards ? "פריטים" : "מפתחות"}`);
const many = keys.length > 1;
const savedLine = saved
  ? `${many ? "המפתחות נשמרו" : "המפתח נשמר"} בקובץ ${saved} (הרשאות 600).`
  : `השמירה בתיקייה ${SECRETS} נכשלה, ולכן ${many ? "המפתחות לא נשמרו" : "המפתח לא נשמר"} בשום מקום.`;
const keyName = many ? "המפתחות" : "המפתח";
const manyCards = cards > 1, cardName = manyCards ? "הכרטיסים" : "הכרטיס";
const reason = [
  `ההודעה נעצרה ולא הגיעה למודל: היא מכילה ${keys.length ? (many ? "מפתחות סודיים" : "מפתח סודי") : ""}${keys.length && cards ? " ו" : ""}${cards ? (manyCards ? "פרטי כרטיסי אשראי" : "פרטי כרטיס אשראי") : ""}.`,
  ...list,
  ...(keys.length ? [
    savedLine,
    many ? "התייחס למפתחות כאל חשופים: החלף כל אחד (rotate) אצל הספק שלו." : "התייחס למפתח כאל חשוף: החלף אותו (rotate) אצל הספק שלו.",
    "בפעם הבאה שים סודות בקובץ ~/.claude/secrets/<service>.env, או השתמש ב-vault-login-add לסיסמאות.",
  ] : []),
  ...(cards ? [
    scrubbing
      ? `פרטי ${cardName} לא נשמרו בשום קובץ, והם נמחקים מההיסטוריה המקומית תוך כמה שניות.`
      : `פרטי ${cardName} לא נשמרו בשום קובץ, אבל המחיקה מההיסטוריה המקומית לא הופעלה: הם עדיין בקובץ ההיסטוריה של Claude Code במחשב הזה.`,
    `הפרטים לא נשלחו למודל, ולכן אין צורך לבטל את ${cardName} בגלל ההודעה הזאת. אם הדבקת אותם גם במקום אחר, שקול לבטל ${manyCards ? "אותם" : "אותו"}.`,
    "אל תדביק פרטי כרטיס בצ'אט: כשתשלום שאישרת צריך כרטיס, הסוכן פותח את דף התשלום ואתה מקליד את הפרטים שם בעצמך.",
  ] : []),
  `אפשר לשלוח את ההודעה שוב בלי ${keys.length ? keyName : ""}${keys.length && cards ? " ו" : ""}${cards ? `פרטי ${cardName}` : ""}.`,
].join("\n");

process.stdout.write(JSON.stringify({
  decision: "block",
  reason,
  // Without this the block message ends with the original prompt (the key) and is saved to the transcript.
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
}) + "\n");
process.exit(0);
