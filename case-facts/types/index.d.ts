export type Fact = { key: string; value: string }

/** When the facts are sent along with a prompt. */
export type Mode = 'off' | 'auto' | 'always'

/** The last moment the facts were in the conversation: the context's size then and the compactions before it. */
export type Presence = { tokens: number; compactions: number }

/** The conversation as of the last turn: its size, the model's window, and how many times it was compacted. */
export type ContextSize = { tokens: number; window: number; compactions: number }

declare module 'claude-code' {
  interface PluginState {
    'case-facts': {
      facts: Fact[]
      isMinimized: boolean
      mode: Mode
      presence: Presence | null
      context: ContextSize
      isSendQueued: boolean
      /** The fact being edited in the band, by key; '' for a new one. */
      editing: string | null
    }
  }
}
