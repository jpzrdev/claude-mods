import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyChange, editChange, nextNoteKey, parseCommand } from '../hooks/items'

// `/info <args>` as the person types it.
const info = ($: Engine, args: string) =>
  $.command.run({
    command: 'info',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** Stands for the engine beneath the plugin: prompts that enter as given, an empty band. */
function engine(on: On) {
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context ?? [] }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, null) as RenderElement
  })
}

const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} }

const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'desktop') =>
  $.ui.mount({ plugin: 'info-holder', surface, component: 'AbovePrompt', props })

test('items are added, edited and removed in the band', async ($, on) => {
  engine(on)
  const ui = await mount($)

  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'order: 48213' })
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'status paid, shipped on Monday' })
  expect(await ui.find({ key: 'item:order' })).toBeDefined()
  expect((await ui.find({ key: 'item:note 1' }))?.props.label).toBe('status paid, shipped on Monday')
  expect(await ui.find({ type: 'Text', text: /Info holder \(2\)/ })).toBeDefined()

  await ui.press({ key: 'item:order' })
  await ui.input({ key: 'edit:order', text: 'order:' })
  expect(await ui.find({ key: 'item:order' })).toBeUndefined()
  await ui.unmount()
})

test('the items never ride along with a prompt', async ($, on) => {
  engine(on)
  const ui = await mount($)
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'secret: 1234' })
  await ui.unmount()

  const result = await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  const context = 'context' in result ? (result.context ?? []) : []
  expect(context.join('\n')).not.toContain('1234')
})

test('command replies never echo the items', async ($, on) => {
  engine(on)
  const ui = await mount($)
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'secret: 1234' })
  await ui.unmount()

  for (const args of ['', 'hide', 'show', 'what']) {
    const result = await info($, args)
    expect(JSON.stringify(result)).not.toContain('1234')
  }
})

test('minimized, the band shows the title alone; /info toggles it and clears it', async ($, on) => {
  engine(on)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'goal: ship' })

  await ui.press({ key: 'size' })
  expect(await ui.find({ type: 'Text', text: /Info holder \(1\)/ })).toBeDefined()
  expect(await ui.find({ key: 'item:goal' })).toBeUndefined()
  await info($, '')
  expect(await ui.find({ key: 'item:goal' })).toBeDefined()

  await info($, 'clear')
  expect(await ui.find({ key: 'item:goal' })).toBeUndefined()
  await ui.unmount()
})

test('editChange keeps, renames, removes and adds', () => {
  expect(editChange('salary', '4500')).toEqual({ remove: [], set: [{ key: 'salary', value: '4500' }] })
  expect(editChange('salary', 'pay: 4500')).toEqual({ remove: ['salary'], set: [{ key: 'pay', value: '4500' }] })
  expect(editChange('salary', 'salary:')).toEqual({ remove: ['salary'] })
  expect(editChange(null, 'goal = ship')).toEqual({ remove: [], set: [{ key: 'goal', value: 'ship' }] })
  expect(editChange(null, 'plain text', 'note 2')).toEqual({ remove: [], set: [{ key: 'note 2', value: 'plain text' }] })
  expect(editChange(null, 'https://x.dev/a', 'note 1')).toEqual({ remove: [], set: [{ key: 'note 1', value: 'https://x.dev/a' }] })
  expect(editChange(null, '  ')).toBeNull()
  expect(editChange('note 1', 'see: https://x.dev')).toEqual({ remove: [], set: [{ key: 'note 1', value: 'see: https://x.dev' }] })
  expect(editChange('note 1', ' ')).toEqual({ remove: ['note 1'] })
})

test('nextNoteKey skips taken keys', () => {
  expect(nextNoteKey([])).toBe('note 1')
  expect(nextNoteKey([{ key: 'Note 1', value: 'a' }, { key: 'note 3', value: 'b' }])).toBe('note 2')
})

test('applyChange caps lengths and an empty value removes', () => {
  const list = applyChange([], { set: [{ key: 'a', value: 'x'.repeat(3000) }] })
  expect(list[0]?.value.length).toBe(2000)
  expect(applyChange(list, { set: [{ key: 'A', value: '  ' }] })).toEqual([])
})

test('parseCommand reads every form', () => {
  expect(parseCommand('')).toEqual({ kind: 'toggle' })
  expect(parseCommand('hide')).toEqual({ kind: 'hide' })
  expect(parseCommand('clear')).toEqual({ kind: 'clear' })
  expect(parseCommand('a = b')).toEqual({ kind: 'usage' })
})
