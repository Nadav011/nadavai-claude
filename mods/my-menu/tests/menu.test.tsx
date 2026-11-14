import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

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

// What the session can run: two of his prompts out of order, one the menu's
// order does not name, the printed menu itself and a built-in.
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
}

const box = (text = '', isFree = true): Box => ({ text, fills: [], isFree, toasts: [] })

// Stands in for the engine beneath the mod: the commands and a prompt box that
// takes fills while it is free.
const engine = (
  on: On,
  held: Box,
  commands: readonly (typeof COMMANDS)[number][] = COMMANDS,
): void => {
  on('command.list', () => ({ value: [...commands] }))
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: held.text, cursor: held.text.length } }))
  on('prompt.fill', (_, e) => {
    if (!held.isFree) return { isFilled: false, text: held.text, cursor: 0 }
    held.text = e.text
    held.fills.push(e.text)

    return { isFilled: true, text: held.text, cursor: held.text.length }
  })
  on('ui.toast', (_, e) => {
    held.toasts.push(e.text)

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

test('the list shows his prompts in his order: a number, the sentence, what he gets, the prompt', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band())
  const rows = await ui.findAll({ type: 'Button' })

  expect(rows.map(row => row.key)).toEqual([STATUS, PLAIN, 'row:nadavai:my-new'])
  expect(rows.map(row => row.props.hotkey)).toEqual(['1', '2', '3'])
  expect(rows[0]?.text).toMatch(/^מה מצבנו\? +מה נעשה, מה רץ עכשיו +nadavai:my-status\/ *$/)
  expect(rows[1]?.text).toMatch(/^תסביר לי את זה בפשטות +מה היה, מה יהיה +nadavai:my-plain\/ *$/)
  // Every row fills the band (its width less the key), so a click anywhere on
  // a row presses it. The names end in one cell: drawn right to left, that
  // is the column where every prompt begins.
  expect(rows.map(row => row.text.length)).toEqual([146, 146, 146])
  expect(new Set(rows.map(row => row.text.lastIndexOf('/'))).size).toBe(1)
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

test('a short band turns pages with 0, and every row keeps a number key', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // Room for the title, two rows and the page row.
  const ui = await $.ui.mount(band(150, 4))

  const keys = async () => (await ui.findAll({ type: 'Button' })).map(row => row.key)
  expect(await keys()).toEqual([STATUS, PLAIN, 'page'])
  expect((await ui.find({ key: 'page' }))?.props.hotkey).toBe('0')
  expect((await ui.find({ key: 'page' }))?.text).toBe('עוד: פרומט חדש בלי סימן')
  expect((await ui.find({ type: 'Text', text: /מתוך/ }))?.text).toMatch(/\(1 מתוך 2\)/)
  const column = (await ui.find({ key: STATUS }))?.text.lastIndexOf('/')

  await ui.press({ key: 'page' })
  expect(await keys()).toEqual(['row:nadavai:my-new', 'page'])
  // The columns stay where they were when the page turns.
  expect((await ui.find({ key: 'row:nadavai:my-new' }))?.text.lastIndexOf('/')).toBe(column)
  expect((await ui.find({ key: 'row:nadavai:my-new' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'page' }))?.text).toBe('חזרה לרשימה הראשונה')

  await ui.press({ key: 'page' })
  expect(await keys()).toEqual([STATUS, PLAIN, 'page'])
  await ui.unmount()
})

test('a last page is never one row alone', async ($, on) => {
  const more = [
    ...COMMANDS,
    { name: 'nadavai:my-a', description: 'שורה רביעית', source: 'plugin' },
    { name: 'nadavai:my-b', description: 'שורה חמישית', source: 'plugin' },
  ] as const
  on('command.list', () => ({ value: [...more] }))
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))

  await $.session.start(START)
  await $.command.run(run())
  // Room for four rows: five prompts would leave one alone on the second page.
  const ui = await $.ui.mount(band(150, 6))

  const rows = async () =>
    (await ui.findAll({ type: 'Button' })).filter(row => row.key !== 'page')
  expect(await rows()).toHaveLength(3)
  await ui.press({ key: 'page' })
  expect(await rows()).toHaveLength(2)
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
  const rows = await narrow.findAll({ type: 'Button' })
  expect(rows.map(row => row.text.length)).toEqual([36, 36, 36])
  expect(rows[1]?.text).toMatch(/^תסביר לי את זה בפשטות *$/)
  expect((await narrow.find({ type: 'Text', text: /הפרומטים שלי/ }))?.text.length).toBeLessThanOrEqual(40)
  await narrow.unmount()

  // 20 cells: now the sentence itself is cut.
  const narrower = await $.ui.mount(band(24))
  const short = await narrower.findAll({ type: 'Button' })
  expect(short.map(row => row.text.length)).toEqual([20, 20, 20])
  expect(short[1]?.text).toBe('תסביר לי את זה בפשט…')
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
  engine(on, held)
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(START)
  const sent = await $.prompt.submit({ text: 'שאלה', wait: false, origin: { kind: 'composer' } })

  expect(sent).toBeDefined()
  expect(held.fills).toEqual([])
})

test('a band of two rows drops the title and keeps a row and the page key', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(band(150, 2))

  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([STATUS, 'page'])
  expect(await ui.find({ type: 'Text', text: /הפרומטים שלי/ })).toBeUndefined()
  await ui.unmount()
})

test('0 goes to the page after the one on screen, also after the list grew shorter', async ($, on) => {
  engine(on, box())

  await $.session.start(START)
  await $.command.run(run())
  // One row a page: three pages. Two presses reach the third.
  const ui = await $.ui.mount(band(150, 3))
  await ui.press({ key: 'page' })
  await ui.press({ key: 'page' })
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual(['row:nadavai:my-new', 'page'])

  // The band grows: two pages now, and the screen shows the last one.
  await ui.redraw(band(150, 4).props)
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual(['row:nadavai:my-new', 'page'])
  await ui.press({ key: 'page' })
  expect((await ui.findAll({ type: 'Button' })).map(row => row.key)).toEqual([STATUS, PLAIN, 'page'])
  await ui.unmount()
})

test('with nobody at the keyboard the list is printed and nothing opens', async ($, on) => {
  const held = box('מילים שלי')
  engine(on, held)

  await $.session.start({ ...START, isInteractive: false })
  const ran = await $.command.run(run())

  expect(ran.text).toBe(
    [
      '/nadavai:my-status  מה מצבנו?',
      '/nadavai:my-plain  תסביר לי את זה בפשטות',
      '/nadavai:my-new  פרומט חדש בלי סימן',
    ].join('\n'),
  )
  expect(held.text).toBe('מילים שלי')
  expect(held.fills).toEqual([])
})
