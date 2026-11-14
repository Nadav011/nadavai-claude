import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// The menu of Nadav's prompt store. `/my-menu` (bound to Ctrl+P in
// keybindings.json) opens a list above the prompt box. Each row is a number,
// the sentence he would say, what he gets, and the prompt it writes. A number
// key (over an empty box) or a click puts that prompt in the prompt box, and
// his own Enter runs it, so a prompt still starts only when he starts it and
// he can add words after its name. The name `my` is taken: it is the nadavai
// plugin's printed menu, which stays as the form that needs no mod.
//
// Why the band above the prompt and not a pane: a pane docks beside the
// transcript in a wide terminal, and Orca's terminal (our right-to-left patch)
// orders every row that holds Hebrew as one right-to-left line across the
// whole width, which mixes a docked pane into the conversation. The band's
// rows are whole terminal rows, so each one reads right to left by itself.
// Every row here opens with Hebrew so that it reads right to left, and the
// columns are lined up with blank cells counted for that direction.

const COMMAND = 'my-menu'
const PREFIX = 'nadavai:my-'
// The order he sees: by how many of his messages each prompt answers, counted
// over everything he typed to his agents from 2026-08 to 2026-11 (the table is
// in ~/.omc/plans/method-review-2026-11-13/prompt-store/corpus-2026-11-14/,
// merged/order.txt). A prompt not named here comes after these, by name.
const ORDER = [
  'run',
  'best',
  'done',
  'resume',
  'prove',
  'other',
  'review',
  'status',
  'self',
  'show',
  'plain',
  'client',
  'research',
  'machine',
  'fast',
  'hold',
  'wrong',
  'top',
  'ask',
  'next',
  'agents',
  'save',
  'ship',
  'cost',
  'never',
  'second',
  'missed',
  'map',
]
// Number keys 1 to 9 pick a row; 0 turns the page. A page holds as many rows
// as the band has room for, so no row is scrolled out of reach of its key.
const MAX_PER_PAGE = 9
const MIN_PER_PAGE = 1
// A last page with fewer rows than this shares rows with the page before it.
const MIN_LAST_PAGE = 3
// The band needs this many rows to show a title above the list.
const ROWS_FOR_TITLE = 3
// Blank cells between two columns.
const GAP = 4
// The middle column (what he gets): the widest it may be, and the narrowest
// at which it still says something.
const MAX_GLOSS = 64
const MIN_GLOSS = 20
// The narrowest band a row is laid out for.
const MIN_WIDTH = 12
// How long the queue of opens, closes and picks waits for one step.
const STEP_MS = 3000

const TITLE = 'הפרומטים שלי'
const HINT = '   מקש מספר או לחיצה בעכבר מכניסים את הפרומט לתיבה · Enter מריץ · Ctrl+P סוגר'
const SHORT_HINT = '   מספר בוחר · Ctrl+P סוגר'

type Row = { name: string; sentence: string; gloss: string }

// The words he had typed when he opened the menu: what the prompt box held, or
// what followed `/my-menu`. A number key reaches the menu only over an empty
// box, so the words are taken out and kept here. They come back as the chosen
// prompt's arguments, or as they were when he closes the menu without choosing.
// Kept in the session's state, so a reload of this module does not lose them.
const held = atom({ plugin: 'my-menu', key: 'held' } as const, '')
const isOpen = atom({ plugin: 'my-menu', key: 'isOpen' } as const, false)
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

// How many rows each page holds: full pages first, since the most used
// prompts come first, and a short last page evened out with the one before.
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
    .map(one => ({
      name: one.name,
      sentence: sentence(one.description),
      gloss: gloss(one.description),
    }))
}

// What he is told when a step ran past its time and left the box alone.
const LATE_PICK = 'הבחירה התעכבה ולא נכנסה לתיבה. אפשר לבחור שוב.'
const LATE_CLOSE = 'הסגירה התעכבה, והמילים שהקלדת לא חזרו לתיבה:'
const MISSING =
  'הפרומטים עוד לא נטענו בסשן הזה. מקלידים /reload-plugins ואז פותחים שוב.'

// False in a run with nobody at the keyboard (`claude -p`): no band is drawn
// there, so the list is printed instead.
let isInteractive = true

