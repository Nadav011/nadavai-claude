import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Stage } from '../types'

// The menu of Nadav's prompt store: a list above the prompt box that the
// keyboard walks, as Claude Code's own question dialogs do (Nadav, 2026-11-14,
// asked for the arrows, for "like Anthropic's own", and for the prompts by
// category). Ctrl+P opens it. Up and Down move the highlight over one group's
// prompts, Left and Right (and Tab) turn to the next group and the one before,
// Enter puts the highlighted prompt in the prompt box, Esc closes. His own
// Enter in the box then runs the prompt, so a prompt still starts only when he
// starts it and he can add words after its name. A digit jumps to that row.
//
// How the keyboard gets here. A mod cannot take the keyboard: only the person
// gives it to the band, with the focus action (bound to Ctrl+P in
// keybindings.json by lib/common.sh, link_my_menu). So while the list is
// closed the band holds one Button in a box of no height: nothing is on
// screen, and the focus action lands on it. That is the signal to open. The
// list is a Select drawn under the same key, so the focus stays on it across
// the redraw. A Select is the one element whose Up and Down are its own
// (the highlight) while Left, Right and Tab move the focus off it: on either
// side sits another Button of no height, and the focus arriving there means
// "next group" or "the group before". The focus is never let onto them.
//
// How it closes. Esc hands the keyboard back to the prompt box and raises no
// event, so while the list is open a watch asks, a few times a second, for
// the focus to stay on the list: the answer is a refusal once the band no
// longer holds the keyboard, and the list closes. After a pick the band draws
// nothing for a moment, which is what makes the engine hand the keyboard back.
//
// Why the band above the prompt and not a pane: a pane docks beside the
// transcript in a wide terminal, and Orca's terminal (our right-to-left patch)
// orders every row that holds Hebrew as one right-to-left line across the
// whole width, which mixes a docked pane into the conversation. The band's
// rows are whole terminal rows, so each one reads right to left by itself.
// The name `my` is taken: it is the nadavai plugin's printed menu, which stays
// as the form that needs no mod.

const COMMAND = 'my-menu'
const PREFIX = 'nadavai:my-'
// The row that is not a prompt: it writes a ready `/goal` line. Goal mode is
// what keeps a session from stopping before the work is closed, and only he
// can turn it on (Nadav, 2026-11-14, picked "שורה מוכנה ברשימה" over copying a
// line the session prints).
const GOAL = 'goal'
// The groups he sees, by the situation he is in (Nadav, 2026-11-14, picked
// "לפי מצב" over one list ordered by use). He was shown three groups as
// examples, with seven prompts in them: "באמצע עבודה" (run, status, fast),
// "בודקים" (prove, done, review) and "משהו לא טוב" (wrong, never). The other
// two groups, the rest of the placements and the order are this file's own:
// between the groups and inside each, the most used come first, counted over
// everything he typed to his agents from 2026-08 to 2026-11 (the table is in
// ~/.omc/plans/method-review-2026-11-13/prompt-store/corpus-2026-11-14/,
// merged/order.txt). A prompt no group names goes to a last group, by name.
// "משימה חדשה" holds the prompts for the main goals his sessions open with
// (read from the openings of his 654 sessions). He picked, the same day:
// today's five groups stay as they are, the new group comes second so that
// the list still opens on "באמצע עבודה", where his four most used sentences
// are, and a group for goal mode comes last (GOAL_FORMS, below). Which nine
// prompts, and their order (by how often the goal opened a session), are this
// file's own. His picks are recorded in
// ~/.omc/plans/method-review-2026-11-13/prompt-store/goal-2026-11-14/owner-answers.md.
const GROUPS: readonly { title: string; names: readonly string[] }[] = [
  {
    title: 'באמצע עבודה',
    names: ['run', GOAL, 'resume', 'connected', 'status', 'self', 'fast', 'next'],
  },
  {
    title: 'משימה חדשה',
    names: [
      'takeover',
      'case',
      'study',
      'plan',
      'design',
      'creative',
      'stores',
      'tools',
    ],
  },
  {
    title: 'בודקים',
    names: ['done', 'prove', 'review', 'research', 'second', 'missed', 'map', 'sweep'],
  },
  {
    title: 'להבין ולהחליט',
    names: ['best', 'method', 'plain', 'hold', 'ask', 'agents', 'cost'],
  },
  { title: 'להראות, לשלוח ולשמור', names: ['other', 'show', 'client', 'save', 'ship'] },
  { title: 'משהו לא טוב', names: ['machine', 'wrong', 'top', 'never'] },
]
const REST = 'נוספים'
// A page holds one group, or as much of it as the band has room for, and a
// digit jumps to the row of that number. Eight at most: the engine's Select
// draws eight options and puts the rest under a line of its own in English
// ("… 1 more"), so a ninth row was out of sight in real Orca (2026-11-14). A
// group with more than eight rows comes in parts, said in Hebrew.
const MAX_PER_PAGE = 8
const MIN_PER_PAGE = 1
// A last page with fewer rows than this shares rows with the page before it.
const MIN_LAST_PAGE = 3
// The band needs this many rows to show the groups above the list, and this
// many to show the keys under it as well.
const ROWS_FOR_TABS = 3
const ROWS_FOR_HINT = 5
// Blank cells between the sentence and what he gets.
const GAP = 4
// Cells of a row that are not its text: the Select's own indent (2), the
// row's number ("1. ") and three the Select keeps free at the row's end
// (measured at 72 and 100 columns: a longer row is cut by the engine itself).
const ROW_CHROME = 8
// The cells every row of the band starts after, to line up with the list.
const INDENT = '  '
// The middle column (what he gets): the widest it may be, and the narrowest
// at which it still says something.
const MAX_GLOSS = 64
const MIN_GLOSS = 20
// The narrowest band a row is laid out for.
const MIN_WIDTH = 12
// How long the queue of picks waits for one step.
const STEP_MS = 3000
// How often the open list asks whether the band still holds the keyboard, and
// how many refusals in a row mean it does not (one can be a redraw in flight).
const WATCH_MS = 250
const WATCH_REFUSALS = 2
// How long the band draws nothing after a pick, so the keyboard goes back.
const RELEASE_MS = 150

