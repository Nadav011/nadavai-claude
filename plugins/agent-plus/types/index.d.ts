declare module 'claude-code' {
  interface PluginState {
    'agent-plus': {
      /** Whether the agent menu under the + is open. */
      isOpen: boolean
      /** Ids of the agents whose command is on PATH, in menu order. */
      installed: AgentId[]
    }
  }
}

/** An agent's id as /agent takes it (codex, grok, agy, ...). */
export type AgentId = string
