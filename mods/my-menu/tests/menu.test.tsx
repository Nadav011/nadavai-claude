import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// The band above the prompt box, as the terminal asks this mod to draw it.
const band = (bodyColumns = 150, maxRows = 14, hasSurvey = false) =>
  ({
    plugin: 'my-menu',
    component: 'AbovePrompt',
    surface: 'terminal',
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

const STATUS = 'row:nadavai:my-status'
const PLAIN = 'row:nadavai:my-plain'
const GOAL = 'row:goal'
const NEW = 'row:nadavai:my-new'
// When the goal row's goal is met, as the menu writes it.
const MET =
  'בסשן הזה כתובה רשימת "מה נחשב גמור" (אם אין, קודם כותבים אותה), וכל שורה בה סגורה עם ראיה, או שכל מה שנשאר רשום עם חסימה של נדב, של לקוח, של בדיקת חנות או פלטפורמה, של תאריך או של חומרה'
type Command = { name: string; description: string; source: (typeof COMMANDS)[number]['source'] }

// `/my-menu` as his key or his Enter runs it, with what he typed after it.
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
}

const box = (text = '', isFree = true): Box => ({ text, fills: [], isFree, toasts: [] })

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
}

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('a closed list draws nothing of its own', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  const ui = await $.ui.mount(band())

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()
})

test('the list shows one group at a time: a number, the sentence, what he gets, the prompt', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  const rows = await ui.findAll({ type: 'Button' })

  // The first group, with the goal row where his order puts it, and the key
  // that turns to the next group.
  expect(rows.map(row => row.key)).toEqual([GOAL, STATUS, 'page'])
  expect(rows.map(row => row.props.hotkey)).toEqual(['1', '2', '0'])
  expect((await ui.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text).toMatch(
    /^הפרומטים שלי: באמצע עבודה {2}\(1 מתוך 3\)/,
  )
  expect(rows[0]?.text).toMatch(/^לנעול את הסשן על היעד +הסשן לא עוצר עד שכל מה שנחשב גמור סגור +goal\/ *$/)
  expect(rows[1]?.text).toMatch(/^מה מצבנו\? +מה נעשה, מה רץ עכשיו +nadavai:my-status\/ *$/)
  expect(rows[2]?.text).toBe('הבא: להבין ולהחליט · תסביר לי את זה בפשטות')
  // Every row fills the band (its width less the key), so a click anywhere on
  // a row presses it. The names end in one cell: drawn right to left, that
  // is the column where every prompt begins.
  expect(rows.slice(0, 2).map(row => row.text.length)).toEqual([146, 146])
  expect(new Set(rows.slice(0, 2).map(row => row.text.lastIndexOf('/'))).size).toBe(1)

  await ui.press({ key: 'page' })
  const second = await ui.findAll({ type: 'Button' })
  expect(second.map(row => row.key)).toEqual([PLAIN, 'page'])
  expect(second[0]?.text).toMatch(/^תסביר לי את זה בפשטות +מה היה, מה יהיה +nadavai:my-plain\/ *$/)
  expect((await ui.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text).toMatch(
    /^הפרומטים שלי: להבין ולהחליט {2}\(2 מתוך 3\)/,
  )
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
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  const seen: string[] = []
  for (let n = 0; n < 6; n += 1) {
    const title = (await ui.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text ?? ''
    const keys = (await ui.findAll({ type: 'Button' }))
      .map(row => row.key)
      .filter(key => key !== 'page')
    seen.push(`${/: (.*?) {2}\(/.exec(title)?.[1]} = ${keys.join(' ')}`)
    await ui.press({ key: 'page' })
  }

  expect(seen).toEqual([
    'באמצע עבודה = row:nadavai:my-run row:goal row:nadavai:my-connected row:nadavai:my-status row:nadavai:my-fast',
    'בודקים = row:nadavai:my-done row:nadavai:my-prove row:nadavai:my-review',
    'להבין ולהחליט = row:nadavai:my-best',
    'להראות, לשלוח ולשמור = row:nadavai:my-other',
    'משהו לא טוב = row:nadavai:my-machine row:nadavai:my-wrong row:nadavai:my-never',
    'נוספים = row:nadavai:my-new',
  ])
  // The sixth press came back to the first group.
  expect((await ui.findAll({ type: 'Button' }))[0]?.key).toBe('row:nadavai:my-run')
  await ui.unmount()
})

test('the goal row writes a ready goal line, and his words become the goal', async ($, on) => {
  const held = box()
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: GOAL })
  expect(held.text).toBe(`/goal ${MET}`)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()

  // With words in the box when the list opened: they are the goal, and the
  // list of what counts as done still decides when it is met.
  held.text = 'לסיים את מסך ההזמנות'
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: GOAL })
  expect(held.text).toBe(`/goal לסיים את מסך ההזמנות. היעד הושג רק כש${MET}`)

  // A draft that began with a prompt gives up the prompt's name, as for any row.
  held.text = '/nadavai:my-plain the login bug'
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: GOAL })
  expect(held.text).toBe(`/goal the login bug. היעד הושג רק כש${MET}`)

  // His closing mark does not double with the period, and a draft of several
  // lines becomes one line.
  held.text = 'לסיים את מסך ההזמנות?\nוגם את הדוח.'
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: GOAL })
  expect(held.text).toBe(`/goal לסיים את מסך ההזמנות? וגם את הדוח. היעד הושג רק כש${MET}`)

  // Only marks in the box: there are no words, so the line is the ready one.
  held.text = '...'
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: GOAL })
  expect(held.text).toBe(`/goal ${MET}`)
  await ui.unmount()
})

