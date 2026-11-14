import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted as MountedDrawing } from 'claude-code/testing'

// The band above the prompt box, as the terminal asks this mod to draw it.
const band = (bodyColumns = 150, maxRows = 14, hasSurvey = false) =>
  ({
    plugin: 'my-menu',
    component: 'AbovePrompt',
    surface: 'terminal',
    requestId: 'band',
    props: {
      hasSurvey,
      isCollapsed: false,
      isWorking: false,
      maxRows,
      bodyColumns,
      scroll: { offset: 0, bodyRows: maxRows - 1 },
      view: {},
    },
  }) as const

// What the session can run: two of his prompts from two groups, out of order,
// one that no group names, the printed menu itself and a built-in. With the
// goal row, which is always there, the list has three groups: "באמצע עבודה"
// (the goal row, status), "להבין ולהחליט" (plain) and "נוספים" (new).
const COMMANDS = [
  { name: 'compact', description: 'Compact the conversation', source: 'builtin' },
  {
    name: 'nadavai:my-plain',
    description: 'תסביר לי את זה בפשטות: מה היה, מה יהיה.',
    source: 'plugin',
  },
  { name: 'nadavai:my-new', description: 'פרומט חדש בלי סימן', source: 'plugin' },
  {
    name: 'nadavai:my-status',
    description: 'מה מצבנו? מה נעשה, מה רץ עכשיו.',
    source: 'plugin',
  },
  {
    name: 'nadavai:my',
    description: 'התפריט של הפרומטים שלי: איזה משפט מפעיל איזה פרומט.',
    source: 'plugin',
  },
] as const

// The rows, by the value the list keeps each under.
const STATUS = 'nadavai:my-status'
const PLAIN = 'nadavai:my-plain'
const GOAL = 'goal'
const NEW = 'nadavai:my-new'
// The focus ring's stops: the list of a page, and the two beside it.
const list = (at: number): string => `list:${at}`
const BEFORE = 'before'
const AFTER_STOP = 'after'
// What every goal line ends with, as the menu writes it: the closing block
// the session has to print, and what waits for him. No line caps the turns.
const GATES =
  'לא מבקשים מנדב לנקות את היעד בעצמו. תקלה שמתגלה בדרך מתוקנת מהשורש, בנפרד, ונכתבת בדוח. בדרך לא מוותרים על שום דבר שנדב ביקש ולא מקטינים אותו, ולא עושים מה שלפי הכללים מחכה לאישור שלו: כסף, הודעה או פרסום בשמו או בשם לקוח (גם הודעה שהאפליקציה שולחת לאדם אמיתי בגלל פעולה של הסשן), שחרור ציבורי בחנות, הגשה רשמית (מס, ממשלה, בנק) או חתימה מחייבת, מחיקה בלי דרך חזרה.'
const LIST_BLOCK =
  'שחוזר על כל שורה ברשימת "מה נחשב גמור", וליד כל אחת [סגור] עם הראיה שכבר מופיעה למעלה בשיחה (הפקודה שרצה והפלט שלה, או קישור שנפתח), או [חסום: נדב, לקוח, בדיקת חנות או פלטפורמה, תאריך או חומרה] עם מה שכבר מוכן, ואין בו שורה פתוחה שהיא של הסשן; שורה שחסומה כך לא מעכבת את סיום היעד'
const ends = (block: string): string =>
  `היעד מסתיים רק כשבתשובה האחרונה מופיע בלוק סגירה ${block}. אם השיחה סוכמה בדרך והראיה כבר לא מופיעה בה, מריצים את הבדיקה שוב לפני הבלוק. ${GATES}`
// The general goal row: for the work he asked for when the box was empty,
// for the goal he typed otherwise.
const LOCK_TAIL = ` קודם כותבים בסשן רשימת "מה נחשב גמור" ליעד הזה (אם אין), כל שורה דבר שאפשר לבדוק, ועובדים עליה עד הסוף. ${ends(LIST_BLOCK)}`
const READY = `/goal היעד: לסיים את העבודה שביקשתי בסשן הזה.${LOCK_TAIL}`
const AFTER = `.${LOCK_TAIL}`
// Where a goal form sends the session for the whole procedure.
const file = (of: string): string =>
  `הנוהל המלא בקובץ ~/nadavai/plugins/nadavai/skills/my-${of}/SKILL.md (אם הוא לא נפתח, ממשיכים לפי מה שכתוב כאן).`
// What he is told when his words were too long for a goal line.
const LONG =
  'המילים שהקלדת ארוכות מדי לשורת יעד (עד 4000 תווים), והסוף שלהן נחתך. אפשר לשלוח את הטקסט המלא כהודעה רגילה, ואז לנעול יעד קצר.'
type Command = { name: string; description: string; source: (typeof COMMANDS)[number]['source'] }

// What `/my-menu` typed by hand answers.
const HOW =
  'הרשימה נפתחת ב-Ctrl+P. חצים למעלה ולמטה בוחרים, ימינה ושמאלה מחליפים קבוצה, Enter מכניס את הפרומט לתיבה, Esc סוגר. אם לחצת Ctrl+P וקיבלת את השורה הזאת, המקש עוד לא עודכן במחשב הזה: Ctrl+X ואז Tab פותחים את הרשימה, וסוכן יכול לעדכן את המקש עם update.sh של nadavai.'
