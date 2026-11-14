import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// The menu of Nadav's prompt store. `/my-menu` (bound to Ctrl+P in
// keybindings.json) opens a pane that lists the nadavai:my-* prompts. Arrows
// move, Enter puts the chosen prompt in the prompt box, and his own Enter runs
// it, so a prompt still starts only when he starts it and he can add words
// after its name. The name `my` is taken: it is the nadavai plugin's printed
// menu, which stays as the form that needs no mod.

const COMMAND = 'my-menu'
const PANE = 'my-menu'
const PREFIX = 'nadavai:my-'
// The order he sees. A prompt that is not named here is listed after these.
const ORDER = [
  'status',
  'done',
  'map',
  'review',
  'prove',
  'run',
  'resume',
  'other',
  'ask',
  'best',
  'research',
  'never',
  'plain',
]

type Row = { value: string; label: string }

// The words he had typed when he opened the menu: what the prompt box held, or
// what followed `/my-menu`. A pane takes the keyboard only over an empty box,
// so the words are taken out and kept here. They come back as the chosen
// prompt's arguments, or as they were when he closes the menu without choosing.
// Kept in the session's state, so a reload of this module does not lose them.
const held = atom({ plugin: 'my-menu', key: 'held' } as const, '')

const joined = (...parts: string[]): string =>
  parts
    .map(part => part.trim())
    .filter(part => part !== '')
    .join(' ')

// The sentence he would say: the description up to its first "?" or ":".
const sentence = (description: string): string => {
  const text = description.trim()
  const ask = text.indexOf('?')
  const colon = text.indexOf(':')
  if (ask !== -1 && (colon === -1 || ask < colon)) return text.slice(0, ask + 1)
  if (colon !== -1) return text.slice(0, colon)

  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

const place = (name: string): number => {
  const at = ORDER.indexOf(name.slice(PREFIX.length))

  return at === -1 ? ORDER.length : at
}

// The prompts this session can run, read from the commands themselves, so a
// new nadavai:my-* skill shows up here without a second list to keep.
const prompts = async ($: EngineInterface): Promise<Row[]> => {
  const all = await $.command.list()

  return all
    .filter(one => one.name.startsWith(PREFIX))
    .sort((a, b) => place(a.name) - place(b.name) || a.name.localeCompare(b.name))
    .map(one => ({ value: one.name, label: sentence(one.description) }))
}

const MISSING =
  'הפרומטים עוד לא נטענו בסשן הזה. מקלידים /reload-plugins ואז פותחים שוב.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'הפרומטים שלי: רשימה לבחירה בחיצים',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const { text } = await $.prompt.read()
    if (text.trim() !== '') {
      // The words leave the box only when it could be emptied: while a dialog
      // holds the keys they stay where he typed them.
      const emptied = await $.prompt.fill({ text: '' })
      if (emptied.isFilled) await update($, held, kept => joined(kept, text))
    } else if (e.args.trim() !== '') {
      await update($, held, kept => joined(kept, e.args))
    }
    const opened = await $.ui.open({
      id: PANE,
      title: 'הפרומטים שלי',
      focus: true,
      closeOnEscape: true,
      rows: ORDER.length + 2,
    })
    if (opened.isPlaced) return {}

    // No pane on this surface (a headless run): print the list instead.
    await giveBack($)
    const rows = await prompts($)

    return {
      text:
        rows.length === 0
          ? MISSING
          : rows.map(row => `/${row.value}  ${row.label}`).join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Select } = $.ui.resolve(e)
    const rows = await prompts($)
    if (rows.length === 0) return <Text>{MISSING}</Text>

    return (
      <Box flexDirection="column">
        <Select
          key="prompt"
          label="פרומט"
          autoFocus
          options={rows}
          value={rows[0]?.value}
          onSelect={value => {
            void choose($, value)
          }}
        />
        <Text dimColor>חיצים: בחירה · Enter: לתיבה · Esc: סגירה</Text>
      </Box>
    )
  })

  // He closed the menu without choosing: his words go back in the box. A pick
  // closes the pane too, as the plugin, and puts them in the box itself.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE && e.origin.kind !== 'plugin') await giveBack($)

    return closed
  })
}

// Puts the held words back, after anything he typed since, and forgets them
// only once the box has taken them.
const giveBack = async ($: EngineInterface): Promise<void> => {
  const words = await read($, held)
  if (words === '') return
  const { text } = await $.prompt.read()
  const back = await $.prompt.fill({ text: joined(text, words) })
  if (back.isFilled) await update($, held, () => '')
}

// Puts `/<prompt> ` in the prompt box, with the words he had typed as the
// prompt's arguments, and hands the keyboard back by closing the pane. A draft
// that began with another command gives up that command's name, not its words.
const choose = async ($: EngineInterface, name: string): Promise<void> => {
  const { text } = await $.prompt.read()
  const words = joined(await read($, held), text).replace(/^\/\S*\s*/, '')
  await $.ui.close({ id: PANE })
  const filled = await $.prompt.fill({ text: `/${name} ${words}` })
  if (filled.isFilled) await update($, held, () => '')
  else $.ui.toast(`התיבה לא פנויה כרגע. הפרומט שבחרת: /${name}`)
}