const TITLE = 'הפרומטים שלי'
const HINT =
  'חצים למעלה ולמטה בוחרים · ימינה ושמאלה מחליפים קבוצה · Enter מכניס לתיבה · Esc סוגר'
const SHORT_HINT = '↑↓ בחירה · ←→ קבוצה · Enter · Esc'
// What `/my-menu` answers: the list opens only on the key. It is typed by
// hand, or it is what Ctrl+P still runs where the installer kept an earlier
// binding of the key (lib/keybind.mjs names those cases), so it also says
// what to do when the key itself brought this line.
const HOW =
  'הרשימה נפתחת ב-Ctrl+P. חצים למעלה ולמטה בוחרים, ימינה ושמאלה מחליפים קבוצה, Enter מכניס את הפרומט לתיבה, Esc סוגר. אם לחצת Ctrl+P וקיבלת את השורה הזאת, המקש עוד לא עודכן במחשב הזה: Ctrl+X ואז Tab פותחים את הרשימה, וסוכן יכול לעדכן את המקש עם update.sh של nadavai.'
// The focus ring's stops: the list of the page on screen, and the two beside it.
const listKey = (at: number): string => `list:${at}`
const BEFORE = 'before'
const AFTER = 'after'

// `line` is what a pick writes when it is not `/<name> <his words>`. A goal
// row also has `after`, what its line adds after his words (so a pick can
// tell when his words were cut), and may have `needs`, what he is told when
// the row was picked with nothing in the prompt box to work on.
type Row = {
  name: string
  sentence: string
  gloss: string
  line?: (words: string) => string
  after?: string
  needs?: string
}
type Group = { title: string; rows: Row[] }
// One page of the list: a group, or the part of it the band has room for.
// `start` is how many rows of the group came on the pages before it.
type Page = Group & { group: number; part: number; parts: number; start: number }

// What every goal line carries. The model that judges a goal reads only the
// conversation and runs nothing (Anthropic's page on /goal), so the end state
// and its check are in the line itself: a closing block the session prints,
// with the evidence beside every row. A line has one way to end, the one
// `working-style.md` (Finishing) gives a goal condition: everything closed
// with its evidence, or listed with a blocker that is not the session's.
// No line carries a cap of turns. A first version had one (25, or 15), from
// Anthropic's advice for unattended runs and two outside reads; its review
// counted his real goals, half of which ran longer than that (two overnight
// ones more than 400 evaluations), and at a cap Claude Code records the goal
// as achieved. His standing words are "do not stop until it is all closed",
// so a cap is his to add, not this file's. What waits for him stays waiting.
// The line also says that a bug found on the way is fixed (`working-style.md`,
// Code): in the trial runs sessions under a goal or a plan left one open.
const GOAL_GATES =
  'לא מבקשים מנדב לנקות את היעד בעצמו. תקלה שמתגלה בדרך מתוקנת מהשורש, בנפרד, ונכתבת בדוח. בדרך לא מוותרים על שום דבר שנדב ביקש ולא מקטינים אותו, ולא עושים מה שלפי הכללים מחכה לאישור שלו: כסף, הודעה או פרסום בשמו או בשם לקוח (גם הודעה שהאפליקציה שולחת לאדם אמיתי בגלל פעולה של הסשן), שחרור ציבורי בחנות, הגשה רשמית (מס, ממשלה, בנק) או חתימה מחייבת, מחיקה בלי דרך חזרה.'
// The closing block of a goal that works through the list "מה נחשב גמור": the
// list a session writes under that heading when he sets a goal or runs
// /nadavai:my-run.
const LIST_BLOCK =
  'שחוזר על כל שורה ברשימת "מה נחשב גמור", וליד כל אחת [סגור] עם הראיה שכבר מופיעה למעלה בשיחה (הפקודה שרצה והפלט שלה, או קישור שנפתח), או [חסום: נדב, לקוח, בדיקת חנות או פלטפורמה, תאריך או חומרה] עם מה שכבר מוכן, ואין בו שורה פתוחה שהיא של הסשן; שורה שחסומה כך לא מעכבת את סיום היעד'
