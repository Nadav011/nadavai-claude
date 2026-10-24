declare module 'claude-code' {
  interface PluginState {
    'agent-plus': {
      /** Ids of the agents whose command is on PATH, in menu order. */
      installed: AgentId[]
      /** The accounts as `ccswap list --json` last reported them; null before the first read. */
      accounts: Accounts | null
      /** What a press is doing now (a switch, a save), shown in the pane; null when idle. */
      busy: string | null
    }
  }
}

/** An agent's id as /agent takes it (codex, grok, agy, ...). */
export type AgentId = string

/** One usage window of a Claude account: percent used and when it resets. */
export type Window = { pct: number; clock: string; countdown: string }

export type ClaudeAccount = {
  number: number
  email: string
  active: boolean
  /** `ok`, or why there is no usage (`token_expired`, `unavailable`, ...). */
  status: string
  fiveHour?: Window
  sevenDay?: Window
}

export type CodexAccount = { number: number; email: string; label: string; active: boolean }

export type Accounts = {
  claude: ClaudeAccount[]
  codex: CodexAccount[]
  /** Why the last read failed (ccswap missing, bad output); absent when it worked. */
  error?: string
}
