import type { ContextSize, Mode, Presence } from '../types'

/** Tokens of conversation after the last copy of the facts at which they should be sent again. */
export const RESEND_DISTANCE = 25_000

/** Past this share of the window, attention to the middle degrades faster: distance counts 1.5x. */
const CROWDED_SHARE = 0.5

export type Level = 'green' | 'blue' | 'yellow' | 'orange' | 'red'

export type Freshness = { level: Level; message: string; detail: string }

/** Theme keys, so each color follows the person's theme. */
export const LEVEL_COLOR: Record<Level, string> = {
  green: 'success',
  blue: 'suggestion',
  yellow: 'warning',
  orange: 'claude',
  red: 'error',
}

const MESSAGE: Record<Level, string> = {
  green: 'Context remembers it',
  blue: 'Context probably still remembers it',
  yellow: "It's almost time to present the facts again",
  orange: 'You should send the facts again',
  red: 'Context probably forgot about it',
}

const thousands = (tokens: number) => `${Math.round(tokens / 1000)}k`

/**
 * How likely the model still has the facts in mind, from where their last copy sits:
 * never sent or compacted away is red; otherwise the tokens of conversation after it,
 * weighted up once the context is crowded, measured against RESEND_DISTANCE.
 */
export function freshness(presence: Presence | null, context: ContextSize): Freshness {
  if (presence === null) {
    return { level: 'red', message: MESSAGE.red, detail: 'the facts were never sent' }
  }
  if (context.compactions > presence.compactions) {
    return { level: 'red', message: MESSAGE.red, detail: 'the conversation was compacted since' }
  }

  const distance = Math.max(0, context.tokens - presence.tokens)
  const isCrowded = context.window > 0 && context.tokens / context.window > CROWDED_SHARE
  const ratio = (distance * (isCrowded ? 1.5 : 1)) / RESEND_DISTANCE
  const level: Level = ratio < 0.25 ? 'green' : ratio < 0.5 ? 'blue' : ratio < 0.75 ? 'yellow' : ratio < 1 ? 'orange' : 'red'
  const detail = `${thousands(distance)} tokens since last sent${isCrowded ? ', context over half full' : ''}`

  return { level, message: MESSAGE[level], detail }
}

/** Whether the facts ride along with the prompt about to be sent. */
export function shouldSend(mode: Mode, level: Level, isSendQueued: boolean): boolean {
  if (isSendQueued) return true
  if (mode === 'always') return true
  if (mode === 'auto') return level === 'orange' || level === 'red'
  return false
}
