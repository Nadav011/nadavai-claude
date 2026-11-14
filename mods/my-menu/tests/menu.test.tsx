import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'my-menu',
  component: 'Pane',
  requestId: 'my-menu',
  surface: 'terminal',
  props: {
    title: 'הפרומטים שלי',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

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
}

// Stands in for the engine beneath the mod: the commands, a prompt box that
// takes fills while it is free, and a pane that opens.
const engine = (on: On, box: Box, isPlaced = true): void => {
  on('command.list', () => ({ value: [...COMMANDS] }))
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_, e) => {
    if (!box.isFree) return { isFilled: false, text: box.text, cursor: 0 }
    box.text = e.text
    box.fills.push(e.text)

    return { isFilled: true, text: box.text, cursor: box.text.length }
  })
  on('ui.open', () => ({
    value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' },
  }))
  on('ui.close', () => ({ value: undefined }))
}

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('the menu lists the my-* prompts in his order, by the sentence he says', async ($, on) => {
  on('command.list', () => ({ value: [...COMMANDS] }))

  const ui = await $.ui.mount(PANE)
  const select = await ui.find({ type: 'Select' })

  expect(select?.props.options).toEqual([
    { value: 'nadavai:my-status', label: 'מה מצבנו?' },
    { value: 'nadavai:my-plain', label: 'תסביר לי את זה בפשטות' },
    { value: 'nadavai:my-new', label: 'פרומט חדש בלי סימן' },
  ])
  await ui.unmount()
})

test('a session without the prompts says how to load them', async ($, on) => {
  on('command.list', () => ({ value: [COMMANDS[0]] }))

  const ui = await $.ui.mount(PANE)

  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/reload-plugins/)
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})

test('a pick puts the prompt in the box with the words he had typed', async ($, on) => {
  const box: Box = { text: 'רק מאתמול', fills: [], isFree: true }
  engine(on, box)

  await $.session.start(START)
  await $.command.run(run())
  // Opening took his words out of the box, so the pane can hold the keys.
  expect(box.fills).toEqual([''])

  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })

  expect(box.fills).toEqual(['', '/nadavai:my-status רק מאתמול'])
  await ui.unmount()
})

test('words typed after /my-menu become the prompt\'s arguments', async ($, on) => {
  const box: Box = { text: '', fills: [], isFree: true }
  engine(on, box)

  await $.session.start(START)
  await $.command.run(run('רק מאתמול'))
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })

  expect(box.text).toBe('/nadavai:my-status רק מאתמול')
  await ui.unmount()
})

test('a draft that began with another command keeps its words', async ($, on) => {
  const box: Box = { text: '/nadavai:my-plain the login bug', fills: [], isFree: true }
  engine(on, box)

  await $.session.start(START)
  await $.command.run(run())
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })

  expect(box.text).toBe('/nadavai:my-status the login bug')
  await ui.unmount()
})

test('a pick only fills the box and submits nothing', async ($, on) => {
  const box: Box = { text: '', fills: [], isFree: true }
  engine(on, box)
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
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })

  expect(box.text).toBe('/nadavai:my-status ')
  expect(submitted).toBe(0)
  await ui.unmount()
})

test('words stay in a box that could not be emptied, and wait while it is busy', async ($, on) => {
  const box: Box = { text: 'מילים שלי', fills: [], isFree: false }
  engine(on, box)

  await $.session.start(START)
  // A dialog holds the keys: the box keeps his words and nothing is held.
  await $.command.run(run())
  expect(box.text).toBe('מילים שלי')

  // The box is free again and he opens the menu: now the words are taken out.
  box.isFree = true
  await $.command.run(run())
  expect(box.text).toBe('')

  // A pick while the box is busy again loses nothing: the words wait.
  box.isFree = false
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })
  expect(box.text).toBe('')

  box.isFree = true
  await ui.select({ key: 'prompt', value: 'nadavai:my-plain' })
  expect(box.text).toBe('/nadavai:my-plain מילים שלי')
  await ui.unmount()
})

test('where no pane can be drawn the list is printed and his words stay', async ($, on) => {
  const box: Box = { text: 'מילים שלי', fills: [], isFree: true }
  engine(on, box, false)

  await $.session.start(START)
  const ran = await $.command.run(run())

  expect(ran.text).toBe(
    [
      '/nadavai:my-status  מה מצבנו?',
      '/nadavai:my-plain  תסביר לי את זה בפשטות',
      '/nadavai:my-new  פרומט חדש בלי סימן',
    ].join('\n'),
  )
  expect(box.text).toBe('מילים שלי')
})
