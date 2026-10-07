import type { Fact, Mode } from '../types'

export const MAX_FACTS = 30
export const MAX_KEY = 60
export const MAX_VALUE = 300

export type Change = { set?: Fact[]; remove?: string[] }

const clip = (text: string, max: number) => text.trim().replace(/\s+/g, ' ').slice(0, max)

/** Applies a change: `remove` first, then `set` (an existing key is replaced in place, an empty value removes it). */
export function applyChange(facts: readonly Fact[], change: Change): Fact[] {
  const removed = new Set((change.remove ?? []).map(key => clip(String(key), MAX_KEY).toLowerCase()))
  const next = facts.filter(fact => !removed.has(fact.key.toLowerCase()))

  for (const raw of change.set ?? []) {
    const key = clip(String(raw.key ?? ''), MAX_KEY)
    const value = clip(String(raw.value ?? ''), MAX_VALUE)
    if (key === '') continue
    const at = next.findIndex(fact => fact.key.toLowerCase() === key.toLowerCase())
    if (value === '') {
      if (at >= 0) next.splice(at, 1)
    } else if (at >= 0) {
      next[at] = { key, value }
    } else {
      next.push({ key, value })
    }
  }

  return next.slice(-MAX_FACTS)
}

export function listFacts(facts: readonly Fact[]): string {
  return facts.length === 0 ? '(none yet)' : facts.map(fact => `- ${fact.key}: ${fact.value}`).join('\n')
}

/** What rides along with a prompt, after the person's text: the model reads it, the person doesn't see it. */
export function contextBlock(facts: readonly Fact[]): string {
  return [
    '<case-facts>',
    "The current task's case facts, restated so they stay in view. They are authoritative: when anything earlier in the conversation, or a summary of it, disagrees, trust these.",
    listFacts(facts),
    '</case-facts>',
  ].join('\n')
}

/**
 * A fact edited in place, typed as `key: value` (or `key = value`). Editing `oldKey` (null for a new
 * fact): text without a separator is its new value (a new fact needs one), a new key renames it, and an
 * empty value removes it.
 */
export function editChange(oldKey: string | null, text: string): Change | null {
  const at = text.search(/[:=]/)
  if (oldKey === null && at < 0) return null
  const key = (at >= 0 ? text.slice(0, at) : (oldKey ?? text)).trim()
  const value = at >= 0 ? text.slice(at + 1).trim() : oldKey === null ? '' : text.trim()
  if (key === '') return oldKey === null ? null : { remove: [oldKey] }

  const isRenamed = oldKey !== null && oldKey.toLowerCase() !== key.toLowerCase()
  if (value === '') return { remove: [oldKey ?? key] }
  return { remove: isRenamed ? [oldKey] : [], set: [{ key, value }] }
}

/** `/facts` arguments: `` | `list`, `[set] <key> = <value>`, `rm <key>`, `clear`, `send`, `mode <off|auto|always>`, `hide`, `show`. */
export type Command =
  | { kind: 'list' }
  | { kind: 'change'; change: Change }
  | { kind: 'clear' }
  | { kind: 'hide' }
  | { kind: 'show' }
  | { kind: 'send' }
  | { kind: 'mode'; mode: Mode }
  | { kind: 'usage' }

export function parseCommand(args: string): Command {
  const text = args.trim()
  if (text === '' || text === 'list') return { kind: 'list' }
  if (text === 'clear') return { kind: 'clear' }
  if (text === 'hide') return { kind: 'hide' }
  if (text === 'show') return { kind: 'show' }
  if (text === 'send') return { kind: 'send' }

  const mode = /^mode\s+(off|auto|always)$/.exec(text)
  if (mode) return { kind: 'mode', mode: mode[1] as Mode }

  const set = /^(?:set\s+)?([^=]+?)\s*=\s*([\s\S]+)$/.exec(text)
  if (set) return { kind: 'change', change: { set: [{ key: set[1] ?? '', value: set[2] ?? '' }] } }

  const rm = /^(?:rm|remove)\s+([\s\S]+)$/.exec(text)
  if (rm) return { kind: 'change', change: { remove: [rm[1] ?? ''] } }

  return { kind: 'usage' }
}

export const USAGE = 'Usage: /facts [list] | [set] <key> = <value> | rm <key> | clear | send | mode <off|auto|always> | hide | show'
