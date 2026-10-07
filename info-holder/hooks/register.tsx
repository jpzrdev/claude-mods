import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Item } from '../types'
import { applyChange, editChange, nextNoteKey, parseCommand, USAGE } from './items'

const items = atom({ plugin: 'info-holder', key: 'items' } as const, [] as Item[])
const isMinimized = atom({ plugin: 'info-holder', key: 'isMinimized' } as const, false)
const editing = atom({ plugin: 'info-holder', key: 'editing' } as const, null as string | null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'info',
      description: 'Info holder: show or hide the band, or clear it: [hide | show | clear]',
    })

    return next(e)
  })

  // Command replies never echo the items: they would enter the conversation.
  on('command.run', { command: 'info' }, async ($, e) => {
    const command = parseCommand(e.args)

    switch (command.kind) {
      case 'toggle': {
        const isHidden = await update($, isMinimized, now => !now)
        return { text: isHidden ? 'Info holder minimized.' : 'Info holder expanded.' }
      }
      case 'hide':
      case 'show':
        await update($, isMinimized, () => command.kind === 'hide')
        return { text: command.kind === 'hide' ? 'Info holder minimized.' : 'Info holder expanded.' }
      case 'clear':
        await update($, items, () => [])
        await update($, editing, () => null)
        return { text: 'Info holder cleared.' }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = await read($, items)
    const isSmall = await read($, isMinimized)
    const edited = await read($, editing)
    const toggleSize = () => update($, isMinimized, now => !now)

    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // Editing happens in place where the surface has a text field (not the phone).
    const Input = 'Input' in table ? table.Input : undefined
    // With nothing held and no field to add one, there is nothing to show.
    if (list.length === 0 && (!Input || isSmall)) return next(e)

    const header = (
      <Box gap={1} alignItems="center">
        <Button key="size" plain label={isSmall ? '▸' : '▾'} onPress={toggleSize} />
        <Text bold>Info holder ({list.length})</Text>
      </Box>
    )
    if (isSmall) return header

    const width = Math.max(12, e.props.bodyColumns - 4)
    const clip = (text: string) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)

    const stopEditing = () => update($, editing, () => null)
    const save = async (oldKey: string | null, text: string) => {
      const change = editChange(oldKey, text, nextNoteKey(await read($, items)))
      if (change) await update($, items, now => applyChange(now, change))
      await stopEditing()
    }
    const editor = (id: string, oldKey: string | null, value: string) =>
      Input && (
        <Box gap={1}>
          <Input
            key={`edit:${id}`}
            value={value}
            placeholder="paste text, or key: value"
            submitLabel="save"
            autoFocus
            onSubmit={text => save(oldKey, text)}
          />
          <Button key={`cancel:${id}`} plain dimColor label="✕" onPress={stopEditing} />
        </Box>
      )
    const isEditing = (item: Item) => edited !== null && edited.toLowerCase() === item.key.toLowerCase()
    const itemRow = (item: Item) => (
      <Box paddingLeft={2}>
        {isEditing(item) ? (
          editor(item.key, item.key, `${item.key}: ${item.value}`)
        ) : (
          <Button
            key={`item:${item.key}`}
            plain
            label={clip(`${item.key}: ${item.value}`)}
            onPress={() => (Input ? update($, editing, () => item.key) : undefined)}
          />
        )}
      </Box>
    )
    const adder =
      Input &&
      (edited === '' ? (
        <Box paddingLeft={2}>{editor('new', null, '')}</Box>
      ) : (
        <Box paddingLeft={2}>
          <Button key="add" plain dimColor label="+ Add" onPress={() => update($, editing, () => '')} />
        </Box>
      ))

    return (
      <Box flexDirection="column">
        {header}
        {list.map(itemRow)}
        {adder}
      </Box>
    )
  })
}