test('a narrow band leaves out what he gets and keeps the sentence and the prompt', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band(60))
  const first = await ui.find({ key: STATUS })

  expect(first?.text).toMatch(/^מה מצבנו\? +nadavai:my-status\/ *$/)
  await ui.unmount()
})

test('a session without the prompts says how to load them', async ($, on) => {
  engine(on, box(), [COMMANDS[0]])

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())

  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/reload-plugins/)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a survey in the band comes first', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band(150, 14, true))

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a pick puts the prompt in the box with the words he had typed, and closes the list', async ($, on) => {
  const held = box('רק מאתמול')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  // Opening took his words out of the box, so a number key reaches the list.
  expect(held.fills).toEqual([''])

  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.fills).toEqual(['', '/nadavai:my-status רק מאתמול'])
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test("words typed after /my-menu become the prompt's arguments", async ($, on) => {
  const held = box()
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run('רק מאתמול'))
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status רק מאתמול')
  await ui.unmount()
})

test('a draft that began with another command keeps its words', async ($, on) => {
  const held = box('/nadavai:my-plain the login bug')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status the login bug')
  await ui.unmount()
})

test('a draft that starts with a path keeps the path', async ($, on) => {
  const held = box('/tmp/log.txt למה זה נכשל')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status /tmp/log.txt למה זה נכשל')
  await ui.unmount()
})

test('a pick only fills the box and submits nothing', async ($, on) => {
  const held = box()
  engine(on, held)
  let submitted = 0
  on('prompt.submit', (_, e) => {
    submitted += 1

    return { text: e.text }
  })
  on('command.run', { command: 'nadavai:my-status' }, () => {
    submitted += 1

    return {}
  })

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status ')
  expect(submitted).toBe(0)
  await ui.unmount()
})

test('a box that takes nothing keeps his words, and he is shown what he picked', async ($, on) => {
  const held = box('מילים שלי', false)
  engine(on, held)

  await $.session.start(START)
  // A dialog holds the keys: the box keeps his words and nothing is held.
  await $.command.run(run())
  expect(held.text).toBe('מילים שלי')
  await $.command.run(run())

  // The box is free again and he opens the list: now the words are taken out.
  held.isFree = true
  await $.command.run(run())
  expect(held.text).toBe('')

  // A pick while the box is busy again cannot fill it. He is shown the whole
  // line, and the held words end there, so a later pick does not carry them.
  held.isFree = false
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })
  expect(held.text).toBe('')
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. מה שבחרת: /nadavai:my-status מילים שלי'])

  held.isFree = true
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: 'page' })
  await ui.press({ key: PLAIN })
  expect(held.text).toBe('/nadavai:my-plain ')
  await ui.unmount()
})

