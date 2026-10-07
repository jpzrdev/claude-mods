export type Item = { key: string; value: string }

declare module 'claude-code' {
  interface PluginState {
    'pin-me': {
      items: Item[]
      isMinimized: boolean
      /** The item being edited in the band, by key; '' for a new one. */
      editing: string | null
    }
  }
}