// A trial of the client form (2026-11-14) ended on such a block, and the judge
// still sent the session back about nine times while four rows waited on him,
// until the session told him he could clear the goal himself: the block now
// says that a row blocked that way does not hold the goal, and the gates say
// that he is not asked to clear it.
// A long run is summarised on the way, and the judge then no longer sees the
// evidence: the line asks for the checks again before the block.
const goalEnd = (block: string): string =>
  `היעד מסתיים רק כשבתשובה האחרונה מופיע בלוק סגירה ${block}. אם השיחה סוכמה בדרך והראיה כבר לא מופיעה בה, מריצים את הבדיקה שוב לפני הבלוק. ${GOAL_GATES}`
// Claude Code takes a goal condition of up to this many characters.
const GOAL_CAP = 4000
// His words as one line that a sentence can follow: no line breaks, and no
// closing mark that would double with the period after them.
const asGoal = (words: string): string =>
  words
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,:;!?]+$/, '')
// How much of his words a goal line has room for, before what the row adds.
const goalRoom = (after: string): number => GOAL_CAP - after.length - 1
// The first `room` units of his words, and one less when the cut would fall
// inside a character that takes two (an emoji).
const head = (words: string, room: number): string =>
  words.slice(0, /[\uD800-\uDBFF]/.test(words.charAt(room - 1)) ? room - 1 : room)
// A goal line: his words first, as the subject, then what the row adds
// (`after`); with no words, what the row says by itself (`alone`). Words too
// long for a goal condition are cut, so the line still sets.
const goalLine = (words: string, after: string, alone: string): string => {
  const goal = asGoal(words)
  if (goal === '') return `/${GOAL} ${alone}`
  const room = goalRoom(after)

  return `/${GOAL} ${goal.length > room ? `${head(goal, room)}…` : goal}${after}`
}
const LONG_GOAL =
  'המילים שהקלדת ארוכות מדי לשורת יעד (עד 4000 תווים), והסוף שלהן נחתך. אפשר לשלוח את הטקסט המלא כהודעה רגילה, ואז לנעול יעד קצר.'
// The general row: his words are the goal itself, and the list decides when
// it is met. The line asks for the list first, and for a list made for this
// goal, so a session that has none, or only one from an earlier goal, cannot
// count the goal as met.
const LOCK_TAIL = ` קודם כותבים בסשן רשימת "מה נחשב גמור" ליעד הזה (אם אין), כל שורה דבר שאפשר לבדוק, ועובדים עליה עד הסוף. ${goalEnd(LIST_BLOCK)}`
const GOAL_READY = `היעד: לסיים את העבודה שביקשתי בסשן הזה.${LOCK_TAIL}`
const GOAL_AFTER_WORDS = `.${LOCK_TAIL}`
const GOAL_ROW: Row = {
  name: GOAL,
  sentence: 'לנעול את הסשן על היעד',
  gloss: 'הסשן לא עוצר עד שכל מה שנחשב גמור סגור',
  after: GOAL_AFTER_WORDS,
  line: words => goalLine(words, GOAL_AFTER_WORDS, GOAL_READY),
}

