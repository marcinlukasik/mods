export type Held = {
  command: string
  risk: string
  details: string[]
  decision: 'proceed' | 'cancel' | null
  where: 'pane' | 'band'
}

declare module 'claude-code' {
  interface PluginState {
    'prod-guard': { held: Held | null }
  }
}
