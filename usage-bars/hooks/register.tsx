import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Usage } from '../types'
import { cells, label, level, ordered, untilReset } from './format'
import type { Level } from './format'
import { BAR_HEIGHT, barSvg } from './svg'

const usage = atom({ plugin: 'usage-bars', key: 'usage' } as const, { limits: [], now: 0 } as Usage)

const TERMINAL_COLOR: Record<Level, string> = { ok: 'suggestion', high: 'warning', critical: 'error' }

const plain = (limits: readonly Limit[]): Limit[] =>
  limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const [{ rateLimits }, now] = await Promise.all([$.session.usage(), $.clock.now()])
    await update($, usage, () => ({ limits: plain(rateLimits), now }))

    // Keeps the reset countdown current.
    $.clock.every(30_000, async () => {
      const now = await $.clock.now()
      await update($, usage, u => ({ ...u, now }))
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const now = await $.clock.now()
      await update($, usage, () => ({ limits: plain(e.rateLimits), now }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { limits, now } = await read($, usage)
    if (e.props.hasSurvey || limits.length === 0) {
      return next(e)
    }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    const barColumns = Math.max(10, Math.min(48, e.props.bodyColumns - 40))

    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={Svg ? 1 : 0}>
        <Box justifyContent="space-between">
          <Text bold>usage</Text>
          <Text dimColor>plan limits</Text>
        </Box>
        {ordered(limits).map(limit => {
          const lvl = level(limit.percentUsed)
          const percent = `${Math.round(limit.percentUsed)}%`
          const reset = untilReset(limit.resetsAt, now)
          const alt = `${label(limit.kind)}: ${percent} used${reset ? `, ${reset}` : ''}`

          if (Svg) {
            return (
              <Box key={limit.kind} flexDirection="column">
                <Box justifyContent="space-between">
                  <Text>{label(limit.kind)}</Text>
                  <Text>
                    <Text bold>{percent}</Text>
                    <Text dimColor> used{reset ? ` · ${reset}` : ''}</Text>
                  </Text>
                </Box>
                <Svg source={barSvg(limit.kind, limit.percentUsed, lvl)} alt={alt} height={BAR_HEIGHT} />
              </Box>
            )
          }

          const { filled, empty } = cells(limit.percentUsed, barColumns)
          return (
            <Box key={limit.kind}>
              <Text>{label(limit.kind).padEnd(16)}</Text>
              <Text color={TERMINAL_COLOR[lvl]}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'━'.repeat(empty)}</Text>
              <Text bold> {percent.padStart(4)}</Text>
              <Text dimColor>{reset ? `  ${reset}` : ''}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