// The goal group (Nadav, 2026-11-14, asked for a group for goal mode whose
// rows are mostly the same prompts in a second form, "one with goal and one
// in the middle of a session", and that a row really turns goal mode on and
// runs the prompt). He picked six rows: the general one above, and the five
// forms here, each for work that runs without him and has an end that can be
// checked. A form's row shows the sentence of its prompt. Its line says the
// goal in full, because the judge of a goal cannot open a file, and names the
// prompt's file for the whole procedure, because a prompt only he can start
// cannot be started by the session. `needs` is what he is told when the row
// has no subject to work on (the prompt box was empty); '' where the row
// works without one. The texts and `needs` are this file's own.
const GOAL_GROUP = 'goal'
type GoalForm = {
  of: string
  gloss: string
  needs: string
  head: string
  block: string
}
const GOAL_FORMS: readonly GoalForm[] = [
  {
    of: 'takeover',
    gloss: 'goal: לא עוצר עד שהעבודה של הסשן ההוא באוויר',
    needs: 'קודם כותבים בתיבה איזה סשן להמשיך, ואז בוחרים את השורה שוב.',
    head: 'היעד: למצוא את הסשן שמתואר כאן ולסיים את העבודה שלו עד הסוף. מוצאים אותו לפי התיאור בכל כלי ובכל חשבון, גם אם הוא לא נפתח, ובודקים שהוא כבר לא רץ. קודם כותבים בעברית מה הייתה המטרה שם, איפה זה נעצר ומה פתוח, לפי בדיקה מול הקבצים, הענפים והאתר החי ולא לפי מה שנכתב שם. שום שליחה, מיזוג, העלאה, מחיקה או חיוב לא נעשים פעמיים. אחר כך כותבים רשימת "מה נחשב גמור" וסוגרים כל שורה בבדיקה אמיתית. עבודה שעולה לאוויר נגמרת כשהיא בענף הראשי, באוויר בכתובת, ונפתח לנדב קישור; תוכנית, מחקר או עיצוב נגמרים כשהם מוכנים ומוצגים לו, בלי לבנות מה שהוא לא ביקש לבנות; וגבול שנקבע בסשן ההוא נשמר.',
    block: LIST_BLOCK,
  },
  {
    of: 'case',
    gloss: 'goal: לא עוצר עד תיקון שנבדק באתר החי וטיוטת תשובה',
    needs: 'קודם כותבים בתיבה איזה לקוח ומה הוא כתב, ואז בוחרים את השורה שוב.',
    head: 'היעד: לטפל עד הסוף בתקלה או בבקשה של הלקוח שמתואר כאן. קוראים את כל השיחה איתו, עם התמונות והתשובות שכבר נשלחו, ורושמים כל בעיה וכל בקשה כשורה ברשימת "מה נחשב גמור". לכל תקלה: סיבת השורש (שלנו או של ספק), חיפוש של אותה תקלה במקומות אחרים, תיקון עם בדיקה אוטומטית, והעלאה לפי הכללים. שורה נסגרת רק אחרי שהמסלול שהלקוח עבר נוסה באתר החי, בחשבון הבדיקה כשהוא מראה אותו דבר, ובלי ששום הודעה תצא לאדם אמיתי. טיוטת התשובה ללקוח נכתבת לקובץ, רק ממה שנבדק, ולא נשלחת: השליחה מחכה לנדב.',
    block: `${LIST_BLOCK}, ובסופו הנתיב של קובץ הטיוטה`,
  },
  {
    of: 'study',
    gloss: 'goal: לא עוצר עד דף עם שלוש אפשרויות והמלצה אחת',
    needs: 'קודם כותבים בתיבה על מה המחקר ומה צריך להחליט, ואז בוחרים את השורה שוב.',
    head: 'היעד: מחקר עד המלצה אחת, לפני החלטה, על מה שכתוב כאן. לא בונים את הדבר עצמו ולא משלמים על שום דבר; לא מתקינים בפרויקט או במחשבים. ניסיון בתיקייה זמנית או חשבון חינמי שהבדיקה צריכה מותרים, ונכתבים בדוח. קודם בודקים מה כבר קיים אצלנו ומה נדב כבר דחה בעבר (הזיכרון של הפרויקטים). לפחות שלוש אפשרויות, כולל להשתמש במה שיש וכולל "לא צריך", כל טענה עם מקור שנקרא עכשיו (מחיר, מגבלות, עברית), והפרדה בין מה שנבדק למה שמשוער. התוצאה על דף אחד שנפתח לנדב. אם חסר תקציב או אילוץ שבלעדיו ההשוואה היא ניחוש, שואלים שאלה אחת, וממשיכים בינתיים במה שלא תלוי בתשובה.',
    block:
      'עם ארבע שורות: האפשרויות שנבדקו (לפחות שלושה שמות), ההמלצה האחת והסיבה החזקה נגדה, הקישור לדף שנפתח, ומה מחכה להחלטה של נדב; וכל מקור שבדף מופיע למעלה בשיחה כקישור שנקרא',
  },
  {
    of: 'design',
    gloss: 'goal: לא עוצר עד שגרסה ראשונה נבדקה בדפדפן ונפתחה לי',
    needs: 'קודם כותבים בתיבה מה לעצב, ואז בוחרים את השורה שוב.',
    head: 'היעד: גרסה ראשונה שרואים, של המסך, העיצוב או הדמו שמתואר כאן, נבדקת בדפדפן ונפתחת לנדב. קודם מסתכלים על מוצרים דומים ועל הדוגמה שהוא נתן; אם לא ברור כמה קרוב אליה ללכת, שואלים פעם אחת. כשאין כיוון מאושר מכינים שניים או שלושה כיוונים. עובדות שרק הוא יודע (שמות, תאריכים, כתובת) לא ממציאים. בודקים בדפדפן אמיתי, ברוחב שנדב רואה ובטלפון: עברית מימין לשמאל, בלי טקסט זמני, בלי שגיאות. פותחים לו ונותנים קישור. עוצרים בגרסה הראשונה ומחכים למה שיגיד, בלי סבבי ליטוש.',
    block:
      'עם שורה לכל כיוון או מסך: הקישור שנפתח, הבדיקה בדפדפן ברוחב רגיל ובטלפון שמופיעה למעלה בשיחה (הפקודה, הפלט שלה ושמות קובצי הצילום), ומה עוד גולמי; ובסופו מה מחכה למילה של נדב',
  },
  {
    of: 'stores',
    gloss: 'goal: עד שכל אפליקציה שבדרך לחנות הוגשה; השחרור מחכה לי',
    needs: '',
    head: 'היעד: להביא עד הגשה לבדיקה בשתי החנויות את האפליקציות שכתובות כאן (אם לא כתוב אילו: את כל האפליקציות שכבר יש להן רישום או בנייה בחנות), עם עדכון אוטומטי שעובד. אפליקציה שעוד לא התחילה שום דרך לחנות היא שורה שמחכה לנדב, עם השאלה אם להתחיל. קודם מדפיסים טבלה: כל אפליקציה מול כל חנות, המצב שלה (באוויר, בבדיקה, נדחתה, לא הוגשה) ומצב העדכונים, וזו רשימת "מה נחשב גמור". עובדים לפי הסקיל nadavai:store-apps. כל כניסה שרק נדב יכול לעשות מבקשים פעם אחת, בהתחלה, לכל האתרים יחד. מחכים לו ולא נעשים: שחרור לציבור, הרחבת הפצה, שינוי ברישום או במחיר, ובנייה שעולה כסף.',
    block: LIST_BLOCK,
  },
]
// Where a goal line sends the session for the whole procedure. The path is
// the checkout that the installer links the prompts from, on both machines.
const skillFile = (of: string): string =>
  `הנוהל המלא בקובץ ~/nadavai/plugins/nadavai/skills/my-${of}/SKILL.md (אם הוא לא נפתח, ממשיכים לפי מה שכתוב כאן).`
