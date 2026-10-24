import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-plus',
  component: 'Pane',
  requestId: 'agent-plus',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const LIST = JSON.stringify({
  claude: {
    accounts: [
      {
        number: 1,
        email: 'a@example.com',
        active: true,
        usageStatus: 'ok',
        usage: {
          fiveHour: { pct: 16, clock: '15:49', countdown: '4h' },
          sevenDay: { pct: 5, clock: 'Oct 30', countdown: '6d' },
        },
      },
      {
        number: 2,
        email: 'b@example.com',
        active: false,
        usageStatus: 'ok',
        usage: {
          fiveHour: { pct: 100, clock: '13:10', countdown: '1h' },
          sevenDay: { pct: 40, clock: 'Oct 29', countdown: '5d' },
        },
      },
    ],
  },
  codex: { accounts: [{ number: 1, email: 'c@example.com', label: 'Codex Pro', active: true }] },
})

const ran = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

for (const surface of ['desktop'] as const) {
  test(`the pane lists agents and accounts, and its buttons act (${surface})`, async ($, on) => {
    const runs: (readonly string[])[] = []
    const calls: { tool: string; input: Record<string, unknown> }[] = []

    // Nothing sits beneath the plugin: these hooks stand for the engine.
    on('command.register', () => ({ value: { command: 'agent' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.toast', () => ({ value: undefined }))
    on('process.run', (_, e) => {
      const { argv } = e as { argv: readonly string[] }
      runs.push(argv)
      if (argv[0] === 'which') return ran('/bin/codex\n/bin/grok\n')
      if (argv[1] === 'list') return ran(LIST)
      return ran('{}')
    })
    on('tool.call', (_, e) => {
      const { tool, ...input } = e as { tool: string } & Record<string, unknown>
      calls.push({ tool, input })
      return { result: {}, text: tool === 'mcp__terminal__run_in_terminal' ? '{"tab_id":"t1"}' : '' }
    })

    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    // The list stays closed until the + is pressed; then the agents on PATH, and no other.
    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeUndefined()
    await ui.press({ key: 'plus' })
    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'grok' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'gemini' })).toBeUndefined()

    // Both Claude accounts; the blocked one says until when; only the inactive one can be switched to.
    expect(await ui.find({ type: 'Text', text: /a@example\.com/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h blocked until 13:10/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'switch-claude-1' })).toBeUndefined()

    await ui.press({ key: 'switch-claude-2' })
    expect(runs.some(argv => argv.join(' ') === 'ccswap switch b@example.com')).toBe(true)

    // The list is still open from the first press.
    await ui.press({ key: 'codex' })
    // A pick closes the list again.
    expect(await ui.find({ type: 'Button', key: 'grok' })).toBeUndefined()
    const run = calls.find(c => c.tool === 'mcp__terminal__run_in_terminal')
    expect(run?.input.command).toBe('codex')
    expect(calls.find(c => c.tool === 'mcp__ccd_view__show_pane')?.input.tab_id).toBe('t1')
    await ui.unmount()
  })
}

test('a ccswap failure shows its error, not an empty account list', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agent' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const { argv } = e as { argv: readonly string[] }
    if (argv[0] === 'which') return ran('')
    return {
      value: {
        exitCode: 1,
        stdout: '{"schemaVersion":1,"error":{"message":"store locked"}}',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })

  expect(await ui.find({ type: 'Text', text: /ccswap list failed: store locked/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No saved accounts/ })).toBeUndefined()
  await ui.unmount()
})

test('in a terminal (Orca, a plain shell) the mod opens nothing and registers nothing', async ($, on) => {
  let opened = 0
  let registered = 0
  on('command.register', () => {
    registered += 1
    return { value: { command: 'agent' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => {
    opened += 1
    return { value: { isPlaced: true } }
  })
  on('process.run', () => ran(''))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(opened).toBe(0)
  expect(registered).toBe(0)
})