const LATE = 'הבחירה התעכבה ולא נכנסה לתיבה. אפשר לבחור שוב.'

// `/my-menu` as his Enter runs it, with what he typed after it.
const run = (args = '') =>
  ({
    command: 'my-menu',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  }) as const

type Box = {
  // The prompt box as the engine would hold it.
  text: string
  // Every text a fill wrote, in order.
  fills: string[]
  // False while a dialog holds the keys and the box takes nothing.
  isFree: boolean
  // Every toast shown.
  toasts: string[]
  // Called at each toast, for a test that waits for one.
  onToast?: () => void
  // False once he pressed Esc: the band no longer holds the keyboard, and the
  // engine refuses a move of its focus.
  hasKeyboard: boolean
  // Every element the focus was asked onto, in order.
  focus: string[]
}

const box = (text = '', isFree = true): Box => ({
  text,
  fills: [],
  isFree,
  toasts: [],
  hasKeyboard: true,
  focus: [],
})

// Stands in for the engine beneath the mod: the commands and a prompt box that
// takes fills while it is free.
// What a test can make the engine do wrong.
type Faults = {
  // The read answers what the box held when it was asked, after this settles.
  slowRead?: () => Promise<void> | undefined
  // The fill throws.
  isFillBroken?: () => boolean
  // The list of commands throws.
  isListBroken?: () => boolean
}

// A promise a test opens when it wants.
const gate = (): { wait: Promise<void>; open: () => void } => {
  let open: () => void = () => undefined
  const wait = new Promise<void>(resolve => {
    open = resolve
  })

  return { wait, open }
}

const engine = (
  on: On,
  held: Box,
  commands: readonly Command[] = COMMANDS,
  faults: Faults = {},
): void => {
  on('command.list', () => {
    if (faults.isListBroken?.()) throw new Error('no list')

    return { value: [...commands] }
  })
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', async () => {
    const text = held.text
    await faults.slowRead?.()

    return { value: { text, cursor: text.length } }
  })
  on('prompt.fill', (_, e) => {
    if (faults.isFillBroken?.()) throw new Error('no fill')
    if (!held.isFree) return { isFilled: false, text: held.text, cursor: 0 }
    held.text = e.text
    held.fills.push(e.text)

    return { isFilled: true, text: held.text, cursor: held.text.length }
  })
  on('ui.toast', (_, e) => {
    held.toasts.push(e.text)
    held.onToast?.()

    return { value: undefined }
  })
  // The engine's side of his move of the focus ring. The mod's own request
  // for the focus (how its watch learns that the band lost the keyboard) is
  // not answered here: this kit has no engine to resolve it, so that call
  // fails, as it would where the engine cannot say. The answers of a real
  // engine are covered by tests/my-menu-live.sh, in a real terminal.
  on('ui.focus', { plugin: '*' }, (_, e) => {
    held.focus.push(e.element ?? '')

    return held.hasKeyboard ? {} : { deny: 'that site does not hold the keyboard' }
  })
}

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

// His move of the band's focus onto one of the mod's elements: the key he
// opens the list with lands on the row of no height (`list:0`), and Left,
// Right and Tab on the two stops beside the list.
const move = ($: Engine, element: string) =>
  $.ui.focus({
    component: 'AbovePrompt',
    requestId: 'band',
    plugin: 'my-menu',
    element,
    origin: { kind: 'person' },
  })
const open = ($: Engine) => move($, list(0))

type Option = { value: string; label: string }
type Mounted = MountedDrawing<'terminal', 'AbovePrompt'>
// The list on screen: its key and its rows.
const shown = async (ui: Mounted): Promise<{ key: string | undefined; options: Option[] }> => {
  const found = await ui.find({ type: 'Select' })

  return { key: found?.key, options: (found?.props.options ?? []) as Option[] }
}
// The group marked in the row of groups.
const marked = async (ui: Mounted): Promise<string | undefined> =>
  (await ui.findAll({ type: 'Text' })).find(text => text.props.inverse === true)?.text.trim()