test('the key again closes the list and gives his words back, after what he typed since', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  expect(held.text).toBe('')
  // The list is open and he typed something new in the box.
  held.text = 'חדש'
  await $.command.run(run())
  const ui = await $.ui.mount(band())

  expect(held.text).toBe('חדש מילים שלי')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('sending something else closes the list and gives his words back', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  await $.command.run(run())
  held.text = ''
  await $.prompt.submit({ text: 'שאלה אחרת', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount(band())

  expect(held.text).toBe('מילים שלי')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('0 turns to the next group, and every row keeps a number key', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // Room for the title, two rows and the page row.
  const ui = await $.ui.mount(band(150, 4))

  const keys = async () => (await ui.findAll({ type: 'Button' })).map(row => row.key)
  expect(await keys()).toEqual([GOAL, STATUS, 'page'])
  expect((await ui.find({ key: 'page' }))?.props.hotkey).toBe('0')
  expect((await ui.find({ key: 'page' }))?.text).toBe('הבא: להבין ולהחליט · תסביר לי את זה בפשטות')
  expect((await ui.find({ type: 'Text', text: /מתוך/ }))?.text).toMatch(/\(1 מתוך 3\)/)
  const column = (await ui.find({ key: STATUS }))?.text.lastIndexOf('/')

  await ui.press({ key: 'page' })
  expect(await keys()).toEqual([PLAIN, 'page'])
  // The columns stay where they were when the page turns.
  expect((await ui.find({ key: PLAIN }))?.text.lastIndexOf('/')).toBe(column)
  expect((await ui.find({ key: PLAIN }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'page' }))?.text).toBe('הבא: נוספים · פרומט חדש בלי סימן')

  await ui.press({ key: 'page' })
  expect(await keys()).toEqual([NEW, 'page'])
  expect((await ui.find({ key: 'page' }))?.text).toBe('חזרה להתחלה: באמצע עבודה')

  await ui.press({ key: 'page' })
  expect(await keys()).toEqual([GOAL, STATUS, 'page'])
  await ui.unmount()
})

test('a group with more rows than the band has room for takes two pages, and the last is never one row alone', async ($, on) => {
  const more: Command[] = ['a', 'b', 'c', 'd', 'e'].map(letter => ({
    name: `nadavai:my-${letter}`,
    description: `שורה ${letter}`,
    source: 'plugin',
  }))
  engine(on, box(), more)

  await $.session.start(START)
  await $.command.run(run())
  // Room for four rows: the five prompts of one group would leave one alone
  // on its second page.
  const ui = await $.ui.mount(band(150, 6))

  const rows = async () =>
    (await ui.findAll({ type: 'Button' })).filter(row => row.key !== 'page').map(row => row.key)
  const title = async () => (await ui.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text
  expect(await rows()).toEqual([GOAL])
  await ui.press({ key: 'page' })
  expect(await rows()).toEqual(['row:nadavai:my-a', 'row:nadavai:my-b', 'row:nadavai:my-c'])
  expect(await title()).toMatch(/^הפרומטים שלי: נוספים {2}\(2 מתוך 3\)/)
  await ui.press({ key: 'page' })
  expect(await rows()).toEqual(['row:nadavai:my-d', 'row:nadavai:my-e'])
  expect(await title()).toMatch(/^הפרומטים שלי: נוספים {2}\(3 מתוך 3\)/)
  await ui.unmount()
})

test('closing into a box that takes nothing shows his words, and they do not turn up later', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  expect(held.text).toBe('')
  // A dialog holds the box when the list closes.
  held.isFree = false
  await $.command.run(run())
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. המילים שהקלדת: מילים שלי'])

  held.isFree = true
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })
  expect(held.text).toBe('/nadavai:my-status ')
  await ui.unmount()
})

test('two presses of the key at once open and close, and his words come back once', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start(START)
  await Promise.all([$.command.run(run()), $.command.run(run())])
  const ui = await $.ui.mount(band())

  expect(held.text).toBe('מילים שלי')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a draft that starts with a short path is words, not a command', async ($, on) => {
  const held = box('/tmp למה זה מלא')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status /tmp למה זה מלא')
  await ui.unmount()
})