const formRow = (form: GoalForm, said: string): Row => {
  const alone = `${form.head} ${skillFile(form.of)} ${goalEnd(form.block)}`
  const after = `. ${alone}`

  return {
    name: `${GOAL}-${form.of}`,
    sentence: said,
    gloss: form.gloss,
    after,
    needs: form.needs,
    line: words => goalLine(words, after, alone),
  }
}

// Where the list stands: closed (the row of no height waits for the focus),
// open, or just picked from (the band draws nothing, so the keyboard returns
// to the prompt box). Kept in the session's state with the page on screen.
const stage = atom({ plugin: 'my-menu', key: 'stage' } as const, 'idle' as Stage)
const page = atom({ plugin: 'my-menu', key: 'page' } as const, 0)

const joined = (...parts: string[]): string =>
  parts
    .map(part => part.trim())
    .filter(part => part !== '')
    .join(' ')

// A text held to one row of `width` cells.
const cut = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text

// Where the sentence ends in a description: after its first "?", or before
// its first ":". -1 when the description has neither and is all sentence.
const split = (description: string): number => {
  const ask = description.indexOf('?')
  const colon = description.indexOf(':')
  if (ask !== -1 && (colon === -1 || ask < colon)) return ask + 1

  return colon
}

// The sentence he would say: the description up to its first "?" or ":".
const sentence = (description: string): string => {
  const text = description.trim()
  const end = split(text)

  return cut(end === -1 ? text : text.slice(0, end), 60)
}

// What he gets: the rest of the description, without its closing period.
const gloss = (description: string): string => {
  const text = description.trim()
  const end = split(text)
  if (end === -1) return ''

  return text
    .slice(end)
    .replace(/^[:\s]+/, '')
    .replace(/\.$/, '')
}

// How many rows each page of one group holds: full pages first, since the
// most used prompts come first, and a short last page evened out with the one
// before.
const pageSizes = (count: number, fit: number): number[] => {
  const pages = Math.ceil(count / fit)
  const sizes = Array.from({ length: pages }, (_, i) => Math.min(fit, count - i * fit))
  const last = sizes[pages - 1] ?? 0
  const before = sizes[pages - 2]
  if (before !== undefined && last < MIN_LAST_PAGE) {
    sizes[pages - 2] = Math.ceil((before + last) / 2)
    sizes[pages - 1] = before + last - Math.ceil((before + last) / 2)
  }

  return sizes
}

const widest = (texts: string[]): number =>
  Math.max(0, ...texts.map(text => text.length))