test('a closed list puts nothing on screen: one Button in a box of no height waits for the focus', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  const waiting = await ui.findAll({ type: 'Button' })

  expect(waiting.map(one => one.key)).toEqual([list(0)])
  expect(waiting[0]?.props.autoFocus).toBe(true)
  expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ height: 0, overflow: 'hidden' })
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('his key opens the list on the first group: numbered rows, the sentence and what he gets', async ($, on) => {
  const held = box()
  engine(on, held)

  await $.session.start(START)
  expect(await open($)).toEqual({})
  const ui = await $.ui.mount(band())
  const { key, options } = await shown(ui)

  // The list is drawn under the key the focus already stands on, and takes
  // the focus first in any new drawing.
  expect(key).toBe(list(0))
  expect((await ui.find({ type: 'Select' }))?.props.autoFocus).toBe(true)
  expect(held.focus).toEqual([list(0)])
  expect(options.map(option => option.value)).toEqual([GOAL, STATUS])
  expect(options[0]?.label).toMatch(/^1\. לנעול את הסשן על היעד +הסשן לא עוצר עד שכל מה שנחשב גמור סגור$/)
  expect(options[1]?.label).toMatch(/^2\. מה מצבנו\? +מה נעשה, מה רץ עכשיו$/)
  // What he gets starts in one column on every row.
  expect(new Set(options.map(option => option.label.indexOf('  ') + /^ +/.exec(option.label.slice(option.label.indexOf('  ')))![0].length)).size).toBe(1)
  // Above the list: every group, the one on screen marked. Under it: the keys.
  expect((await ui.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text).toMatch(
    /^ {2}הפרומטים שלי {4}באמצע עבודה {4}להבין ולהחליט {4}נוספים {2}$/,
  )
  expect(await marked(ui)).toBe('באמצע עבודה')
  expect((await ui.find({ type: 'Text', text: /Esc סוגר/ }))?.text).toMatch(/חצים למעלה ולמטה בוחרים/)
  // The two stops beside the list are there for the focus, in boxes of no height.
  expect((await ui.findAll({ type: 'Button' })).map(one => one.key)).toEqual([BEFORE, AFTER_STOP])
  await ui.unmount()
})

test('left and right turn the groups and come back around, and the focus is never let onto a stop', async ($, on) => {
  const held = box()
  engine(on, held)

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())

  // Left (and Tab) is the engine's "next": the group after this one, under a
  // key of its own, so the list is drawn anew with its top row highlighted.
  expect(await move($, AFTER_STOP)).toEqual({})
  await ui.redraw()
  expect(await shown(ui)).toEqual({
    key: list(1),
    options: [{ value: PLAIN, label: expect.stringMatching(/^1\. תסביר לי את זה בפשטות +מה היה, מה יהיה$/) }],
  })
  expect(await marked(ui)).toBe('להבין ולהחליט')

  await move($, AFTER_STOP)
  await ui.redraw()
  expect((await shown(ui)).options.map(option => option.value)).toEqual([NEW])
  expect(await marked(ui)).toBe('נוספים')

  // Past the last group: the first again. Right from the first: the last.
  await move($, AFTER_STOP)
  await ui.redraw()
  expect((await shown(ui)).key).toBe(list(0))
  await move($, BEFORE)
  await ui.redraw()
  expect((await shown(ui)).key).toBe(list(2))
  expect(await marked(ui)).toBe('נוספים')

  // The engine was asked to move the focus only when he opened the list.
  expect(held.focus).toEqual([list(0)])
  await ui.unmount()
})

test('the groups come in his order, and a prompt no group names comes last', async ($, on) => {
  const one = (name: string, description: string): Command => ({
    name: `nadavai:my-${name}`,
    description,
    source: 'plugin',
  })
  // With the seven prompts he was shown in their groups when he picked this
  // order: run, status and fast; prove, done and review; wrong and never.
  engine(on, box(), [
    one('new', 'פרומט חדש בלי סימן'),
    one('never', 'למה זה קרה, ושלא יקרה שוב: הסיבה.'),
    one('machine', 'המחשב נתקע או מלא: מה מכביד עכשיו.'),
    one('wrong', 'זה לא מה שהתכוונתי: מה ביקשתי.'),
    one('other', 'תקרא את הסשן האחר: להמשיך ממנו.'),
    one('method', 'הדרך שלנו נכונה, או כפולה ובזבוז זמן? מה כפול.'),
    one('best', 'זו הדרך הכי טובה? חלופות עם מחיר.'),
    one('review', 'תעבור על כל הסשן: בודקים חדשים.'),
    one('prove', 'אתה בטוח? בדיקה מחדש עכשיו.'),
    one('done', 'סיימנו את הכול? כל בקשה שלי.'),
    one('fast', 'למה זה לוקח כל כך הרבה זמן? לאן הולך הזמן.'),
    one('status', 'מה מצבנו? מה נעשה.'),
    one('connected', 'התחברתי: בדיקה שהחיבור עובד.'),
    one('run', 'תמשיך עד הסוף בלי לעצור: רשימה.'),
    one('study', 'צא למחקר לפני החלטה: שלוש אפשרויות.'),
    one('takeover', 'תמשיך את הסשן ההוא עד הסוף: מוצא אותו.'),
    one('stores', 'מה מצב האפליקציות בחנויות? טבלה.'),
  ])

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  const seen: string[] = []
  for (let n = 0; n < 8; n += 1) {
    const names = (await shown(ui)).options.map(option => option.value.replace('nadavai:my-', ''))
    seen.push(`${await marked(ui)} = ${names.join(' ')}`)
    await move($, AFTER_STOP)
    await ui.redraw()
  }

  expect(seen).toEqual([
    'באמצע עבודה = run goal connected status fast',
    // The prompts for the main goals come second: the list still opens on
    // the group he uses most.
    'משימה חדשה = takeover study stores',
    'בודקים = done prove review',
    'להבין ולהחליט = best method',
    'להראות, לשלוח ולשמור = other',
    'משהו לא טוב = machine wrong never',
    'נוספים = new',
    // The goal group is last: the general row, then the form of each prompt
    // the session has, in the group's own order.
    'goal = goal goal-takeover goal-study goal-stores',
  ])
  // The eighth turn came back to the first group.
  expect((await shown(ui)).options[0]?.value).toBe('nadavai:my-run')
  await ui.unmount()
})

