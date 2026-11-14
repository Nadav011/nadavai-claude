// What the menu keeps for the session: the words taken out of the prompt box
// while the menu holds the keyboard.
export type Held = string

declare module 'claude-code' {
  interface PluginState {
    'my-menu': { held: Held }
  }
}
