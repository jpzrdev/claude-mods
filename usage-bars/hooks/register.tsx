import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Usage } from '../types'
import { cells, label, level, ordered, untilReset } from './format'
import type { Level } from './format'
import { BAR_HEIGHT, barSvg } from './svg'

const usage = atom({ plugin: 'usage-bars', key: 'usage' } as const, { limits: [], now: 0 } as Usage)
const isHidden = atom({ plugin: 'usage-bars', key: 'isHidden' } as const, false)

// `/usage` is built in, so the command takes the mod's name.
const COMMAND = 'usage-bars'
const HIDDEN_KEY = 'isHidden'

const TERMINAL_COLOR: Record<Level, string> = { ok: 'suggestion', high: 'warning', critical: 'error' }

const plain = (limits: readonly Limit[]): Limit[] =>
  limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the usage card above the prompt (show | hide; no argument toggles)',
    })
    const [{ rateLimits }, now, hidden] = await Promise.all([
      $.session.usage(),
      $.clock.now(),
      $.store.get(HIDDEN_KEY),
    ])
    await update($, usage, () => ({ limits: plain(rateLimits), now }))
    await update($, isHidden, () => hidden === true)

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

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'show' && arg !== 'hide') {
      return { text: `Usage: /${COMMAND} [show | hide]` }
    }
    const hide = arg === '' ? !(await read($, isHidden)) : arg === 'hide'
    await update($, isHidden, () => hide)
    await $.store.set(HIDDEN_KEY, hide)

    return { text: hide ? `Usage card hidden. /${COMMAND} brings it back.` : 'Usage card shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { limits, now } = await read($, usage)
    if (e.props.hasSurvey || limits.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    // Stacked over what the plugins beneath draw (pin-me, say), never in place of it.
    const below = next(e)
    const barColumns = Math.max(10, Math.min(48, e.props.bodyColumns - 40))

    const card = (
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

    // A blank row apart from the cards beneath, when there are any.
    const rest = await below
    return (
      <Box flexDirection="column" gap={rest ? 1 : 0}>
        {card}
        {rest}
      </Box>
    )
  })
}