test('Enter on a row puts the prompt in the box with the words he had typed there, and closes the list', async ($, on) => {
  const held = box('רק מאתמול')
  engine(on, held)

  await $.session.start(START)
  await open($)
  // Opening leaves his words where he typed them.
  expect(held.fills).toEqual([])
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })

  expect(held.fills).toEqual(['/nadavai:my-status רק מאתמול'])
  await ui.redraw()
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).map(one => one.key)).toEqual([list(0)])
  await ui.unmount()
})

test('a pick only fills the box and submits nothing', async ($, on) => {
  const held = box()
  engine(on, held)
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })

  expect(held.text).toBe('/nadavai:my-status ')
  expect(sent).toEqual([])
  await ui.unmount()
})

// The session of these tests has the five prompts that have a goal form.
const FORMS = [
  { name: 'nadavai:my-status', description: 'מה מצבנו? מה נעשה.', source: 'plugin' },
  {
    name: 'nadavai:my-takeover',
    description: 'תמשיך את הסשן ההוא עד הסוף: מוצא אותו, ומסיים.',
    source: 'plugin',
  },
  { name: 'nadavai:my-case', description: 'לקוח דיווח על תקלה או ביקש משהו: הכול נקרא.', source: 'plugin' },
  { name: 'nadavai:my-study', description: 'צא למחקר לפני החלטה: שלוש אפשרויות.', source: 'plugin' },
  { name: 'nadavai:my-design', description: 'תעצב או תכין דמו שרואים: נפתח לי מיד.', source: 'plugin' },
  { name: 'nadavai:my-stores', description: 'מה מצב האפליקציות בחנויות? טבלה.', source: 'plugin' },
] as const
// The page of the goal group in that session: "באמצע עבודה", "משימה חדשה", goal.
const GOALS = 2
// Opens the list on the goal group, with `words` in the prompt box.
const goals = async ($: Engine, ui: Mounted, held: Box, words: string): Promise<void> => {
  held.text = words
  await open($)
  await ui.redraw()
  // The band learns how many groups there are when it draws: a turn follows a draw.
  for (let n = 0; n < GOALS; n += 1) {
    await move($, AFTER_STOP)
    await ui.redraw()
  }
}

test('the goal group shows the general row and each prompt that has a goal form, by its sentence', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, '')

  expect(await marked(ui)).toBe('goal')
  const { options } = await shown(ui)
  expect(options.map(option => option.value)).toEqual([
    GOAL,
    'goal-takeover',
    'goal-case',
    'goal-study',
    'goal-design',
    'goal-stores',
  ])
  // A form's row is the prompt's own sentence, and says what the goal ends on.
  const second = options[1]?.label ?? ''
  expect(second.startsWith('2. תמשיך את הסשן ההוא עד הסוף  ')).toBe(true)
  expect(second.endsWith('  goal: לא עוצר עד שהעבודה של הסשן ההוא באוויר')).toBe(true)
  expect(options[5]?.label.startsWith('6. מה מצב האפליקציות בחנויות?')).toBe(true)
  await ui.unmount()
})

test('a session without any of those prompts has no goal group: the general row is in the first group', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  const titles: string[] = []
  // One turn more than the groups there are: it comes back to the first, so
  // a goal group after them would show.
  for (let n = 0; n < 4; n += 1) {
    titles.push((await marked(ui)) ?? '')
    await move($, AFTER_STOP)
    await ui.redraw()
  }

  expect(titles).toEqual(['באמצע עבודה', 'להבין ולהחליט', 'נוספים', 'באמצע עבודה'])
  await ui.unmount()
})

test('a goal form writes a goal line with his words first, its own end and what waits for him, and no cap of turns', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, 'הסשן של הקופה מאתמול.')
  await ui.select({ key: list(GOALS), value: 'goal-takeover' })

  const line = held.text
  // Goal mode is what his Enter turns on: the line is a /goal command, with
  // his words as its subject (their closing mark does not double).
  expect(line.startsWith('/goal הסשן של הקופה מאתמול. היעד: למצוא את הסשן שמתואר כאן')).toBe(true)
  // The whole procedure is the prompt's file, named in the line.
  expect(line).toContain(file('takeover'))
  // Only work that ships has to go live; a plan or a research is shown.
  expect(line).toContain('עבודה שעולה לאוויר נגמרת כשהיא בענף הראשי, באוויר בכתובת')
  expect(line).toContain('תוכנית, מחקר או עיצוב נגמרים כשהם מוכנים ומוצגים לו')
  expect(line).toContain('וגבול שנקבע בסשן ההוא נשמר')
  // The end that the judge of a goal can read in the conversation, and what
  // stays waiting for him. Nothing in the line ends the goal with work open.
  expect(line.endsWith(ends(LIST_BLOCK))).toBe(true)
  expect(line).not.toContain('תורים')
  expect(line.length).toBeLessThanOrEqual('/goal '.length + 4000)
  expect(held.toasts).toEqual([])
  await ui.unmount()
})

