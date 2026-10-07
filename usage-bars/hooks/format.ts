import type { Limit } from '../types'

const LABELS: Record<string, string> = {
  five_hour: 'Session (5h)',
  seven_day: 'Weekly',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
  spend_limit: 'Spend',
}

export type Level = 'ok' | 'high' | 'critical'

export const label = (kind: string) => LABELS[kind] ?? kind

export const clamp = (percent: number) => Math.min(Math.max(percent, 0), 100)

export const level = (percent: number): Level =>
  percent >= 90 ? 'critical' : percent >= 70 ? 'high' : 'ok'

/** A terminal bar of `width` cells, split into the filled and the empty run. */
export const cells = (percent: number, width: number) => {
  const filled = Math.round((clamp(percent) / 100) * width)
  return { filled, empty: width - filled }
}

export const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resetting…'
  const minutes = Math.ceil(ms / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return `resets in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`
}

// Session first, then the weekly windows, then anything else.
export const ordered = (limits: readonly Limit[]) =>
  [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))

const rank = (kind: string) =>
  kind === 'five_hour' ? 0 : kind === 'seven_day' ? 1 : kind.startsWith('seven_day') ? 2 : 3
