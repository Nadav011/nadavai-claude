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
// When the goal row's goal is met, as the menu writes it: for the work he
// asked for when the box was empty, for the goal he typed otherwise.
const met = (whose: string): string =>
  `בסשן הזה כתובה רשימת "מה נחשב גמור" ${whose} (אם אין, קודם כותבים אותה), וכל שורה בה סגורה עם ראיה, או שכל מה שנשאר רשום עם חסימה של נדב, של לקוח, של בדיקת חנות או פלטפורמה, של תאריך או של חומרה`
const READY = `/goal ${met('לעבודה שביקשתי')}`
const AFTER = `. היעד הושג רק כש${met('ליעד הזה')}`
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
  ])

  await $.session.start(START)
  await open($)
  const ui = await $.ui.mount(band())
  const seen: string[] = []
  for (let n = 0; n < 6; n += 1) {
    const names = (await shown(ui)).options.map(option => option.value.replace('nadavai:my-', ''))
    seen.push(`${await marked(ui)} = ${names.join(' ')}`)
    await move($, AFTER_STOP)
    await ui.redraw()
  }

  expect(seen).toEqual([
    'באמצע עבודה = run goal connected status fast',
    'בודקים = done prove review',
    'להבין ולהחליט = best method',
    'להראות, לשלוח ולשמור = other',
    'משהו לא טוב = machine wrong never',
    'נוספים = new',
  ])
  // The sixth turn came back to the first group.
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
  expect(await marked(ui)).toBe('באמצע עבודה 1/2')
  await move($, AFTER_STOP)
  await ui.redraw()
  const second = await shown(ui)
  expect(second.key).toBe(list(1))
  expect(second.options.map(option => option.label.slice(0, 2))).toEqual(['4.', '5.', '6.'])
  expect(await marked(ui)).toBe('באמצע עבודה 2/2')
  // One group in two parts: the turn after the second part is the first again.
  await move($, AFTER_STOP)
  await ui.redraw()
  expect((await shown(ui)).key).toBe(list(0))
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