test('each form says its own end: the research ends on a page and a recommendation', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, 'מערכת זיכרון לסוכנים')
  await ui.select({ key: list(GOALS), value: 'goal-study' })

  expect(held.text.startsWith('/goal מערכת זיכרון לסוכנים. היעד: מחקר עד המלצה אחת')).toBe(true)
  // Money waits for him; a free account or a trial in a scratch folder does not.
  expect(held.text).toContain('לא בונים את הדבר עצמו ולא משלמים על שום דבר')
  expect(held.text).toContain('חשבון חינמי שהבדיקה צריכה מותרים')
  // A question to him does not end the goal: the work goes on meanwhile.
  expect(held.text).toContain('שואלים שאלה אחת, וממשיכים בינתיים במה שלא תלוי בתשובה')
  expect(held.text).toContain(file('study'))
  expect(held.text).toContain('ההמלצה האחת והסיבה החזקה נגדה')
  expect(held.text.endsWith(GATES)).toBe(true)
  expect(held.text).not.toContain('תורים')
  await ui.unmount()
})

// Each form that needs a subject, and what it says over an empty box.
const NEEDS = [
  ['goal-takeover', 'קודם כותבים בתיבה איזה סשן להמשיך, ואז בוחרים את השורה שוב.'],
  ['goal-case', 'קודם כותבים בתיבה איזה לקוח ומה הוא כתב, ואז בוחרים את השורה שוב.'],
  ['goal-study', 'קודם כותבים בתיבה על מה המחקר ומה צריך להחליט, ואז בוחרים את השורה שוב.'],
  ['goal-design', 'קודם כותבים בתיבה מה לעצב, ואז בוחרים את השורה שוב.'],
] as const
for (const [value, told] of NEEDS)
  test(`${value} needs a subject: over an empty box it writes nothing, closes the list and says what to type`, async ($, on) => {
    const held = box()
    engine(on, held, FORMS)
    const clock = mock.clock(on)

    await $.session.start(START)
    const ui = await $.ui.mount(band())
    await goals($, ui, held, '   ')
    const said = gate()
    held.onToast = said.open
    const picked = ui.select({ key: list(GOALS), value })
    await clock.advance(150)
    await picked
    await said.wait

    expect(held.fills).toEqual([])
    expect(held.toasts).toEqual([told])
    // The list is closed: the row of no height is all the band holds.
    await ui.redraw()
    expect((await ui.findAll({ type: 'Select' })).length).toBe(0)
    await ui.unmount()
  })

test('the stores form works over an empty box: it is about every app that is already on its way to a store', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, '')
  await ui.select({ key: list(GOALS), value: 'goal-stores' })

  expect(held.text.startsWith('/goal היעד: להביא עד הגשה לבדיקה בשתי החנויות')).toBe(true)
  expect(held.text).toContain('את כל האפליקציות שכבר יש להן רישום או בנייה בחנות')
  expect(held.text).toContain('אפליקציה שעוד לא התחילה שום דרך לחנות היא שורה שמחכה לנדב')
  expect(held.text).toContain('שחרור לציבור, הרחבת הפצה, שינוי ברישום או במחיר')
  // Submitting to review is the goal; what waits is an official filing.
  expect(held.text).toContain('הגשה רשמית (מס, ממשלה, בנק) או חתימה מחייבת')
  expect(held.text).not.toContain('תורים')
  expect(held.toasts).toEqual([])
  await ui.unmount()
})

test('the client form keeps the answer a draft and tries the fix as the client did, in the QA account', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, 'דני כתב שהייצוא לא עובד')
  await ui.select({ key: list(GOALS), value: 'goal-case' })

  expect(held.text.startsWith('/goal דני כתב שהייצוא לא עובד. היעד: לטפל עד הסוף בתקלה או בבקשה של הלקוח')).toBe(true)
  expect(held.text).toContain('בחשבון הבדיקה כשהוא מראה אותו דבר, ובלי ששום הודעה תצא לאדם אמיתי')
  expect(held.text).toContain('ולא נשלחת: השליחה מחכה לנדב')
  expect(held.text).toContain(file('case'))
  expect(held.text.endsWith(ends(`${LIST_BLOCK}, ובסופו הנתיב של קובץ הטיוטה`))).toBe(true)
  expect(held.text).not.toContain('תורים')
  await ui.unmount()
})

test('the design form stops at the first version and waits for his word', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, 'מסך הבית של הקופה')
  await ui.select({ key: list(GOALS), value: 'goal-design' })

  expect(held.text.startsWith('/goal מסך הבית של הקופה. היעד: גרסה ראשונה שרואים')).toBe(true)
  expect(held.text).toContain('עוצרים בגרסה הראשונה ומחכים למה שיגיד, בלי סבבי ליטוש')
  expect(held.text).toContain(file('design'))
  expect(held.text).toContain('ובסופו מה מחכה למילה של נדב')
  expect(held.text.endsWith(GATES)).toBe(true)
  expect(held.text).not.toContain('תורים')
  await ui.unmount()
})

