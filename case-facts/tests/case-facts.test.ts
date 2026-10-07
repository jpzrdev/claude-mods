import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyChange, editChange, parseCommand } from '../hooks/facts'
import { freshness, shouldSend } from '../hooks/freshness'

const TOOL_ID = 'mcp__case-facts__update_case_facts'
const WINDOW = 200_000

// `/facts <args>` as the person types it.
const facts = ($: Engine, args: string) =>
  $.command.run({
    command: 'facts',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** Stands for the engine beneath the plugin: a context of `size()` tokens, prompts that enter as given. */
function engine(on: On, size: () => number) {
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: size(), window: WINDOW }, rateLimits: [] } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context ?? [] }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, null) as RenderElement
  })
}

const send = async ($: Engine, text = 'hello') => {
  const result = await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
  return 'context' in result ? (result.context ?? []) : []
}

const hasBlock = (context: readonly string[]) => context.some(block => block.startsWith('<case-facts>'))

test('auto sends once the facts are far behind, then not while they are fresh', async ($, on) => {
  let tokens = 10_000
  engine(on, () => tokens)

  await facts($, 'salary = 4500') // the command's output restates them at 10k
  expect(hasBlock(await send($))).toBe(false)

  tokens = 40_000
  const context = await send($)
  expect(hasBlock(context)).toBe(true)
  expect(context.join('\n')).toContain('- salary: 4500')

  tokens = 45_000
  expect(hasBlock(await send($))).toBe(false)
})

test('mode always sends every prompt; off never; send queues one', async ($, on) => {
  engine(on, () => 10_000)
  await facts($, 'goal = ship')

  await facts($, 'mode always')
  expect(hasBlock(await send($))).toBe(true)
  expect(hasBlock(await send($))).toBe(true)

  await facts($, 'mode off')
  expect(hasBlock(await send($))).toBe(false)
  await facts($, 'send')
  expect(hasBlock(await send($))).toBe(true)
  expect(hasBlock(await send($))).toBe(false)
})

test('a slash command never carries the facts', async ($, on) => {
  engine(on, () => 10_000)
  await facts($, 'goal = ship')
  await facts($, 'mode always')
  expect(hasBlock(await send($, '/help'))).toBe(false)
})

test('the model records, replaces and removes facts through its tool', async ($, on) => {
  engine(on, () => 10_000)
  await $.tool.call({ tool: TOOL_ID, set: [{ key: 'goal', value: 'ship v1' }, { key: 'branch', value: 'feat/x' }] })
  const result = await $.tool.call({ tool: TOOL_ID, set: [{ key: 'Goal', value: 'ship v2' }], remove: ['branch'] })
  expect('result' in result ? result.result : undefined).toBe('Case facts now:\n- Goal: ship v2')
})

test('freshness follows the distance, compaction and a crowded context', () => {
  const context = (tokens: number, compactions = 0) => ({ tokens, window: WINDOW, compactions })
  const at = { tokens: 10_000, compactions: 0 }

  expect(freshness(null, context(10_000)).level).toBe('red')
  expect(freshness(at, context(12_000)).level).toBe('green')
  expect(freshness(at, context(20_000)).level).toBe('blue')
  expect(freshness(at, context(26_000)).level).toBe('yellow')
  expect(freshness(at, context(31_000)).level).toBe('orange')
  expect(freshness(at, context(36_000)).level).toBe('red')
  expect(freshness(at, context(5_000, 1)).level).toBe('red')
  // Past half the window the same distance weighs 1.5x: 12k is blue at 10k, yellow at 122k.
  expect(freshness({ tokens: 110_000, compactions: 0 }, context(122_000)).level).toBe('yellow')
})

test('shouldSend by mode', () => {
  expect(shouldSend('auto', 'yellow', false)).toBe(false)
  expect(shouldSend('auto', 'orange', false)).toBe(true)
  expect(shouldSend('off', 'red', false)).toBe(false)
  expect(shouldSend('off', 'green', true)).toBe(true)
  expect(shouldSend('always', 'green', false)).toBe(true)
})