// One open, close or pick at a time. Two presses of the key in a row would
// otherwise both find the list closed and both take his words. A step has
// STEP_MS from the moment it starts (a call another plugin's hook answers
// late, or never, would otherwise hold every later step). After that the
// queue moves on, and the late step is told so: it may no longer write to
// the box, because the next step has begun.
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    await $.command.register({
      name: COMMAND,
      description: 'הפרומטים שלי: רשימה לבחירה במספר או בלחיצה',
      immediate: true,
    })

    return next(e)
  })

  // The key, or `/my-menu`: opens the list, and closes it when it is open.
  on('command.run', { command: COMMAND }, async ($, e) => {
    if (!isInteractive) {
      const rows = await prompts($)

      return {
        text:
          rows.length === 0
            ? MISSING
            : rows.map(row => `/${row.name}  ${row.sentence}`).join('\n'),
      }
    }

    return inTurn($, async isLate => {
      if (await read($, isOpen)) {
        await close($, isLate)

        return {}
      }
      const { text } = await $.prompt.read()
      // What a late step read is old: the box and the list stay as they are.
      if (isLate()) return {}
      if (text.trim() !== '') {
        // The words leave the box only when it could be emptied: while a
        // dialog holds the keys they stay where he typed them.
        const emptied = await $.prompt.fill({ text: '' })
        if (emptied.isFilled) await update($, held, kept => joined(kept, text))
      } else if (e.args.trim() !== '') {
        await update($, held, kept => joined(kept, e.args))
      }
      await update($, page, () => 0)
      await update($, isOpen, () => true)

      return {}
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, isOpen)) || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await prompts($)
    if (rows.length === 0) return <Text wrap="truncate-end">{MISSING}</Text>

    // A band too short for a title gives its rows to the list.
    const hasTitle = e.props.maxRows >= ROWS_FOR_TITLE
    const room = e.props.maxRows - (hasTitle ? 2 : 1)
    const fit = Math.max(MIN_PER_PAGE, Math.min(MAX_PER_PAGE, room))
    const sizes = pageSizes(rows.length, fit)
    const pages = sizes.length
    const onPage = (n: number): Row[] => {
      const start = sizes.slice(0, n).reduce((sum, size) => sum + size, 0)

      return rows.slice(start, start + (sizes[n] ?? 0))
    }
    const at = Math.min(await read($, page), pages - 1)
    const shown = onPage(at)
    const after = (at + 1) % pages
    const coming = onPage(after)
      .map(row => row.sentence)
      .join(' · ')
    // The cells a row's text may take: the band's width less the key ("1: ").
    const width = Math.max(MIN_WIDTH, e.props.bodyColumns - 4)
    // The columns are sized over every prompt, not only this page's, so that
    // they stay where they are when the page turns. No row is wider than the
    // band: a row that wrapped would push the last rows out of their keys'
    // reach. The sentence is what he reads to choose, so in a narrow band the
    // prompt's name goes before any sentence is cut.
    const longest = widest(rows.map(row => row.sentence))
    const names = widest(rows.map(row => row.name)) + 1
    const hasName = width >= longest + GAP + names
    const sentences = Math.min(longest, width)
    // The middle column takes what the other two leave, and is dropped where
    // the band is too narrow for it to say anything.
    const spare = width - (sentences + GAP + GAP + names)
    const glosses = Math.min(MAX_GLOSS, spare, widest(rows.map(row => row.gloss)))
    const hasGloss = hasName && glosses >= MIN_GLOSS
    // A row's sentence, what he gets, its prompt and the slash, with the gaps.
    const table =
      sentences + (hasGloss ? GAP + glosses : 0) + (hasName ? GAP + names : 0)

    // The title row, held to the band's width.
    const pageOf = pages > 1 ? `  (${at + 1} מתוך ${pages})` : ''
    const left = e.props.bodyColumns - TITLE.length - pageOf.length
    const hint = HINT.length <= left ? HINT : SHORT_HINT.length <= left ? SHORT_HINT : ''

    return (
      <Box flexDirection="column">
        {hasTitle && (
          <Text wrap="truncate-end">
            <Text bold>{TITLE}</Text>
            <Text dimColor>
              {pageOf}
              {hint}
            </Text>
          </Text>
        )}
        {shown.map((row, index) => {
          const said = cut(row.sentence, sentences)
          const what = hasGloss ? cut(row.gloss, glosses) : ''
          // Blank cells that line the columns up: the sentences begin at the
          // right, what he gets begins in one column, and the prompts begin
          // in one column at the left.
          const afterSentence = ' '.repeat(
            sentences - said.length + (hasGloss || hasName ? GAP : 0),
          )
          const afterGloss = ' '.repeat(
            (hasGloss ? glosses - what.length + GAP : 0) +
              (hasName ? names - 1 - row.name.length : 0),
          )

          return (
            <Button
              key={`row:${row.name}`}
              plain
              hotkey={String(index + 1)}
              onPress={() => {
                void inTurn($, isLate => choose($, row.name, isLate))
              }}
            >
              {said}
              {afterSentence}
              <Text dimColor>{what}</Text>
              {afterGloss}
              {/* The slash is written after the name on purpose. The row reads
                  right to left, and there a mark at the very end of the line
                  is drawn at its left end, which puts it in front of the name:
                  "/nadavai:my-status". Written first, it is drawn after it. */}
              {hasName && <Text color="suggestion">{row.name}/</Text>}
              {/* Blank cells to the end of the row, so a click anywhere on
                  the row presses it: in a right-to-left row the words are
                  drawn at the other end from the cells that hold them. */}
              {' '.repeat(Math.max(0, width - table))}
            </Button>
          )
        })}
        {pages > 1 && (
          <Button
            key="page"
            plain
            hotkey="0"
            onPress={() => {
              // To the page after the one on screen, which is not always the
              // one after the stored page: the list may have grown shorter.
              void update($, page, () => after)
            }}
          >
            <Text dimColor>
              {cut(after === 0 ? 'חזרה לרשימה הראשונה' : `עוד: ${coming}`, width)}
            </Text>
          </Button>
        )}
      </Box>
    )
  })

  // He typed something else and sent it while the list was open: the list
  // closes, and words it had taken out of the box go back in.
  on('prompt.submit', async ($, e, next) => {
    const sent = await next(e)
    // A send while the list is closed waits for nothing.
    if (e.command?.name !== COMMAND && (await read($, isOpen))) {
      await inTurn($, async isLate => {
        if (await read($, isOpen)) await close($, isLate)
      })
    }

    return sent
  })
}

