// Hook (UserPromptSubmit): before closing a session Nadav asks "are we done, can I close?" (about 130
// times in ten days of 2026-11) and then checks main, the deploy, nadavai and client messages by hand.
// When a short prompt asks that, this adds context telling the model to run bin/session-close-check
// and answer from its output. It never blocks a prompt; malformed input exits 0 with no output.
// Tests (with the matcher's known false positives and negatives): plugins/nadavai/tests/test-close-check-hint.sh.
import { readInput } from "./guard-turn.mjs";

const MAX = 300; // longer prompts are instructions or pastes, not the closing question
const H = "֐-׿"; // Hebrew block: JS \b does not see Hebrew letters as word characters
const notAfter = `(?<![${H}A-Za-z])`;

// Asking to close the session itself (not a tab, a PR or an issue).
const CLOSE = [
  new RegExp(`${notAfter}[ולשת]?(?:ל|נ|א|ת)?סגור\\s+(?:את\\s+)?ה?(?:סשן|סשנים|שיחה|צ'?אט|session)`),
  new RegExp(`${notAfter}(?:ו?אפשר\\s+)?(?:לסגור|נסגור|סוגרים|אסגור)(?:\\s+(?:פה|כאן|את\\s+זה))?\\s*[?!.]*\\s*$`),
  new RegExp(`${notAfter}סגור\\s+על\\s+זה\\s*[?!]`),
  /\b(?:can|should|may)\s+(?:i|we)\s+close\s+(?:this|the)\s+(?:session|chat)\b/i,
];
// Saying the work is finished ("סיימנו עם X" is "done with X, next", not a question about the end).
const FINISH = [
  new RegExp(`(?:סי{1,2}מנו|סיימת(?:ם)?|גמרנו|גמרת(?:ם)?)(?![${H}])(?!\\s+עם(?![${H}]))`),
  new RegExp(`${notAfter}ו?לא\\s+נשאר(?:\\s+(?:לנו|לך|לכם|עוד|פה|כאן))?\\s+כלום`),
  /עברנו\s+על\s+הכל/,
  new RegExp(`${notAfter}הכל\\s+(?:מוכן|גמור|סגור|הושלם)(?![${H}])`),
  /\b(?:are\s+we|is\s+everything|is\s+it\s+all)\s+(?:all\s+)?(?:done|finished|complete)\b[^?]*\?/i,
];
// A question or a "that's it / sure / anything left" marker.
const MARK = [
  /\?/,
  new RegExp(`${notAfter}(?:ו|אז\\s+)?(?:זהו|בטוח[${H}]*|נשאר|מקצה\\s+לקצה)(?![${H}])`),
];
// A next step in the same prompt makes it an instruction ("did we finish X? if so, do Y").
const NEXT = new RegExp(`${notAfter}(?:אם\\s+כן|אם\\s+לא|עכשיו\\s+ת[${H}]+|ואז\\s+ת[${H}]+|אחרי\\s+זה\\s+ת[${H}]+)`);

function asksToClose(prompt) {
  const p = (prompt || "").trim();
  if (!p || p.length > MAX) return false;
  if (CLOSE.some((re) => re.test(p))) return true;
  return FINISH.some((re) => re.test(p)) && MARK.some((re) => re.test(p)) && !NEXT.test(p);
}

const CONTEXT = "Nadav is asking whether this session's work is finished or the session can be closed. " +
  "Run `session-close-check` in the project directory before answering, and answer from its output. " +
  "Start the reply with \"לסגור את הסשן: כן\" or \"לסגור את הסשן: לא, כי ...\" and then the open items, each with " +
  "its owner. Add what only you know: background tasks still running, anything scheduled inside this session, " +
  "and messages you received for another session and have not forwarded.";

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
