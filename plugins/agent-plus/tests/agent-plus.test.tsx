import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'agent-plus',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

test('the + opens a menu of the installed agents, and a press runs one in a terminal tab', async ($, on) => {
  const calls: { tool: string; input: Record<string, unknown> }[] = []
  const toasts: string[] = []

  // Nothing sits beneath the plugin: these hooks stand for the engine.
  on('command.register', () => ({ value: { command: 'agent' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text))
    return { value: undefined }
  })
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '/home/u/.local/bin/codex\n/home/u/.local/bin/grok\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('tool.call', (_, e) => {
    const { tool, ...input } = e as { tool: string } & Record<string, unknown>
    calls.push({ tool, input })
    return { result: {}, text: tool === 'mcp__terminal__run_in_terminal' ? '{"tab_id":"t1"}' : '' }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    calls.length = 0
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeUndefined()
    await ui.press({ key: 'plus' })

    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'grok' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'gemini' })).toBeUndefined()

    await ui.press({ key: 'codex' })

    expect(calls[0]?.tool).toBe('mcp__terminal__run_in_terminal')
    expect(calls[0]?.input.command).toBe('codex')
    expect(calls[0]?.input.title).toBe('Codex')
    expect(calls[1]?.tool).toBe('mcp__ccd_view__show_pane')
    expect(calls[1]?.input.pane).toBe('terminal')
    expect(calls[1]?.input.tab_id).toBe('t1')
    expect(toasts.at(-1)).toBe('Codex opened in the Terminal panel.')
    // The menu closes again after a press.
    expect(await ui.find({ type: 'Button', key: 'codex' })).toBeUndefined()
    await ui.unmount()
  }
})

test('inside Orca a press launches the agent as an Orca tab of this workspace', async ($, on) => {
  const runs: (readonly string[])[] = []
  const env: Record<string, string> = { TERM_PROGRAM: 'Orca', ORCA_CLI_BIN_DIR: '/orca/bin' }

  on('command.register', () => ({ value: { command: 'agent' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: env[(e as { name: string }).name] }))
  on('process.run', (_, e) => {
    const { argv } = e as { argv: readonly string[] }
    runs.push(argv)
    const stdout = argv[0] === 'which' ? '/bin/codex\n/bin/agy\n' : '{"ok":true}'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', () => {
    throw new Error('no Terminal-panel tool inside Orca')
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'plus' })
  await ui.press({ key: 'agy' })

  expect(runs.at(-1)).toEqual(['/orca/bin/orca', 'agent', 'launch', '--agent', 'antigravity', '--focus', '--json'])
  await ui.unmount()
})