// Closes the list without a pick: the held words go back in the box. When the
// box takes nothing (a dialog holds it, the call fails, or this step ran past
// its time) he is shown the words instead, and they end here: kept, they
// would turn up inside a later, unrelated pick.
const close = async ($: EngineInterface, isLate: () => boolean): Promise<void> => {
  await update($, isOpen, () => false)
  const words = await read($, held)
  if (words === '') return
  await update($, held, () => '')
  // A close that ran past its time no longer writes to the box (a later step
  // may have read it already), so his words are shown, with the true reason.
  const back = await $.prompt
    .read()
    .then(({ text }) =>
      isLate()
        ? ('late' as const)
        : $.prompt
            .fill({ text: joined(text, words) })
            .then(filled => (filled.isFilled ? ('back' as const) : ('busy' as const))),
    )
    .catch(() => 'busy' as const)
  if (back === 'late') $.ui.toast(`${LATE_CLOSE} ${words}`)
  if (back === 'busy') $.ui.toast(`התיבה לא פנויה כרגע. המילים שהקלדת: ${words}`)
}

// Puts `/<prompt> ` in the prompt box, with the words he had typed as the
// prompt's arguments, and closes the list. A draft that began with another
// command gives up that command's name, not its words. Only a real command's
// name is given up, whole or without its plugin (`/nadavai:my-plain`,
// `/my-plain`): a path (`/tmp why`, `/tmp/log.txt ...`) is words.
const choose = async (
  $: EngineInterface,
  name: string,
  isLate: () => boolean,
): Promise<void> => {
  const { text } = await $.prompt.read()
  // A pick that ran past its time changes nothing: the box, the held words and
  // the list are by then as the later steps set them. He is told to pick again.
  if (isLate()) {
    $.ui.toast(LATE_PICK)

    return
  }
  const draft = joined(await read($, held), text)
  const first = /^\/(\S+)(?:\s+|$)/.exec(draft)
  const commands = first ? await $.command.list().catch(() => []) : []
  const words =
    first && commands.some(one => one.name === first[1] || one.name.endsWith(`:${first[1]}`))
      ? draft.slice(first[0].length)
      : draft
  const line = `/${name} ${words}`
  if (isLate()) {
    $.ui.toast(LATE_PICK)

    return
  }
  // From here the held words are this pick's. They end here either way: kept
  // after a box that took nothing, they would turn up in a later pick, so he
  // is shown the whole line instead.
  await update($, held, () => '')
  const filled = await $.prompt.fill({ text: line }).catch(() => ({ isFilled: false }))
  // After a fill that ran past the time, the list belongs to the later steps.
  if (!isLate()) await update($, isOpen, () => false)
  if (!filled.isFilled) $.ui.toast(`התיבה לא פנויה כרגע. מה שבחרת: ${line}`)
}