test('no row is wider than a narrow band: the name goes before any sentence is cut', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // 36 cells: the longest sentence (21) and the names (18) do not both fit.
  const narrow = await $.ui.mount(band(40))
  const rows = (await narrow.findAll({ type: 'Button' })).filter(row => row.key !== 'page')
  expect(rows.map(row => row.text.length)).toEqual([36, 36])
  expect(rows[0]?.text).toMatch(/^לנעול את הסשן על היעד *$/)
  expect((await narrow.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text.length).toBeLessThanOrEqual(40)
  expect((await narrow.find({ key: 'page' }))?.text.length).toBeLessThanOrEqual(36)
  await narrow.unmount()

  // 20 cells: now the sentence itself is cut, and the title keeps the group's
  // name, which is what tells him where he is.
  const narrower = await $.ui.mount(band(24))
  const short = (await narrower.findAll({ type: 'Button' })).filter(row => row.key !== 'page')
  expect(short.map(row => row.text.length)).toEqual([20, 20])
  expect(short[0]?.text).toBe('לנעול את הסשן על הי…')
  expect((await narrower.find({ type: 'Text', text: /באמצע עבודה/ }))?.text).toBe('באמצע עבודה  (1 מתוך 3)')
  await narrower.unmount()
})

test('a draft that starts with a prompt named without its plugin gives up the name', async ($, on) => {
  const held = box('/my-plain the login bug')
  engine(on, held)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status the login bug')
  await ui.unmount()
})

test('a send while the list is closed is not held behind a stuck step', async ($, on) => {
  const held = box()
  const asked = gate()
  // The open's read is never answered.
  engine(on, held, COMMANDS, {
    slowRead: () => {
      asked.open()

      return new Promise<void>(() => undefined)
    },
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  void $.command.run(run())
  await asked.wait
  const sent = await $.prompt.submit({ text: 'שאלה', wait: false, origin: { kind: 'composer' } })

  expect(sent).toBeDefined()
  expect(held.fills).toEqual([])
})

test('after three seconds the queue moves on from a step that does not settle', async ($, on) => {
  const clock = mock.clock(on)
  const held = box()
  const asked = gate()
  let isStuck = true
  engine(on, held, COMMANDS, {
    slowRead: () => {
      if (!isStuck) return undefined
      isStuck = false
      asked.open()

      return new Promise<void>(() => undefined)
    },
  })

  await $.session.start(START)
  void $.command.run(run())
  await asked.wait
  const second = $.command.run(run())
  await clock.advance(3000)
  await second
  const ui = await $.ui.mount(band())

  expect(await ui.find({ key: STATUS })).toBeDefined()
  await ui.unmount()
})

test('a step that ran past its time does not take his words a second time', async ($, on) => {
  const clock = mock.clock(on)
  const held = box('מילים שלי')
  const asked = gate()
  const slow = gate()
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
  // The first press reads the box and the answer is slow. He presses again.
  const first = $.command.run(run())
  await asked.wait
  const second = $.command.run(run())
  await clock.advance(3000)
  await second
  expect(held.text).toBe('')
  // Now the first press gets its old answer: it must leave everything alone.
  slow.open()
  await first

  await $.command.run(run())
  expect(held.text).toBe('מילים שלי')
})

test('a close whose fill fails still shows his words, and they do not turn up later', async ($, on) => {
  const held = box('מילים שלי')
  let isBroken = false
  engine(on, held, COMMANDS, { isFillBroken: () => isBroken })

  await $.session.start(START)
  await $.command.run(run())
  isBroken = true
  await $.command.run(run())
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. המילים שהקלדת: מילים שלי'])

  isBroken = false
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  await ui.press({ key: STATUS })
  expect(held.text).toBe('/nadavai:my-status ')
  await ui.unmount()
})

test('a pick still works when the list of commands cannot be read', async ($, on) => {
  const held = box('/x מילים')
  let isBroken = false
  engine(on, held, COMMANDS, { isListBroken: () => isBroken })

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  isBroken = true
  await ui.press({ key: STATUS })

  expect(held.text).toBe('/nadavai:my-status /x מילים')
  await ui.unmount()
})

test('the way back to the first page is cut to a narrow band', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // 16 cells, one row a page: the fourth page shows the way back.
  const ui = await $.ui.mount(band(20, 3))
  await ui.press({ key: 'page' })
  await ui.press({ key: 'page' })
  await ui.press({ key: 'page' })

  expect((await ui.find({ key: 'page' }))?.text).toBe('חזרה להתחלה: בא…')
  await ui.unmount()
})

test('a band of two rows drops the title and keeps a row and the page key', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band(150, 2))

  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([GOAL, 'page'])
  expect(await ui.find({ type: 'Text', text: /הפרומטים שלי/ })).toBeUndefined()
  await ui.unmount()
})

