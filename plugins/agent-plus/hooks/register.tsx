import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Accounts, ClaudeAccount, CodexAccount, Window } from '../types'

const PLUGIN = 'agent-plus'
const COMMAND = 'agent'
const PANE = 'agent-plus'

/**
 * The agents the pane offers, in order: the id typed after /agent, the label, the command on
 * PATH, and the id `orca agent launch --agent` takes for it.
 */
const AGENTS = [
  { id: 'codex', label: 'Codex', command: 'codex', orcaId: 'codex' },
  { id: 'grok', label: 'Grok', command: 'grok', orcaId: 'grok' },
  { id: 'agy', label: 'Antigravity', command: 'agy', orcaId: 'antigravity' },
  { id: 'gemini', label: 'Gemini', command: 'gemini', orcaId: 'gemini' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', orcaId: 'opencode' },
  { id: 'claude', label: 'Claude', command: 'claude', orcaId: 'claude' },
] as const

type Agent = (typeof AGENTS)[number]

const installed = atom({ plugin: 'agent-plus', key: 'installed' } as const, [] as string[])
const accounts = atom({ plugin: 'agent-plus', key: 'accounts' } as const, null as Accounts | null)
const busy = atom({ plugin: 'agent-plus', key: 'busy' } as const, null as string | null)

/**
 * The tool calls a press makes are approved by this mod itself: the person asked for them by
 * pressing a button or typing /agent. Without this, auto mode's classifier has no request to
 * judge a mod's call against and refuses it. Only this mod's own calls; the same tools called by
 * the model or another plugin are decided as they always are.
 */
const ALLOW = { decision: 'allow', reason: 'Asked for with the agent-plus pane or /agent.' } as const

const COMMANDS: readonly string[] = AGENTS.map(a => a.command)

const field = (input: unknown, name: string) =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[name] : undefined

/** A run of exactly one agent command, in a new tab (no tab_id, cwd defaulting to the session's). */
const isAgentRun = (input: unknown) => {
  const command = field(input, 'command')
  return typeof command === 'string' && COMMANDS.includes(command) && field(input, 'tab_id') === undefined
}

const isTerminalPane = (input: unknown) => field(input, 'pane') === 'terminal'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Which of AGENTS have their command on PATH, as `which` finds them. */
async function findInstalled($: EngineInterface): Promise<string[]> {
  const found = await $.process.run(['which', ...AGENTS.map(a => a.command)], { timeoutMs: 10_000 })
  const names = new Set(found.stdout.split('\n').map(path => path.trim().split('/').pop()))
  return AGENTS.filter(a => names.has(a.command)).map(a => a.id)
}

/**
 * The Orca CLI when this session runs in an Orca terminal, else undefined. Inside Orca a press
 * opens the agent as Orca's own + does, in a new tab of this workspace; elsewhere (the desktop
 * app) in a Terminal-panel tab.
 */
async function findOrca($: EngineInterface): Promise<string | undefined> {
  if ((await $.env.get('TERM_PROGRAM')) !== 'Orca') return undefined
  const dir = await $.env.get('ORCA_CLI_BIN_DIR')
  return dir ? `${dir}/orca` : undefined
}

/** Starts the agent in a new tab of this Orca workspace and switches to it. */
async function openInOrca($: EngineInterface, orca: string, agent: Agent): Promise<string> {
  const ran = await $.process.run([orca, 'agent', 'launch', '--agent', agent.orcaId, '--focus', '--json'], {
    cwd: await $.session.cwd(),
    timeoutMs: 30_000,
  })
  let reply: { ok?: boolean; error?: { message?: string } } = {}
  try {
    reply = JSON.parse(ran.stdout)
  } catch {
    // The reply is checked below by its exit code alone.
  }
  if (ran.exitCode !== 0 || reply.ok === false) {
    return `Couldn't open ${agent.label} in Orca: ${reply.error?.message ?? (ran.stderr.trim() || `exit ${ran.exitCode}`)}`
  }
  return `${agent.label} opened in a new Orca tab.`
}

/** Runs the agent in a new Terminal-panel tab in the session's folder and brings the panel forward. */
async function openInTerminalPanel($: EngineInterface, agent: Agent): Promise<string> {
  const ran = await $.tool.call({
    tool: 'mcp__terminal__run_in_terminal',
    command: agent.command,
    title: agent.label,
  })
  if (ran.deny) return `Couldn't open ${agent.label}: ${ran.deny}`
  if (ran.isError) return `Couldn't open ${agent.label}: ${ran.text ?? ''}`

  const tabId = /tab_id\W+([\w-]+)/.exec(ran.text ?? '')?.[1]
  if (!tabId) return `${agent.label} started in a new Terminal-panel tab; open the panel to see it.`
  const shown = await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'terminal', tab_id: tabId })
  if (shown.deny || shown.isError) {
    return `${agent.label} started in Terminal tab ${tabId}, but the panel could not be shown: ${shown.deny ?? shown.text ?? ''}`
  }
  return `${agent.label} opened in the Terminal panel.`
}