test('the band shows the facts, the toggles and the level; minimized, the title and the dot', async ($, on) => {
  engine(on, () => 10_000)
  await facts($, 'goal = ship v1')
  for (const surface of ['terminal', 'desktop'] as const) {
    await facts($, 'show')
    const ui = await $.ui.mount({
      plugin: 'case-facts',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
    })
    expect(await ui.find({ key: 'fact:goal' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Context remembers it/ })).toBeDefined()

    await ui.press({ key: 'send' })
    expect(await ui.find({ type: 'Text', text: /sent with your next message/ })).toBeDefined()
    await ui.press({ key: 'send' })

    await ui.press({ key: 'size' })
    expect(await ui.find({ type: 'Text', text: /Case facts \(1\)/ })).toBeDefined()
    expect(await ui.find({ key: 'fact:goal' })).toBeUndefined()
    expect(await ui.find({ key: 'auto' })).toBeDefined()
    await ui.press({ key: 'size' })
    expect(await ui.find({ key: 'fact:goal' })).toBeDefined()
    await ui.unmount()
  }
})

test('toggles are bordered labels on every surface; the app draws the dot in SVG', async ($, on) => {
  engine(on, () => 10_000)
  await facts($, 'goal = ship')
  const props = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} }

  const app = await $.ui.mount({ plugin: 'case-facts', surface: 'desktop', component: 'AbovePrompt', props })
  expect(await app.find({ type: 'Svg' })).toBeDefined()
  expect(String((await app.find({ key: 'auto' }))?.props.label)).toBe('Auto')
  expect((await app.find({ key: 'auto' }))?.props.variant).toBe('primary')
  expect((await app.find({ key: 'send' }))?.props.variant).toBe('secondary')
  await app.unmount()

  const terminal = await $.ui.mount({ plugin: 'case-facts', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(String((await terminal.find({ key: 'auto' }))?.props.label)).toBe('Auto')
  await terminal.unmount()
})

test('the Auto toggle turns auto off and on', async ($, on) => {
  engine(on, () => 40_000)
  await facts($, 'goal = ship')
  await facts($, 'mode off')
  const ui = await $.ui.mount({
    plugin: 'case-facts',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await ui.find({ key: 'auto' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'auto' })
  expect((await ui.find({ key: 'auto' }))?.props.dimColor).toBe(false)
  await ui.press({ key: 'auto' })
  expect((await ui.find({ key: 'auto' }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('a fact is edited and added in the band, and the edit rides the next message', async ($, on) => {
  engine(on, () => 10_000)
  await facts($, 'salary = 2000')
  const ui = await $.ui.mount({
    plugin: 'case-facts',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

  await ui.press({ key: 'fact:salary' })
  await ui.input({ key: 'edit:salary', text: 'salary: 4500' })
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'goal: ship' })
  await ui.unmount()

  const context = (await send($)).join('\n')
  expect(context).toContain('- salary: 4500')
  expect(context).toContain('- goal: ship')
})

test('editChange keeps, renames, removes and adds', () => {
  expect(editChange('salary', '4500')).toEqual({ remove: [], set: [{ key: 'salary', value: '4500' }] })
  expect(editChange('salary', 'pay: 4500')).toEqual({ remove: ['salary'], set: [{ key: 'pay', value: '4500' }] })
  expect(editChange('salary', 'salary:')).toEqual({ remove: ['salary'] })
  expect(editChange('salary', '')).toEqual({ remove: ['salary'] })
  expect(editChange(null, 'goal = ship')).toEqual({ remove: [], set: [{ key: 'goal', value: 'ship' }] })
  expect(editChange(null, 'nonsense')).toBeNull()
  expect(editChange(null, '  ')).toBeNull()
})

test('applyChange caps lengths and an empty value removes', () => {
  const list = applyChange([], { set: [{ key: 'a', value: 'x'.repeat(500) }] })
  expect(list[0]?.value.length).toBe(300)
  expect(applyChange(list, { set: [{ key: 'A', value: '  ' }] })).toEqual([])
})

test('parseCommand reads every form', () => {
  expect(parseCommand('')).toEqual({ kind: 'list' })
  expect(parseCommand('salary = 2000')).toEqual({ kind: 'change', change: { set: [{ key: 'salary', value: '2000' }] } })
  expect(parseCommand('set a b = c = d')).toEqual({ kind: 'change', change: { set: [{ key: 'a b', value: 'c = d' }] } })
  expect(parseCommand('rm a')).toEqual({ kind: 'change', change: { remove: ['a'] } })
  expect(parseCommand('mode always')).toEqual({ kind: 'mode', mode: 'always' })
  expect(parseCommand('send')).toEqual({ kind: 'send' })
  expect(parseCommand('what')).toEqual({ kind: 'usage' })
})
