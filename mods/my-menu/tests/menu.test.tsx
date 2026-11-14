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

// `/my-menu` as his key or his Enter runs it.
const RUN = {
  command: 'my-menu',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

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
  // The box as the engine would hold it: his words, then whatever is filled.
  let box = 'רק מאתמול'
  const fills: string[] = []
  on('command.list', () => ({ value: [...COMMANDS] }))
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_, e) => {
    box = e.text
    fills.push(e.text)

    return { isFilled: true, text: box, cursor: box.length }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  // Opening took his words out of the box, so the pane can hold the keys.
  expect(fills).toEqual([''])

  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'prompt', value: 'nadavai:my-status' })

  expect(fills).toEqual(['', '/nadavai:my-status רק מאתמול'])
  await ui.unmount()
})

test('where no pane can be drawn the list is printed and his words stay', async ($, on) => {
  let box = 'מילים שלי'
  on('command.list', () => ({ value: [...COMMANDS] }))
  on('command.register', () => ({ value: { command: 'my-menu' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_, e) => {
    box = e.text

    return { isFilled: true, text: box, cursor: box.length }
  })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(RUN)

  expect(ran.text).toBe(
    [
      '/nadavai:my-status  מה מצבנו?',
      '/nadavai:my-plain  תסביר לי את זה בפשטות',
      '/nadavai:my-new  פרומט חדש בלי סימן',
    ].join('\n'),
  )
  expect(box).toBe('מילים שלי')
})