test('words too long for a goal form are cut to a line that still sets, and he is told', async ($, on) => {
  const held = box()
  engine(on, held, FORMS)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  await goals($, ui, held, 'מילה '.repeat(1000))
  await ui.select({ key: list(GOALS), value: 'goal-takeover' })

  expect(held.text.length).toBe('/goal '.length + 4000)
  expect(held.text).toContain('…. היעד: למצוא את הסשן')
  expect(held.toasts).toEqual([LONG])
  await ui.unmount()
})

test('the goal row writes a ready goal line, and his words become the goal', async ($, on) => {
  const held = box()
  engine(on, held)

  await $.session.start(START)
  const ui = await $.ui.mount(band())
  // He types, opens the list and presses Enter on the goal row.
  const goal = async (words: string): Promise<string> => {
    held.text = words
    await open($)
    await ui.redraw()
    await ui.select({ key: list(0), value: GOAL })

    return held.text
  }

  expect(await goal('')).toBe(READY)
  // With words in the box: they are the goal, and the list of what counts as
  // done still decides when it is met.
  expect(await goal('לסיים את מסך ההזמנות')).toBe(`/goal לסיים את מסך ההזמנות${AFTER}`)
  // A draft that began with a prompt gives up the prompt's name, as for any row.
  expect(await goal('/nadavai:my-plain the login bug')).toBe(`/goal the login bug${AFTER}`)
  // His closing mark does not double with the period, and a draft of several
  // lines becomes one line.
  expect(await goal('לסיים את מסך ההזמנות?\nוגם את הדוח.')).toBe(
    `/goal לסיים את מסך ההזמנות? וגם את הדוח${AFTER}`,
  )
  // Only marks in the box: there are no words, so the line is the ready one.
  expect(await goal('...')).toBe(READY)
  expect(held.toasts).toEqual([])

  // Words longer than a goal condition may be are cut so that the line still
  // sets (Claude Code takes up to 4000 characters), and he is told.
  const long = await goal('מילה '.repeat(1000))
  expect(long.length).toBe('/goal '.length + 4000)
  expect(long.endsWith(`…${AFTER}`)).toBe(true)
  expect(held.toasts).toEqual([LONG])

  // At the edge: words that just fit are whole and say nothing, and one
  // character more is cut to a condition of exactly 4000.
  const room = 4000 - AFTER.length - 1
  expect(await goal('א'.repeat(room))).toBe(`/goal ${'א'.repeat(room)}${AFTER}`)
  expect(held.toasts).toEqual([LONG])
  const over = await goal('א'.repeat(room + 1))
  expect(over).toBe(`/goal ${'א'.repeat(room)}…${AFTER}`)
  expect(over.length).toBe('/goal '.length + 4000)
  expect(held.toasts).toEqual([LONG, LONG])
  // A character of two units at the cut is left out whole, not cut in half.
  const half = await goal(`${'א'.repeat(room - 1)}😀`)
  expect(half).toBe(`/goal ${'א'.repeat(room - 1)}…${AFTER}`)
  await ui.unmount()
})

// What a pick of the status row writes over each draft.
const picked = async ($: Engine, held: Box): Promise<string> => {
  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })
  await ui.unmount()

  return held.text
}

test('a draft that began with another command keeps its words', async ($, on) => {
  const held = box('/compact the login bug')
  engine(on, held)

  expect(await picked($, held)).toBe('/nadavai:my-status the login bug')
})

test('a draft that starts with a prompt named without its plugin gives up the name', async ($, on) => {
  const held = box('/my-plain the login bug')
  engine(on, held)

  expect(await picked($, held)).toBe('/nadavai:my-status the login bug')
})

test('a draft that starts with a path keeps the path', async ($, on) => {
  const held = box('/tmp/log.txt has the error')
  engine(on, held)

  expect(await picked($, held)).toBe('/nadavai:my-status /tmp/log.txt has the error')
})

test('a draft that starts with a short path is words, not a command', async ($, on) => {
  const held = box('/tmp why is it full')
  engine(on, held)

  expect(await picked($, held)).toBe('/nadavai:my-status /tmp why is it full')
})

test('a pick still works when the list of commands cannot be read', async ($, on) => {
  const held = box('/compact the login bug')
  let isBroken = false
  engine(on, held, COMMANDS, { isListBroken: () => isBroken })

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  isBroken = true
  await ui.select({ key: list(0), value: STATUS })

  // Without the list a leading command cannot be told from words: all stay.
  expect(held.text).toBe('/nadavai:my-status /compact the login bug')
  await ui.unmount()
})

test('a box that takes nothing keeps his words, and he is shown what he picked', async ($, on) => {
  const held = box('מילים שלי', false)
  engine(on, held)

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })

  expect(held.text).toBe('מילים שלי')
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. מה שבחרת: /nadavai:my-status מילים שלי'])
  await ui.redraw()
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})

test('a pick whose fill fails shows what he picked', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held, COMMANDS, { isFillBroken: () => true })

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })

  expect(held.text).toBe('מילים שלי')
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. מה שבחרת: /nadavai:my-status מילים שלי'])
  await ui.unmount()
})