// The prompts this session can run, in their groups, read from the commands
// themselves, so a new nadavai:my-* skill shows up here without a second list
// to keep. No group at all when the session has none of the prompts.
const groups = async ($: EngineInterface): Promise<Group[]> => {
  const all = await $.command.list()
  const mine = all.filter(one => one.name.startsWith(PREFIX))
  if (mine.length === 0) return []
  const row = (one: { name: string; description: string }): Row => ({
    name: one.name,
    sentence: sentence(one.description),
    gloss: gloss(one.description),
  })
  const named = new Set(GROUPS.flatMap(group => group.names))
  const listed = GROUPS.map(group => ({
    title: group.title,
    rows: group.names.flatMap(name => {
      if (name === GOAL) return [GOAL_ROW]
      const one = mine.find(found => found.name === `${PREFIX}${name}`)

      return one ? [row(one)] : []
    }),
  }))
  const rest = mine
    .filter(one => !named.has(one.name.slice(PREFIX.length)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row)

  // The goal group: the general row and the form of every prompt this
  // session has. With no form to show it would only repeat the general row,
  // which the first group already holds, so it is left out.
  const forms = GOAL_FORMS.flatMap(form => {
    const one = mine.find(found => found.name === `${PREFIX}${form.of}`)

    return one ? [formRow(form, sentence(one.description))] : []
  })
  const goals = forms.length > 0 ? [GOAL_ROW, ...forms] : []

  return [...listed, { title: REST, rows: rest }, { title: GOAL_GROUP, rows: goals }].filter(
    group => group.rows.length > 0,
  )
}

// The pages the band turns through: each group, cut where it has more rows
// than the band has room for.
const pagesOf = (all: Group[], fit: number): Page[] =>
  all.flatMap((group, index) => {
    const sizes = pageSizes(group.rows.length, fit)

    return sizes.map((size, n) => {
      const start = sizes.slice(0, n).reduce((sum, one) => sum + one, 0)

      return {
        title: group.title,
        rows: group.rows.slice(start, start + size),
        group: index,
        part: n,
        parts: sizes.length,
        start,
      }
    })
  })

// What he is told when a pick ran past its time and left the box alone.
const LATE_PICK = 'הבחירה התעכבה ולא נכנסה לתיבה. אפשר לבחור שוב.'
const MISSING =
  'הפרומטים עוד לא נטענו בסשן הזה. מקלידים /reload-plugins ואז פותחים שוב.'

// False in a run with nobody at the keyboard (`claude -p`): no band is drawn
// there, so the list is printed instead.
let isInteractive = true

// What the band drew last: the key of the list on screen (the watch asks for
// the focus on it) and how many pages there are (a turn past the last page
// comes back to the first).
let drawn = { key: listKey(0), pages: 1 }

// The timer of the open list's watch; none while the list is closed.
let watcher: { cancel: () => void } | undefined
const stopWatch = (): void => {
  watcher?.cancel()
  watcher = undefined
}

// One pick at a time. A step has STEP_MS from the moment it starts (a call
// another plugin's hook answers late, or never, would otherwise hold every
// later step). After that the queue moves on, and the late step is told so:
// it may no longer write to the box, because the next step has begun.
let turn: Promise<unknown> = Promise.resolve()
const inTurn = <T,>(
  $: EngineInterface,
  work: (isLate: () => boolean) => Promise<T>,
): Promise<T> => {
  let late = false
  let release: () => void = () => undefined
  const after = new Promise<void>(resolve => {
    release = resolve
  })
  const step = async (): Promise<T> => {
    // Where the clock cannot wait, the queue waits for the step itself.
    void Promise.resolve()
      .then(() => $.clock.sleep(STEP_MS))
      .then(
        () => {
          late = true
          release()
        },
        () => undefined,
      )
    try {
      return await work(() => late)
    } finally {
      release()
    }
  }
  const done = turn.then(step, step)
  turn = after

  return done
}

// Whether the band still holds the keyboard: asks for the focus on the list,
// which is where it already is, so nothing moves while it does. Once he
// pressed Esc (or a dialog took the keys) the engine answers with a refusal.
// A call that fails says nothing either way.
const holdsKeyboard = ($: EngineInterface, requestId: string): Promise<'yes' | 'no' | 'unknown'> =>
  $.ui.focus({ requestId, key: drawn.key }).then(
    answer => (answer.deny === undefined ? 'yes' : 'no'),
    () => 'unknown',
  )

// While the list is open, the watch asks that a few times a second and closes
// the list once the band lost the keyboard. The engine's own timer runs it, a
// dispatch for each period: a wait inside the hook that opened the list would
// end with that hook's time. Where the engine gives no timer, or cannot say
// who holds the keyboard, the watch ends and the list stays until his next
// pick or send: a list that stays is better than one that closes under him.
const startWatch = ($: EngineInterface, requestId: string): void => {
  stopWatch()
  let refusals = 0
  let isAsking = false
  const ask = async (timer: { cancel: () => void }): Promise<void> => {
    if ((await read($, stage)) !== 'open') {
      timer.cancel()

      return
    }
    const held = await holdsKeyboard($, requestId)
    if (held === 'unknown') {
      timer.cancel()
      if (watcher === timer) watcher = undefined

      return
    }
    refusals = held === 'yes' ? 0 : refusals + 1
    if (refusals < WATCH_REFUSALS) return
    timer.cancel()
    // A watch that a newer one replaced closes nothing.
    if (watcher === timer) {
      watcher = undefined
      await update($, stage, now => (now === 'open' ? 'idle' : now))
    }
  }
  try {
    const timer = $.clock.every(WATCH_MS, () => {
      if (isAsking) return
      isAsking = true
      // A question that fails (the module was reloaded under its timer) ends
      // the watch.
      void ask(timer)
        .catch(() => timer.cancel())
        .finally(() => {
          isAsking = false
        })
    })
    watcher = timer
  } catch {
    watcher = undefined
  }
}

// Closes the list after a pick and hands the keyboard back to the prompt box:
// the band draws nothing for a moment, and then the row of no height again.
const handBack = async ($: EngineInterface): Promise<void> => {
  stopWatch()
  await update($, stage, () => 'gone')
  await $.clock.sleep(RELEASE_MS).catch(() => undefined)
  await update($, stage, now => (now === 'gone' ? 'idle' : now))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    // A reload of this module ends its watch, so a list it left open closes.
    stopWatch()
    await update($, stage, () => 'idle')
    await $.command.register({
      name: COMMAND,
      description: 'הפרומטים שלי: Ctrl+P פותח רשימה לבחירה בחצים',
      immediate: true,
    })

    return next(e)
  })

  // `/my-menu` typed by hand. With nobody at the keyboard it prints the list;
  // otherwise it says how the list opens, because only his key can give the
  // list the keyboard.
  on('command.run', { command: COMMAND }, async $ => {
    if (!isInteractive) {
      const all = await groups($)

      return {
        text:
          all.length === 0
            ? MISSING
            : all
                // The goal row is left out: printed, it would be a bare
                // `/goal`, which is not the line the row writes.
                .map(group => ({ ...group, rows: group.rows.filter(row => !row.line) }))
                .filter(group => group.rows.length > 0)
                .flatMap(group => [
                  `${group.title}:`,
                  ...group.rows.map(row => `/${row.name}  ${row.sentence}`),
                ])
                .join('\n'),
      }
    }
    $.ui.toast(HOW)

    return {}
  })

  // The focus ring of the band is about to move onto one of this mod's rows.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.element === undefined) return next(e)
    const now = await read($, stage)
    // The row of no height took the focus: he pressed the key. The list opens
    // on its first group, under the same key, so the focus stays on it.
    if (now === 'idle' && e.element === listKey(0)) {
      const moved = await next(e)
      if (moved.deny !== undefined) return moved
      await update($, page, () => 0)
      await update($, stage, () => 'open')
      startWatch($, e.requestId)

      return moved
    }
    // Left, Right or Tab moved the focus off the list: the next group, or the
    // one before. The focus is kept where it is; the list of the new group is
    // drawn under its own key and takes it, with the highlight on its top row.
    if (now === 'open' && e.origin.kind === 'person' && (e.element === AFTER || e.element === BEFORE)) {
      const step = e.element === AFTER ? 1 : -1
      const pages = Math.max(1, drawn.pages)
      await update($, page, at => (Math.min(at, pages - 1) + step + pages) % pages)

      return {}
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isInteractive || e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const now = await read($, stage)
    if (now === 'gone') return next(e)
    const { Box, Text, Button, Select } = $.ui.resolve(e)
    // A Button nobody sees: it is there for the focus to land on.
    const unseen = (key: string, hasFocusFirst: boolean, label: string) => (
      <Box height={0} overflow="hidden">
        <Button
          key={key}
          plain
          {...(hasFocusFirst ? { autoFocus: true as const } : {})}
          onPress={() => undefined}
        >
          {label}
        </Button>
      </Box>
    )
    if (now !== 'open') {
      drawn = { key: listKey(0), pages: 1 }

      return unseen(listKey(0), true, TITLE)
    }
    const all = await groups($)
    if (all.length === 0) {
      drawn = { key: listKey(0), pages: 1 }

      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            {INDENT}
            {MISSING}
          </Text>
          {unseen(listKey(0), true, TITLE)}
        </Box>
      )
    }
    const rows = all.flatMap(group => group.rows)

    // A short band gives its rows to the list: first the keys under it go,
    // then the groups above it.
    const hasTabs = e.props.maxRows >= ROWS_FOR_TABS
    const hasHint = e.props.maxRows >= ROWS_FOR_HINT
    const room = e.props.maxRows - (hasTabs ? 1 : 0) - (hasHint ? 1 : 0)
    const fit = Math.max(MIN_PER_PAGE, Math.min(MAX_PER_PAGE, room))
    const pages = pagesOf(all, fit)
    const at = Math.min(await read($, page), pages.length - 1)
    const shown = pages[at] ?? { title: '', rows: [], group: 0, part: 0, parts: 1, start: 0 }
    drawn = { key: listKey(at), pages: pages.length }

    // The cells a row's text may take. The columns are sized over every
    // prompt, not only this page's, so that they stay where they are when the
    // group turns. No row is wider than the band. The sentence is what he
    // reads to choose, so what he gets is cut first, and dropped where the
    // band is too narrow for it to say anything.
    const width = Math.max(MIN_WIDTH, e.props.bodyColumns - ROW_CHROME)
    const sentences = Math.min(widest(rows.map(row => row.sentence)), width)
    const glosses = Math.min(MAX_GLOSS, width - sentences - GAP, widest(rows.map(row => row.gloss)))
    const hasGloss = glosses >= MIN_GLOSS
    // A row's number is its place in its group, so a group the band cut into
    // parts counts on from one part to the next.
    const label = (row: Row, index: number): string => {
      const number = shown.start + index + 1
      const said = cut(row.sentence, sentences)
      const what = hasGloss ? cut(row.gloss, glosses) : ''

      return what === ''
        ? `${number}. ${said}`
        : `${number}. ${said}${' '.repeat(sentences - said.length + GAP)}${what}`
    }

    // The groups, with the one on screen marked. A group the band cut into
    // parts says which part this is. Where the band has no room for them all,
    // the group on screen stays, with its place among the groups.
    const tabs = all.map((group, index) =>
      index === shown.group && shown.parts > 1
        ? `${group.title} (חלק ${shown.part + 1} מתוך ${shown.parts})`
        : group.title,
    )
    const strip = tabs.reduce((sum, tab) => sum + tab.length + 4, INDENT.length)
    const hasAllTabs = strip <= e.props.bodyColumns
    const hasTitle = strip + TITLE.length + 2 <= e.props.bodyColumns
    const place =
      shown.parts > 1
        ? `  (קבוצה ${shown.group + 1} מתוך ${all.length}, חלק ${shown.part + 1} מתוך ${shown.parts})`
        : `  (${shown.group + 1} מתוך ${all.length})`
    const hint = INDENT.length + HINT.length <= e.props.bodyColumns ? HINT : SHORT_HINT

    return (
      <Box flexDirection="column">
        {hasTabs &&
          (hasAllTabs ? (
            <Text wrap="truncate-end">
              {INDENT}
              {hasTitle && <Text weight="bold">{`${TITLE}  `}</Text>}
              {tabs.map((tab, index) => (
                <Text
                  key={`tab:${index}`}
                  {...(index === shown.group ? { inverse: true } : { dimColor: true })}
                >
                  {`  ${tab}  `}
                </Text>
              ))}
            </Text>
          ) : (
            <Text wrap="truncate-end">
              {INDENT}
              <Text weight="bold">{shown.title}</Text>
              <Text dimColor>{place}</Text>
            </Text>
          ))}
        {unseen(BEFORE, false, 'הקבוצה הקודמת')}
        {/* A Select draws a line of its own above its rows (its label and the
            row picked last). The list has no use for it, so the Select is
            drawn one row up inside a box exactly as tall as its rows. */}
        <Box height={shown.rows.length} overflow="hidden" flexDirection="column">
          <Box marginTop={-1} flexDirection="column">
            <Select
              key={listKey(at)}
              autoFocus
              value={shown.rows[0]?.name ?? ''}
              options={shown.rows.map((row, index) => ({
                value: row.name,
                label: label(row, index),
              }))}
              onSelect={value => {
                const row = shown.rows.find(one => one.name === value)
                // A pick that fails after the session went away has nobody to tell.
                if (row) void inTurn($, isLate => choose($, row, isLate)).catch(() => undefined)
              }}
            />
          </Box>
        </Box>
        {unseen(AFTER, false, 'הקבוצה הבאה')}
        {hasHint && (
          <Text dimColor wrap="truncate-end">
            {INDENT}
            {hint}
          </Text>
        )}
      </Box>
    )
  })

  // He sent something while the list was open: the list closes.
  on('prompt.submit', async ($, e, next) => {
    const sent = await next(e)
    if ((await read($, stage)) === 'open') {
      stopWatch()
      await update($, stage, () => 'idle')
    }

    return sent
  })
}

