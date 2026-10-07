import type { Item } from '../types'

export const MAX_ITEMS = 50
export const MAX_KEY = 60
export const MAX_VALUE = 2000

export type Change = { set?: Item[]; remove?: string[] }

const clip = (text: string, max: number) => text.trim().replace(/\s+/g, ' ').slice(0, max)

/** Applies a change: `remove` first, then `set` (an existing key is replaced in place, an empty value removes it). */
export function applyChange(items: readonly Item[], change: Change): Item[] {
  const removed = new Set((change.remove ?? []).map(key => clip(String(key), MAX_KEY).toLowerCase()))
  const next = items.filter(item => !removed.has(item.key.toLowerCase()))

  for (const raw of change.set ?? []) {
    const key = clip(String(raw.key ?? ''), MAX_KEY)
    const value = clip(String(raw.value ?? ''), MAX_VALUE)
    if (key === '') continue
    const at = next.findIndex(item => item.key.toLowerCase() === key.toLowerCase())
    if (value === '') {
      if (at >= 0) next.splice(at, 1)
    } else if (at >= 0) {
      next[at] = { key, value }
    } else {
      next.push({ key, value })
    }
  }

  return next.slice(-MAX_ITEMS)
}

/** Whether a key was given by `nextNoteKey`: such an item shows and edits as its text alone. */
export const isNoteKey = (key: string) => /^note \d+$/i.test(key)

/** The first `note N` key not taken, for text pasted without a key. */
export function nextNoteKey(items: readonly Item[]): string {
  const taken = new Set(items.map(item => item.key.toLowerCase()))
  let n = 1
  while (taken.has(`note ${n}`)) n++
  return `note ${n}`
}

/**
 * An item edited in place, typed as `key: value` (or `key = value`). Editing `oldKey` (null for a new
 * item): a note's text is its new value whole; otherwise text without a separator is its new value (a new item gets the `newKey` given), a new key
 * renames it, and an empty value removes it.
 */
export function editChange(oldKey: string | null, text: string, newKey = 'note'): Change | null {
  // A note is edited as its text alone, so a `:` in it never renames it.
  if (oldKey !== null && isNoteKey(oldKey)) {
    return text.trim() === '' ? { remove: [oldKey] } : { remove: [], set: [{ key: oldKey, value: text }] }
  }
  const at = text.search(/[:=]/)
  // A new item whose text has no separator, or one that reads like a URL, is kept whole as a note.
  if (oldKey === null && (at < 0 || /^\w+:\/\//.test(text.trim()))) {
    return text.trim() === '' ? null : { remove: [], set: [{ key: newKey, value: text }] }
  }
  const key = (at >= 0 ? text.slice(0, at) : (oldKey ?? text)).trim()
  const value = at >= 0 ? text.slice(at + 1).trim() : oldKey === null ? '' : text.trim()
  if (key === '') return oldKey === null ? null : { remove: [oldKey] }

  const isRenamed = oldKey !== null && oldKey.toLowerCase() !== key.toLowerCase()
  if (value === '') return { remove: [oldKey ?? key] }
  return { remove: isRenamed ? [oldKey] : [], set: [{ key, value }] }
}

/**
 * `/info` arguments: `` (toggle), `hide`, `show`, `clear`. Items are added and edited in the band only:
 * a command's text and output enter the conversation, and the items must not.
 */
export type Command = { kind: 'toggle' } | { kind: 'hide' } | { kind: 'show' } | { kind: 'clear' } | { kind: 'usage' }

export function parseCommand(args: string): Command {
  const text = args.trim()
  if (text === '') return { kind: 'toggle' }
  if (text === 'hide' || text === 'show' || text === 'clear') return { kind: text }

  return { kind: 'usage' }
}

export const USAGE = 'Usage: /info [hide | show | clear]. Add and edit items in the band above the prompt.'
