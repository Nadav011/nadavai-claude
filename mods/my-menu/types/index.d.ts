// What the menu keeps for the session: the words taken out of the prompt box
// while the list is open, whether the list is open, and which page it shows.
export type Held = string

declare module 'claude-code' {
  interface PluginState {
    'my-menu': { held: Held; isOpen: boolean; page: number }
  }
}