let orcaCli: string | undefined

const openAgent = ($: EngineInterface, agent: Agent) =>
  orcaCli ? openInOrca($, orcaCli, agent) : openInTerminalPanel($, agent)

const ccswap = ($: EngineInterface, args: string[]) => $.process.run(['ccswap', ...args], { timeoutMs: 30_000 })

const toWindow = (value: unknown): Window | undefined => {
  const pct = field(value, 'pct')
  if (typeof pct !== 'number') return undefined
  return { pct, clock: String(field(value, 'clock') ?? ''), countdown: String(field(value, 'countdown') ?? '') }
}

/** The accounts out of `ccswap list --json`, or why they could not be read. */
async function readAccounts($: EngineInterface): Promise<Accounts> {
  let ran
  try {
    ran = await ccswap($, ['list', '--json'])
  } catch (error) {
    return { claude: [], codex: [], error: `ccswap did not run: ${message(error)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(ran.stdout)
  } catch {
    return { claude: [], codex: [], error: ran.stderr.trim() || `ccswap list exited ${ran.exitCode}` }
  }
  // A handled failure is JSON too, `{ error: { message } }` with a non-zero exit: never an empty list.
  const failed = field(parsed, 'error')
  if (ran.exitCode !== 0 || failed !== undefined) {
    const said = field(failed, 'message') ?? (typeof failed === 'string' ? failed : undefined)
    return { claude: [], codex: [], error: `ccswap list failed: ${String(said ?? (ran.stderr.trim() || `exit ${ran.exitCode}`))}` }
  }
  const list = (value: unknown) => {
    const rows = field(value, 'accounts')
    return Array.isArray(rows) ? rows : []
  }
  const claude: ClaudeAccount[] = list(field(parsed, 'claude')).map(row => ({
    number: Number(field(row, 'number')),
    email: String(field(row, 'email') ?? ''),
    active: field(row, 'active') === true,
    status: String(field(row, 'usageStatus') ?? 'unknown'),
    fiveHour: toWindow(field(field(row, 'usage'), 'fiveHour')),
    sevenDay: toWindow(field(field(row, 'usage'), 'sevenDay')),
  }))
  const codex: CodexAccount[] = list(field(parsed, 'codex')).map(row => ({
    number: Number(field(row, 'number')),
    email: String(field(row, 'email') ?? ''),
    label: String(field(row, 'label') ?? 'Codex'),
    active: field(row, 'active') === true,
  }))
  return { claude, codex }
}

const refresh = async ($: EngineInterface) => {
  const read = await readAccounts($)
  await update($, accounts, () => read)
}

/** Runs one ccswap action from a press, shows it as busy, then reads the accounts again. */
async function act($: EngineInterface, doing: string, args: string[]): Promise<void> {
  await update($, busy, () => doing)
  try {
    const ran = await ccswap($, args)
    $.ui.toast(ran.exitCode === 0 ? `${doing}: done.` : `${doing} failed: ${ran.stderr.trim() || ran.stdout.trim()}`)
  } catch (error) {
    $.ui.toast(`${doing} failed: ${message(error)}`)
  } finally {
    await update($, busy, () => null)
    await refresh($).catch(() => undefined)
  }
}

/** `5h 16% · resets 15:49`, or `5h blocked until 15:49` at its limit. */
const windowText = (name: string, w: Window | undefined) => {
  if (!w) return `${name} -`
  if (w.pct >= 100) return `${name} blocked until ${w.clock}`
  return `${name} ${Math.round(w.pct)}%`
}

const isBlocked = (a: ClaudeAccount) => (a.fiveHour?.pct ?? 0) >= 100 || (a.sevenDay?.pct ?? 0) >= 100

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Show the agents and accounts pane, or open an agent: /agent codex',
        argumentHint: '[codex|grok|agy|gemini|opencode|claude]',
      })
    } catch (error) {
      $.ui.toast(`agent-plus: /${COMMAND} could not be registered: ${message(error)}`)
    }
    // Without the environment it can read, the mod opens agents in the Terminal panel.
    orcaCli = await findOrca($).catch(() => undefined)
    try {
      const ids = await findInstalled($)
      await update($, installed, () => ids)
    } catch (error) {
      $.ui.toast(`agent-plus: could not look for agents: ${message(error)}`)
    }
    // Read at start, on /agent, on Refresh and after a press only: ccswap may refresh a token while
    // it reads usage, and the ccswap mod already polls on its own clock.
    void refresh($).catch(() => undefined)
    if (e.isInteractive) await $.ui.open({ id: PANE, title: 'Agents' }).catch(() => undefined)
    return started
  })

  // Checked on the input as decided, after any plugin above rewrote the call: only one of the
  // fixed agent commands, and only the Terminal panel, are allowed without the usual decision.
  on('tool.check', { tool: 'mcp__terminal__run_in_terminal' }, async ($, e, next) =>
    next.origin.plugin === PLUGIN && isAgentRun(e.input) ? ALLOW : next(e),
  )
  on('tool.check', { tool: 'mcp__ccd_view__show_pane' }, async ($, e, next) =>
    next.origin.plugin === PLUGIN && isTerminalPane(e.input) ? ALLOW : next(e),
  )

  on('command.run', { command: COMMAND }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (!asked) {
      await $.ui.open({ id: PANE, title: 'Agents', focus: true })
      void refresh($).catch(() => undefined)
      return { text: 'Agents pane opened.' }
    }
    const agent = AGENTS.find(a => a.id === asked || a.label.toLowerCase() === asked)
    if (!agent) return { text: `Unknown agent "${asked}". Use one of: ${AGENTS.map(a => a.id).join(', ')}.` }
    try {
      return { text: await openAgent($, agent) }
    } catch (error) {
      return { text: `Couldn't open ${agent.label}: ${message(error)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const ids = await read($, installed)
    const agents = AGENTS.filter(a => ids.includes(a.id))
    const known = await read($, accounts)
    const doing = await read($, busy)

    const openPress = (agent: Agent) => async () => {
      try {
        $.ui.toast(await openAgent($, agent))
      } catch (error) {
        $.ui.toast(`Couldn't open ${agent.label}: ${message(error)}`)
      }
    }

    // A row switches by email, not slot number: the slot a stale row shows may hold another
    // account by the time it is pressed.
    const claudeRow = (a: ClaudeAccount) => (
      <Box key={`claude-${a.number}`} flexDirection="row" columnGap={1}>
        <Text bold={a.active}>{a.active ? '●' : '○'} {a.number}</Text>
        <Text bold={a.active}>{a.email}</Text>
        {a.status === 'ok' ? (
          <Text {...(isBlocked(a) ? { color: 'red' } : { dimColor: true })}>
            {windowText('5h', a.fiveHour)} · {windowText('7d', a.sevenDay)}
          </Text>
        ) : (
          <Text color="yellow">{a.status}</Text>
        )}
        {a.active ? null : (
          <Button
            key={`switch-claude-${a.number}`}
            label="Switch"
            onPress={() => act($, `Switch to ${a.email}`, ['switch', a.email])}
          />
        )}
      </Box>
    )

    const codexRow = (a: CodexAccount) => (
      <Box key={`codex-${a.number}`} flexDirection="row" columnGap={1}>
        <Text bold={a.active}>{a.active ? '●' : '○'} {a.number}</Text>
        <Text bold={a.active}>{a.email}</Text>
        <Text dimColor>{a.label}</Text>
        {a.active ? null : (
          <Button
            key={`switch-codex-${a.number}`}
            label="Switch"
            onPress={() => act($, `Switch Codex to ${a.email}`, ['codex', 'switch', a.email])}
          />
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="column">
          <Text bold>Open an agent</Text>
          <Box flexDirection="row" columnGap={1} flexWrap="wrap">
            {agents.length === 0 ? <Text dimColor>No agent CLI found on PATH</Text> : null}
            {agents.map((agent, i) => (
              <Button key={agent.id} label={`+ ${agent.label}`} hotkey={String(i + 1)} onPress={openPress(agent)} />
            ))}
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text bold>Claude accounts</Text>
          {known === null ? <Text dimColor>Reading accounts…</Text> : null}
          {known?.error ? <Text color="red">{known.error}</Text> : null}
          {known && !known.error && known.claude.length === 0 ? (
            <Text dimColor>No saved accounts. Log in, then press Save current login.</Text>
          ) : null}
          {known?.claude.map(claudeRow)}
        </Box>

        {known && known.codex.length > 0 ? (
          <Box flexDirection="column">
            <Text bold>Codex accounts</Text>
            {known.codex.map(codexRow)}
            <Text dimColor>Restart Codex after a switch.</Text>
          </Box>
        ) : null}

        <Box flexDirection="row" columnGap={1}>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($).catch(() => undefined)} />
          <Button key="save" label="Save current login" onPress={() => act($, 'Save current Claude login', ['add'])} />
          {doing ? <Text dimColor>{doing}…</Text> : null}
        </Box>
      </Box>
    )
  })
}
