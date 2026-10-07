import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyChange, editChange, findText, isPinKey, nextNoteKey, parseCommand, pinLabel, pinTag } from '../hooks/items'

// `/pin-me <args>` as the person types it.
const pinMe = ($: Engine, args: string) =>
  $.command.run({
    command: 'pin-me',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** Stands for the engine beneath the plugin: prompts that enter as given, an empty band. */
function engine(on: On) {
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context ?? [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, null) as RenderElement
  })
}

const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} }

const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'desktop') =>
  $.ui.mount({ plugin: 'pin-me', surface, component: 'AbovePrompt', props })

test('items are added, edited and removed in the band', async ($, on) => {
  engine(on)
  const ui = await mount($)

  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'order: 48213' })
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'status paid, shipped on Monday' })
  expect(await ui.find({ key: 'item:order' })).toBeDefined()
  expect((await ui.find({ key: 'item:note 1' }))?.props.label).toBe('status paid, shipped on Monday')
  expect(await ui.find({ type: 'Text', text: /Pin me \(2\)/ })).toBeDefined()

  await ui.press({ key: 'item:order' })
  await ui.input({ key: 'edit:order', text: 'order:' })
  expect(await ui.find({ key: 'item:order' })).toBeUndefined()

  await ui.press({ key: 'delete:note 1' })
  expect(await ui.find({ key: 'item:note 1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Pin me \(0\)/ })).toBeDefined()
  await ui.unmount()
})

test('the copy button puts the text alone on the clipboard', async ($, on) => {
  engine(on)
  const copies: string[] = []
  on('ui.copy', async (_, e) => {
    copies.push(e.text)
    return { value: { isCopied: true } }
  })
  const ui = await mount($)
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'order: 48213' })
  await ui.press({ key: 'copy:order' })
  expect(copies).toEqual(['48213'])
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
    const result = await pinMe($, args)
    expect(JSON.stringify(result)).not.toContain('1234')
  }
})

test('minimized, the band shows the title alone; /pin-me toggles it and clears it', async ($, on) => {
  engine(on)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'add' })
  await ui.input({ key: 'edit:new', text: 'goal: ship' })

  await ui.press({ key: 'size' })
  expect(await ui.find({ type: 'Text', text: /Pin me \(1\)/ })).toBeDefined()
  expect(await ui.find({ key: 'item:goal' })).toBeUndefined()
  await pinMe($, '')
  expect(await ui.find({ key: 'item:goal' })).toBeDefined()

  await pinMe($, 'clear')
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

const message = ($: Engine, surface: 'terminal' | 'desktop', id: string, text: string) =>
  $.ui.mount({
    plugin: 'pin-me',
    surface,
    component: 'UserMessage',
    requestId: id,
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  })

test('a pinned message goes to the band under the tag its row shows, and unpins', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const id = `5f0c-${surface}-9a2b7e`
    const tag = pinTag(id)
    const row = await message($, surface, id, 'Fix the login bug in auth.ts please')
    const band = await mount($, surface)

    await row.press({ key: `pin:${id}` })
    expect((await row.find({ key: `pin:${id}` }))?.props.dimColor).toBe(false)
    expect(await row.find({ type: 'Text', text: 'pinned' })).toBeDefined()
    expect((await band.find({ key: `item:${tag}` }))?.props.label).toBe('📌 you: Fix the login bug in auth.ts please')
    expect(await band.find({ key: `find:${tag}` })).toBeDefined()

    await row.press({ key: `pin:${id}` })
    expect((await row.find({ key: `pin:${id}` }))?.props.dimColor).toBe(true)
    expect(await row.find({ type: 'Text', text: 'pinned' })).toBeUndefined()
    expect(await band.find({ key: `item:${tag}` })).toBeUndefined()
    await row.unmount()
    await band.unmount()
  }
})

test('find copies the words where it cannot type them into the find box', async ($, on) => {
  engine(on)
  const copies: string[] = []
  on('ui.copy', async (_, e) => {
    copies.push(e.text)
    return { value: { isCopied: true } }
  })
  const row = await message($, 'terminal', 'aaaa-bbbb-123456', 'hello there, world')
  const band = await mount($, 'terminal')
  await row.press({ key: 'pin:aaaa-bbbb-123456' })
  await band.press({ key: 'find:#123456' })
  expect(copies).toEqual(['hello there, world'])
})

test('pin tags and labels', () => {
  expect(pinTag('0f8e2c4a-1b2d-4c3e-9f00-ABCDEF123456')).toBe('#123456')
  expect(isPinKey('#12ab56')).toBe(true)
  expect(isPinKey('note 1')).toBe(false)
  expect(pinLabel('assistant', 'Found it in the logs')).toBe('claude: Found it in the logs')
  expect(findText('## Plan\n\n- **Step one** reads the `config.ts` file')).toBe('Plan')
  expect(findText('See [the docs](https://x.dev/a) for the whole story')).toBe('for the whole story')
  expect(findText('Here is a long first line that goes well past the forty letter cut')).toBe('Here is a long first line that goes well')
  expect(findText('ok')).toBe('ok')
})