// Puts `/<prompt> ` in the prompt box, with the words he had typed there as
// the prompt's arguments (the goal row writes its own line around them), and
// closes the list. A draft that began with another command gives up that
// command's name, not its words. Only a real command's name is given up,
// whole or without its plugin (`/nadavai:my-plain`, `/my-plain`): a path
// (`/tmp why`, `/tmp/log.txt ...`) is words.
const choose = async (
  $: EngineInterface,
  row: Row,
  isLate: () => boolean,
): Promise<void> => {
  const { text } = await $.prompt.read()
  // A pick that ran past its time changes nothing: the box and the list are
  // by then as the later steps set them. He is told to pick again.
  if (isLate()) {
    $.ui.toast(LATE_PICK)

    return
  }
  const draft = text.trim()
  const first = /^\/(\S+)(?:\s+|$)/.exec(draft)
  const commands = first ? await $.command.list().catch(() => []) : []
  const words =
    first && commands.some(one => one.name === first[1] || one.name.endsWith(`:${first[1]}`))
      ? draft.slice(first[0].length)
      : draft
  // A goal row that needs a subject writes nothing over an empty box: the
  // list closes, the keyboard is back in the box, and he is told what to type.
  if (row.needs && asGoal(words) === '') {
    await handBack($)
    $.ui.toast(row.needs)

    return
  }
  const line = row.line ? row.line(words) : `/${row.name} ${words}`
  if (isLate()) {
    $.ui.toast(LATE_PICK)

    return
  }
  const filled = await $.prompt.fill({ text: line }).catch(() => ({ isFilled: false }))
  // After a fill that ran past the time, the list belongs to the later steps.
  if (!isLate()) await handBack($)
  if (!filled.isFilled) $.ui.toast(`התיבה לא פנויה כרגע. מה שבחרת: ${line}`)
  else if (row.after !== undefined && asGoal(words).length > goalRoom(row.after))
    $.ui.toast(LONG_GOAL)
}
