/** Caveman's active mode as its flag file says, null when off. */
export type SessionExtrasCavemanMode = string | null

declare module 'claude-code' {
  interface PluginState {
    'session-extras': {
      cavemanMode: SessionExtrasCavemanMode
      /** Whether the caveman mode list is open. */
      isCavemanMenuOpen: boolean
    }
  }
}
