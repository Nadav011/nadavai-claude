import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PLUGIN = 'agent-plus'
const COMMAND = 'agent'

/**
 * The agents the + offers, in menu order: the id typed after /agent, the label, the command on
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

const isOpen = atom({ plugin: 'agent-plus', key: 'isOpen' } as const, false)
const installed = atom({ plugin: 'agent-plus', key: 'installed' } as const, [] as string[])

/**
 * The tool calls a press makes are approved by this mod itself: the person asked for them by
 * pressing the button or typing /agent. Without this, auto mode's classifier has no request to
 * judge a mod's call against and refuses it. Only this mod's own calls; the same tools called by
 * the model or another plugin are decided as they always are.
 */
const ALLOW = { decision: 'allow', reason: 'Asked for with the agent-plus button or /agent.' } as const

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

let orcaCli: string | undefined

/** Opens the agent in Orca when this session runs there, else in the desktop app's Terminal panel. */
async function openAgent($: EngineInterface, agent: Agent): Promise<string> {
  if (orcaCli) return openInOrca($, orcaCli, agent)
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Open Codex, Grok, Antigravity, Gemini, OpenCode or Claude in a terminal tab',
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
      await update($, isOpen, open => !open)
      return { text: 'The agent menu is above the prompt.' }
    }
    const agent = AGENTS.find(a => a.id === asked || a.label.toLowerCase() === asked)
    if (!agent) return { text: `Unknown agent "${asked}". Use one of: ${AGENTS.map(a => a.id).join(', ')}.` }
    try {
      return { text: await openAgent($, agent) }
    } catch (error) {
      return { text: `Couldn't open ${agent.label}: ${message(error)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const ids = await read($, installed)
    const agents = AGENTS.filter(a => ids.includes(a.id))

    const press = (agent: Agent) => async () => {
      await update($, isOpen, () => false)
      try {
        $.ui.toast(await openAgent($, agent))
      } catch (error) {
        $.ui.toast(`Couldn't open ${agent.label}: ${message(error)}`)
      }
    }

    if (!(await read($, isOpen))) {
      return (
        <Box>
          <Button key="plus" label="+" plain dimColor onPress={() => update($, isOpen, () => true)} />
        </Box>
      )
    }

    return (
      <Box>
        {agents.length === 0 ? <Text dimColor>No agent CLI found on PATH </Text> : null}
        {agents.map((agent, i) => (
          <Button key={agent.id} label={agent.label} hotkey={String(i + 1)} onPress={press(agent)} />
        ))}
        <Button key="close" label="Close" role="dismiss" onPress={() => update($, isOpen, () => false)} />
      </Box>
    )
  })
}