test('a narrow band leaves out what he gets, keeps the sentence, and names the group on screen', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band(40))

  expect((await shown(ui)).options.map(option => option.label)).toEqual([
    '1. לנעול את הסשן על היעד',
    '2. מה מצבנו?',
  ])
  // No room for every group: the one on screen, and its place among them.
  expect((await ui.find({ type: 'Text', text: /מתוך/ }))?.text).toBe('  באמצע עבודה  (1 מתוך 3)')
  expect((await ui.find({ type: 'Text', text: /Esc/ }))?.text).toBe('  ↑↓ בחירה · ←→ קבוצה · Enter · Esc')
  await ui.unmount()
})

test('no row is wider than the band leaves it, at any width', async ($, on) => {
  const one = (name: string, description: string): Command => ({
    name: `nadavai:my-${name}`,
    description,
    source: 'plugin',
  })
  engine(on, box(), [
    one('run', 'תמשיך עד הסוף בלי לעצור: רשימת מה נחשב גמור, עבודה במקביל, ועצירה רק על מה שמחכה לי.'),
    one('fast', 'למה זה לוקח כל כך הרבה זמן? לאן הולך הזמן, מה אפשר במקביל, ומה מקצר בלי לוותר על איכות.'),
  ])

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band(150))
  for (const columns of [150, 100, 72, 50, 30, 14]) {
    await ui.redraw({ ...band(columns).props })
    const { options } = await shown(ui)
    // The Select indents a row by two cells and keeps three free at its end.
    for (const option of options) expect(option.label.length).toBeLessThanOrEqual(Math.max(12, columns - 8) + 3)
    expect(options.map(option => option.value)).toEqual(['nadavai:my-run', GOAL, 'nadavai:my-fast'])
  }
  await ui.unmount()
})

test('a band that is narrow and short says the group and the part apart, both in words', async ($, on) => {
  const one = (name: string): Command => ({
    name: `nadavai:my-${name}`,
    description: `משפט ${name}? מה מקבלים`,
    source: 'plugin',
  })
  // Six rows in the first group and room for three; one row in the second group.
  engine(on, box(), ['run', 'resume', 'connected', 'status', 'self', 'done'].map(one))

  await $.session.start(START)
  await open($)
  // Four rows of band: the group, three rows of list. Forty columns: no room to name every group.
  const ui = await $.ui.mount(band(40, 4))

  expect((await ui.find({ type: 'Text', text: /מתוך/ }))?.text).toBe(
    '  באמצע עבודה  (קבוצה 1 מתוך 2, חלק 1 מתוך 2)',
  )
  await move($, AFTER_STOP)
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: /מתוך/ }))?.text).toBe(
    '  באמצע עבודה  (קבוצה 1 מתוך 2, חלק 2 מתוך 2)',
  )
  await move($, AFTER_STOP)
  await ui.redraw()
  // The second group is whole, and without a part to name the two groups fit in one row.
  expect(await marked(ui)).toBe('בודקים')
  expect(await ui.find({ type: 'Text', text: /מתוך/ })).toBeUndefined()
  await ui.unmount()
})

test('a group with more rows than the band has room for comes in parts, numbered on, and no part is one row alone', async ($, on) => {
  const one = (name: string): Command => ({
    name: `nadavai:my-${name}`,
    description: `משפט ${name}? מה מקבלים`,
    source: 'plugin',
  })
  // Six rows in the first group (five prompts and the goal row) and room for five.
  engine(on, box(), ['run', 'resume', 'connected', 'status', 'self'].map(one))

  await $.session.start(START)
  await open($)
  // Seven rows of band: the groups, five rows of list, the keys.
  const ui = await $.ui.mount(band(150, 7))

  const first = await shown(ui)
  expect(first.options.map(option => option.label.slice(0, 2))).toEqual(['1.', '2.', '3.'])
  expect(await marked(ui)).toBe('באמצע עבודה (חלק 1 מתוך 2)')
  await move($, AFTER_STOP)
  await ui.redraw()
  const second = await shown(ui)
  expect(second.key).toBe(list(1))
  expect(second.options.map(option => option.label.slice(0, 2))).toEqual(['4.', '5.', '6.'])
  expect(await marked(ui)).toBe('באמצע עבודה (חלק 2 מתוך 2)')
  // One group in two parts: the turn after the second part is the first again.
  await move($, AFTER_STOP)
  await ui.redraw()
  expect((await shown(ui)).key).toBe(list(0))
  await ui.unmount()
})

test('a group never shows more rows than the eight the list of the engine draws', async ($, on) => {
  // Nine prompts no group names: they all land in the group of the rest.
  const nine = Array.from(
    { length: 9 },
    (_, i): Command => ({
      name: `nadavai:my-extra${i + 1}`,
      description: `משפט ${i + 1}? מה מקבלים`,
      source: 'plugin',
    }),
  )
  engine(on, box(), nine)

  await $.session.start(START)
  await open($)
  // A tall band: room is not what cuts the group.
  const ui = await $.ui.mount(band(150, 20))
  await move($, AFTER_STOP)
  await ui.redraw()
  const first = await shown(ui)
  expect(first.options.length).toBeLessThanOrEqual(8)
  expect(await marked(ui)).toBe('נוספים (חלק 1 מתוך 2)')
  await move($, AFTER_STOP)
  await ui.redraw()
  const second = await shown(ui)
  expect(first.options.length + second.options.length).toBe(9)
  await ui.unmount()
})