test('0 goes to the page after the one on screen, also after the list grew shorter', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // One row a page: four pages. Three presses reach the fourth.
  const ui = await $.ui.mount(band(150, 3))
  await ui.press({ key: 'page' })
  await ui.press({ key: 'page' })
  await ui.press({ key: 'page' })
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([NEW, 'page'])

  // The band grows: three pages now, and the screen shows the last one.
  await ui.redraw(band(150, 4).props)
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([NEW, 'page'])
  await ui.press({ key: 'page' })
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([GOAL, STATUS, 'page'])
  await ui.unmount()
})

test('with nobody at the keyboard the list is printed and nothing opens', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start({ ...START, isInteractive: false })
  const ran = await $.command.run(run())

  expect(ran.text).toBe(
    [
      'באמצע עבודה:',
      '/nadavai:my-status  מה מצבנו?',
      'להבין ולהחליט:',
      '/nadavai:my-plain  תסביר לי את זה בפשטות',
      'נוספים:',
      '/nadavai:my-new  פרומט חדש בלי סימן',
    ].join('\n'),
  )
  expect(held.text).toBe('מילים שלי')
  expect(held.fills).toEqual([])
})

test('a pick that ran past its time changes nothing he did after it, and tells him', async ($, on) => {
  const clock = mock.clock(on)
  const held = box('מילים')
  const asked = gate()
  const slow = gate()
  const told = gate()
  held.onToast = told.open
  let isArmed = false
  engine(on, held, COMMANDS, {
    slowRead: () => {
      if (!isArmed) return undefined
      isArmed = false
      asked.open()

      return slow.wait
    },
  })

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  // He picks a row and the box is slow to answer. The queue moves on.
  isArmed = true
  void ui.press({ key: STATUS })
  await asked.wait
  await clock.advance(3000)
  await ui.unmount()
  // Meanwhile he types a word, closes the list and opens it again.
  held.text = 'חדש'
  await $.command.run(run())
  expect(held.text).toBe('חדש מילים')
  await $.command.run(run())
  expect(held.text).toBe('')

  // Now the pick gets its old answer. The list he opened stays open, his
  // words stay held, and nothing is written to the box.
  slow.open()
  await told.wait
  expect(held.toasts).toEqual(['הבחירה התעכבה ולא נכנסה לתיבה. אפשר לבחור שוב.'])
  expect(held.fills.filter(text => text.startsWith('/'))).toEqual([])
  const again = await $.ui.mount(band())
  expect(await again.find({ key: STATUS })).toBeDefined()
  await again.unmount()
  await $.command.run(run())
  expect(held.text).toBe('חדש מילים')
})

test('a close that ran past its time shows his words and says that it was late', async ($, on) => {
  const clock = mock.clock(on)
  const held = box('מילים')
  const asked = gate()
  const slow = gate()
  let isArmed = false
  engine(on, held, COMMANDS, {
    slowRead: () => {
      if (!isArmed) return undefined
      isArmed = false
      asked.open()

      return slow.wait
    },
  })

  await $.session.start(START)
  await $.command.run(run())
  // The key again closes the list, and the box is slow to answer.
  isArmed = true
  const closing = $.command.run(run())
  await asked.wait
  await clock.advance(3000)
  slow.open()
  await closing

  expect(held.text).toBe('')
  expect(held.toasts).toEqual(['הסגירה התעכבה, והמילים שהקלדת לא חזרו לתיבה: מילים'])
})

test('a pick whose fill fails shows what he picked, and his words do not turn up later', async ($, on) => {
  const held = box('מילים שלי')
  let isBroken = false
  engine(on, held, COMMANDS, { isFillBroken: () => isBroken })

  await $.session.start(START)
  await $.command.run(run())
  expect(held.text).toBe('')
  const ui = await $.ui.mount(band())
  isBroken = true
  await ui.press({ key: STATUS })
  expect(held.toasts).toEqual(['התיבה לא פנויה כרגע. מה שבחרת: /nadavai:my-status מילים שלי'])

  // The list closed with that pick, and a later pick does not carry the words.
  isBroken = false
  await $.command.run(run())
  await ui.redraw()
  await ui.press({ key: 'page' })
  await ui.press({ key: PLAIN })
  expect(held.text).toBe('/nadavai:my-plain ')
  await ui.unmount()
})
