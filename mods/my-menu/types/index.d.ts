// What the menu keeps for the session: where the list stands (closed, open,
// or just picked from, when the band draws nothing so the keyboard returns to
// the prompt box), and which page it shows.
export type Stage = 'idle' | 'open' | 'gone'

declare module 'claude-code' {
  interface PluginState {
    'my-menu': { stage: Stage; page: number }
  }
}