test('a short band gives its rows to the list: first the keys go, then the groups', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band(150, 4))
  expect(await ui.find({ type: 'Text', text: /Esc/ })).toBeUndefined()
  expect(await marked(ui)).toBe('באמצע עבודה')
  expect((await shown(ui)).options).toHaveLength(2)

  await ui.redraw({ ...band(150, 2).props })
  expect(await ui.findAll({ type: 'Text' })).toEqual([])
  expect((await shown(ui)).options).toHaveLength(2)

  // One row of band: one row of list at a time, still under its number.
  await ui.redraw({ ...band(150, 1).props })
  expect((await shown(ui)).options.map(option => option.label.slice(0, 2))).toEqual(['1.'])
  await move($, AFTER_STOP)
  await ui.redraw({ ...band(150, 1).props })
  expect((await shown(ui)).options.map(option => option.label.slice(0, 2))).toEqual(['2.'])
  await ui.unmount()
})

test('the list is drawn one row up in a box as tall as its rows, so the line a Select adds is not seen', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  const boxes = await ui.findAll({ type: 'Box' })

  expect(boxes.some(one => one.props.height === 2 && one.props.overflow === 'hidden')).toBe(true)
  expect(boxes.some(one => one.props.marginTop === -1)).toBe(true)
  await ui.unmount()
})

test('a session without the prompts says how to load them, and the focus still has a place', async ($, on) => {
  engine(on, box(), [COMMANDS[0]])

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())

  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/reload-plugins/)
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).map(one => one.key)).toEqual([list(0)])
  await ui.unmount()
})

test('a survey in the band comes first', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band(150, 14, true))

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()
})

test('a focus the engine refuses opens nothing', async ($, on) => {
  const held = box()
  held.hasKeyboard = false
  engine(on, held)

  await $.session.start(START)
  expect(await open($)).toEqual({ deny: 'that site does not hold the keyboard' })
  const ui = await $.ui.mount(band())

  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})

test('sending something else closes the list', async ($, on) => {
  const held = box()
  engine(on, held)
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Select' })).toBeDefined()
  await $.prompt.submit({ text: 'שאלה', wait: false, origin: { kind: 'composer' } })
  await ui.redraw()

  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect(held.fills).toEqual([])
  await ui.unmount()
})

test('a reload of the mod closes a list it left open', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Select' })).toBeDefined()
  await $.session.start(START)
  await ui.redraw()

  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})

test('where the engine cannot say who holds the keyboard, the list stays open and the watch ends', async ($, on) => {
  const clock = mock.clock(on)
  const held = box()
  engine(on, held)

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())

  // The watch's first question fails (nothing here answers it): the list is
  // not closed under him, and he can still pick from it.
  await clock.advance(5000)
  await ui.redraw()
  expect(await ui.find({ type: 'Select' })).toBeDefined()
  await ui.select({ key: list(0), value: STATUS })
  expect(held.text).toBe('/nadavai:my-status ')
  await ui.unmount()
})

test('after a pick the band draws nothing for a moment, so the keyboard goes back to the box', async ($, on) => {
  const clock = mock.clock(on)
  const held = box()
  engine(on, held)

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  await ui.select({ key: list(0), value: STATUS })
  expect(held.text).toBe('/nadavai:my-status ')

  await ui.redraw()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.keepsBeneath()).toBe(true)

  await clock.advance(150)
  await ui.redraw()
  expect((await ui.findAll({ type: 'Button' })).map(one => one.key)).toEqual([list(0)])
  await ui.unmount()
})

test('a pick that ran past its time changes nothing, and tells him', async ($, on) => {
  const clock = mock.clock(on)
  const held = box('מילים שלי')
  const asked = gate()
  const slow = gate()
  const told = gate()
  held.onToast = told.open
  let isFirst = true
  engine(on, held, COMMANDS, {
    slowRead: () => {
      if (!isFirst) return undefined
      isFirst = false
      asked.open()

      return slow.wait
    },
  })

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  // The pick reads the box and the answer is slow: three seconds pass.
  void ui.select({ key: list(0), value: STATUS })
  await asked.wait
  await clock.advance(3000)
  slow.open()
  await told.wait

  expect(held.fills).toEqual([])
  expect(held.text).toBe('מילים שלי')
  expect(held.toasts).toEqual([LATE])
  await ui.unmount()
})

test('with nobody at the keyboard the list is printed and nothing is drawn', async ($, on) => {
  engine(on, box())

  await $.session.start({ ...START, isInteractive: false })
  const printed = await $.command.run(run())
  const ui = await $.ui.mount(band())

  expect(printed).toEqual({
    text: [
      'באמצע עבודה:',
      '/nadavai:my-status  מה מצבנו?',
      'להבין ולהחליט:',
      '/nadavai:my-plain  תסביר לי את זה בפשטות',
      'נוספים:',
      '/nadavai:my-new  פרומט חדש בלי סימן',
    ].join('\n'),
  })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()
})

test('/my-menu typed by hand says how the list opens, and opens nothing', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start(START)
  expect(await $.command.run(run())).toEqual({})
  const ui = await $.ui.mount(band())

  expect(held.toasts).toEqual([HOW])
  expect(held.fills).toEqual([])
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})
