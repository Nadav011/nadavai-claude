// Hook (UserPromptSubmit): before closing a session Nadav asks "are we done, can I close?" (about 130
// times in ten days of 2026-11) and then checks main, the deploy, nadavai and client messages by hand.
// When a short prompt asks that, this adds context telling the model to run bin/session-close-check
// and answer from its output. It never blocks a prompt; malformed input exits 0 with no output.
// Tests (with the matcher's known false positives and negatives): plugins/nadavai/tests/test-close-check-hint.sh.
import { readInput } from "./guard-turn.mjs";

const MAX = 300; // longer prompts are instructions or pastes, not the closing question
const H = "֐-׿"; // Hebrew block: JS \b does not see Hebrew letters as word characters
const notAfter = `(?<![${H}A-Za-z])`;
const end = "\\s*[?!.]*\\s*$";

// Asking to close the session itself (not a tab, a PR, an issue, a chat with a client or a DB session): the
// session noun ends the prompt, or only הזה / הזאת / פה / כאן follow it. לסגר is a common misspelling of לסגור.
const CLOSE = [
  new RegExp(`${notAfter}[ולשת]?(?:(?:ל|נ|א|ת)?(?:סגור|סוגר(?:ים)?)|לסגר)\\s+(?:את\\s+)?ה?(?:סשן|סשנים|session)` +
    `(?:\\s+(?:הזה|הזאת|פה|כאן))?${end}`),
  new RegExp(`${notAfter}(?:ו?אפשר\\s+)?(?:לסגור|לסגר|נסגור|סוגרים|אסגור)(?:\\s+(?:פה|כאן|את\\s+זה))?${end}`),
  new RegExp(`${notAfter}אני\\s+סוגר(?:\\s+(?:פה|כאן|את\\s+זה))?${end}`),
  new RegExp(`${notAfter}סגור\\s+על\\s+זה\\s*[?!]`),
  new RegExp(`${notAfter}זהו\\s*\\?+[?!.\\s]*$`),
  /\b(?:can|should|may)\s+(?:i|we)\s+close(?:\s+(?:this|the)\s+(?:session|chat))?\b\s*[?!.]*\s*$/i,
  /\b(?:can|should|may)\s+(?:i|we)\s+close\s+(?:this|the)\s+session\b/i,
];
// Saying the work is finished ("סיימנו עם X" is "done with X, next", not a question about the end).
const FINISH = [
  new RegExp(`(?:סי{1,2}מנו|סיימת(?:ם)?|גמרנו|גמרת(?:ם)?|סגרנו|סגרת(?:ם)?)(?![${H}])(?!\\s+עם(?![${H}]))`),
  new RegExp(`${notAfter}ו?לא\\s+נשאר(?:\\s+(?:לנו|לך|לכם|עוד|פה|כאן))?\\s+כלום`),
  new RegExp(`${notAfter}נשאר\\s+עוד\\s+משהו|${notAfter}נשאר\\s+משהו${end}`),
  new RegExp(`${notAfter}מה\\s+(?:עוד\\s+)?נשאר${end}`),
  new RegExp(`${notAfter}(?:עוד\\s+)?משהו\\s+פתוח(?![${H}])`),
  new RegExp(`${notAfter}נגמר(?:\\s+הכל)?${end}`),
  /עברנו\s+על\s+הכל/,
  new RegExp(`${notAfter}הכל\\s+(?:מוכן|גמור|סגור|הושלם)(?![${H}])`),
  new RegExp(`${notAfter}הכל\\s+(?:עלה\\s+ל|ב)-?\\s*(?:מיין|main|פרודקשן|production|פרוד|דמיין)(?![${H}A-Za-z])`, "i"),
  /\b(?:are\s+we|we|is\s+everything|is\s+it\s+all)\s+(?:all\s+)?(?:done|finished|complete)\b[^?]*\?/i,
  /\banything\s+(?:else\s+)?left(?:\s+to\s+do)?\s*\?+\s*$/i,
];
// A question or a "that's it / sure / anything left" marker.
const MARK = [
  /\?/,
  new RegExp(`${notAfter}(?:ו|אז\\s+)?(?:זהו|בטוח[${H}]*|נשאר|מקצה\\s+לקצה)(?![${H}])`),
];
// A next step in the same prompt makes it an instruction ("did we finish X? if so, do Y", "...? run Y" or
// "check X and close it"). "תגיד", "תאשר" and "תודה" (also with ו) still ask for the answer.
const NEXT = new RegExp(`${notAfter}(?:אם\\s+כן|אם\\s+לא|עכשיו\\s+ת[${H}]+|ואז\\s+ת[${H}]+|אחרי\\s+זה\\s+ת[${H}]+)` +
  `|\\?\\s*(?!תגיד|תאשר|תודה)ת[${H}]{2,}|${notAfter}ו(?!תגיד|תאשר|תודה)ת[${H}]{2,}|\\bthen\\b`, "i");

function asksToClose(prompt) {
  const p = (prompt || "").trim();
  if (!p || p.length > MAX) return false;
  if (CLOSE.some((re) => re.test(p))) return true;
  return FINISH.some((re) => re.test(p)) && MARK.some((re) => re.test(p)) && !NEXT.test(p);
}

const CONTEXT = "Nadav is asking whether this session's work is finished or the session can be closed. " +
  "Before answering, run `session-close-check` (without --no-fetch) on every directory where this session " +
  "changed files, in one call: its worktree, and each repo it changed by absolute path " +
  "(`session-close-check <dir> <dir> ...`); the current directory alone misses work done in a worktree or in " +
  "another repo. Answer from its output. Its last line is CLOSE: yes, no or unknown; \"CLOSE: yes (no git repo " +
  "checked)\" means no repo was passed, so run it again with the repos. Start the reply with " +
  "\"לסגור את הסשן: כן\", \"לסגור את הסשן: לא, כי ...\" or \"לסגור את הסשן: לא ידוע, כי ...\" (naming what " +
  "could not be checked), and then the open and unchecked items, each with its owner. NOTE lines are other " +
  "sessions' and are not counted; name any worktree or item in them that is this session's own. Add what only " +
  "you know: background tasks still running, anything scheduled inside this session, and messages you received " +
  "for another session and have not forwarded.";

let input = null;
try { input = await readInput(); } catch {}
try {
  if (input && typeof input.prompt === "string" &&
      (!input.hook_event_name || input.hook_event_name === "UserPromptSubmit") && asksToClose(input.prompt)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT },
    }) + "\n");
  }
} catch {}
process.exit(0);
