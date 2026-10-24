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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane lists agents and accounts, and its buttons act (${surface})`, async ($, on) => {
    const runs: (readonly string[])[] = []
    const calls: { tool: string; input: Record<string, unknown> }[] = []

    // Nothing sits beneath the plugin: these hooks stand for the engine.
    on('command.register', () => ({ value: { command: 'agent' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.toast', () => ({ value: undefined }))
    on('env.get', () => ({ value: undefined }))
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

    // The agents on PATH, and no other.
    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'grok' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'gemini' })).toBeUndefined()

    // Both Claude accounts; the blocked one says until when; only the inactive one can be switched to.
    expect(await ui.find({ type: 'Text', text: /a@example\.com/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h blocked until 13:10/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'switch-claude-1' })).toBeUndefined()

    await ui.press({ key: 'switch-claude-2' })
    expect(runs.some(argv => argv.join(' ') === 'ccswap switch b@example.com')).toBe(true)

    await ui.press({ key: 'codex' })
    const run = calls.find(c => c.tool === 'mcp__terminal__run_in_terminal')
    expect(run?.input.command).toBe('codex')
    expect(calls.find(c => c.tool === 'mcp__ccd_view__show_pane')?.input.tab_id).toBe('t1')
    await ui.unmount()
  })
}

test('inside Orca a press launches the agent as an Orca tab of this workspace', async ($, on) => {
  const runs: (readonly string[])[] = []
  const env: Record<string, string> = { TERM_PROGRAM: 'Orca', ORCA_CLI_BIN_DIR: '/orca/bin' }

  on('command.register', () => ({ value: { command: 'agent' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: env[(e as { name: string }).name] }))
  on('process.run', (_, e) => {
    const { argv } = e as { argv: readonly string[] }
    runs.push(argv)
    if (argv[0] === 'which') return ran('/bin/codex\n/bin/agy\n')
    if (argv[1] === 'list') return ran(LIST)
    return ran('{"ok":true}')
  })
  on('tool.call', () => {
    throw new Error('no Terminal-panel tool inside Orca')
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'agy' })

  // The accounts are read in the background too, so the launch is looked for among the runs.
  expect(runs.map(argv => argv.join(' '))).toContain('/orca/bin/orca agent launch --agent antigravity --focus --json')
  await ui.unmount()
})

test('a ccswap failure shows its error, not an empty account list', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agent' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', () => ({ value: undefined }))
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
