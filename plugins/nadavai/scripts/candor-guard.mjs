// Hook (Stop): Nadav asked on 2026-11-03 for protection from a model that flatters him and
// agrees before it checks (rules/candor.md). This hook reads the text Claude showed in the
// turn that just ended. When a line opens with praise ("great idea", "רעיון מצוין") or with
// "you're right" / "אתה צודק", or the text tells him he is absolutely right, it blocks the
// stop once per phrase per turn and asks for the reply again, without the praise and with
// the evidence for any agreement. Code, quotes and blockquotes are stripped first, so quoting
// a phrase passes; negated, hedged and third-party uses ("אתה לא צודק לגמרי", "if you're
// totally right", "Codex צודק לגמרי", "good catch by the reviewer") pass too.
import { readInput, readTurn, firstTime } from "./guard-turn.mjs";

const input = await readInput();
if (!input) process.exit(0);
if (input.hook_event_name && input.hook_event_name !== "Stop") process.exit(0);
// Grok also fires Stop at session end. Its decision is ignored; skip so the turn stays correctable.
if (input.reason === "channel_closed" || input.reason === "shutdown") process.exit(0);

const prose = (t) => t
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/`[^`\n]*`/g, " ")
  .replace(/^[ \t]*>.*$/gm, " ")
  .replace(/([א-ת])["״](?=[א-ת])/g, "$1") // gershayim (ש"ח) are not quotes
  .replace(/"[^"\n]*"|“[^”\n]*”|„[^“”\n]*[“”]|״[^״\n]*״|‘[^’\n]*’/g, " ")
  .replace(/(^|[\s(])'[^\n]*?'(?=[\s.,;:!?)]|$)/gm, "$1 ");

const END = String.raw`(?=[\s!.,:;—\-*_]|$)`;
const YOU_HE = String.raw`ו?ש?(?:אתה|את|אתם|אתן)\s+(?:ממש\s+|באמת\s+)?צודק(?:ת|ים|ות)?`;
const FULLY_HE = String.raw`(?:לגמרי|לחלוטין|במאה אחוז|ב-?100%)`;

// Anywhere in a sentence, unless the sentence negates or hedges it before the phrase.
const ANYWHERE = [
  /\byou(?:'|’)?re (?:absolutely|totally|completely|so|100%) right\b/i,
  /\byou are (?:absolutely|totally|completely|so) right\b/i,
  new RegExp(String.raw`(?:^|[\s,(])${YOU_HE}\s+${FULLY_HE}`),
];
const HEDGE = /\b(?:not|if|whether|unless|maybe|perhaps)\b|n't\b|(?:^|[\s,])(?:לא|אם|אולי|ייתכן|ספק)(?=[\s,]|$)/i;

// At the start of a line (after list, heading and emphasis markers).
const OPENING = [
  /^(?:that(?:'|’)?s |that is |what |such )?(?:an? )?(?:really |very )?(?:great|excellent|brilliant|fantastic|amazing|wonderful|awesome|good|smart|nice) (?:idea|question|point|catch|call|thinking|instinct)\b(?!\s+(?:by|from|of)\b)/i,
  /^(?:perfect|excellent|brilliant|fantastic|amazing|exactly|spot on)\s*[!.]/i,
  /^you(?:'|’)?re (?:right|correct)\b/i,
  /^you are (?:right|correct)\b/i,
  new RegExp(String.raw`^(?:איזה |זה |זו |זאת )?(?:רעיון|שאלה|נקודה|הערה|תפיסה|הבחנה|כיוון|אינסטינקט)\s+(?:ממש\s+|באמת\s+)?(?:מצוי(?:ן|נת)|מעול(?:ה|ים|ות)|נהדר(?:ת)?|מבריק(?:ה)?|חכמה|חכם|גאוני(?:ת)?|מדהי(?:ם|מה)|טוב(?:ה)?)${END}(?!\s+של)`),
  new RegExp(String.raw`^${YOU_HE}${END}`),
  new RegExp(String.raw`^צודק(?:ת|ים)?${END}`),
  /^(?:מושלם|מבריק|גאוני|מדהים)\s*!/,
];

const hits = (t) => {
  const p = prose(t), out = [];
  for (const re of ANYWHERE) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of p.matchAll(g)) {
      const before = p.slice(0, m.index + (m[0].length - m[0].trimStart().length));
      const sentence = before.slice(Math.max(before.lastIndexOf("."), before.lastIndexOf("!"),
        before.lastIndexOf("?"), before.lastIndexOf("\n")) + 1);
      if (!HEDGE.test(sentence)) out.push(m[0].trim());
    }
  }
  for (const line of p.split("\n")) {
    const start = line.replace(/^[\s#>*_\-–•\d.)]+/, "");
    for (const re of OPENING) { const m = start.match(re); if (m) out.push(m[0].trim()); }
  }
  return out;
};

const { texts, promptId } = readTurn(input);
let hit = null;
for (const t of texts) {
  hit = hits(t).find((h) => firstTime(input, "candor", promptId, h.toLowerCase()));
  if (hit) break;
}
if (!hit) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: "block",
  reason:
    `Your reply contains praise or agreement before evidence ("${hit}"), which rules/candor.md ` +
    "forbids. Write the reply again without it, opening with what you checked. If you agree " +
    "with Nadav, say what you checked that supports it; if you have not checked, check now or " +
    "say plainly that it is an assumption. If his point is wrong or risky, say so with the " +
    "evidence. Keep the reply in Hebrew.",
}) + "\n");
