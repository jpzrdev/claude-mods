import type { RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { cells, level, untilReset } from '../hooks/format'
import { barSvg } from '../hooks/svg'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('the bar fills in proportion to 100%', () => {
  expect(cells(0, 20)).toEqual({ filled: 0, empty: 20 })
  expect(cells(50, 20).filled).toBe(10)
  expect(cells(130, 20)).toEqual({ filled: 20, empty: 0 })
  expect(barSvg('five_hour', 25, 'ok')).toContain('width="250.0"')
  expect(barSvg('five_hour', 0, 'ok')).not.toContain('#7C9CF5')
})

test('levels turn amber at 70% and red at 90%', () => {
  expect(level(69.9)).toBe('ok')
  expect(level(70)).toBe('high')
  expect(level(90)).toBe('critical')
})

test('time until reset', () => {
  expect(untilReset('2026-10-07T14:13:00Z', NOW)).toBe('resets in 2h 13m')
  expect(untilReset('2026-10-10T15:00:00Z', NOW)).toBe('resets in 3d 3h')
  expect(untilReset('2026-10-07T12:05:00Z', NOW)).toBe('resets in 5m')
  expect(untilReset(undefined, NOW)).toBe('')
})

test('the band shows session and weekly usage with percent and reset', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, null) as RenderElement
  })

  await $.session.measure({
    context: { tokens: 0, window: 200_000 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 61, resetsAt: '2026-10-10T15:00:00Z' },
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-07T14:13:00Z' },
    ],
    changed: ['rateLimits'],
  })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bars', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Session \(5h\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Weekly/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /24%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets in 2h 13m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets in 3d 3h/ })).toBeDefined()
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
    }
    await ui.unmount()
  }
})
