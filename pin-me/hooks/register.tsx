import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Item } from '../types'
import { applyChange, editChange, isNoteKey, isPinKey, nextNoteKey, parseCommand, pinLabel, pinSearch, pinTag, USAGE } from './items'

const items = atom({ plugin: 'pin-me', key: 'items' } as const, [] as Item[])
const isMinimized = atom({ plugin: 'pin-me', key: 'isMinimized' } as const, false)
const editing = atom({ plugin: 'pin-me', key: 'editing' } as const, null as string | null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pin-me',
      description: 'Pin me: show or hide the band, or clear it: [hide | show | clear]',
    })

    return next(e)
  })

  // Command replies never echo the items: they would enter the conversation.
  on('command.run', { command: 'pin-me' }, async ($, e) => {
    const command = parseCommand(e.args)

    switch (command.kind) {
      case 'toggle': {
        const isHidden = await update($, isMinimized, now => !now)
        return { text: isHidden ? 'Pin me minimized.' : 'Pin me expanded.' }
      }
      case 'hide':
      case 'show':
        await update($, isMinimized, () => command.kind === 'hide')
        return { text: command.kind === 'hide' ? 'Pin me minimized.' : 'Pin me expanded.' }
      case 'clear':
        await update($, items, () => [])
        await update($, editing, () => null)
        return { text: 'Pin me cleared.' }
      default:
        return { text: USAGE }
    }
  })

  // A pin beside every prompt and reply: pressing it keeps the message in the band (by a tag of its id),
  // with words of its own text, which the app's find (Ctrl+F) matches to bring the message back.
  on('ui.render', { component: ['UserMessage', 'AssistantMessage'] }, async ($, e, next) => {
    if (e.component === 'UserMessage' && e.props.origin.kind !== 'composer') return next(e)

    const tag = pinTag(e.requestId)
    const isPinned = (await read($, items)).some(item => item.key === tag)
    const row = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const role = e.component === 'UserMessage' ? 'user' : 'assistant'
    const label = pinLabel(role, e.props.text)
    const pin = () =>
      update($, items, now =>
        applyChange(now, now.some(item => item.key === tag) ? { remove: [tag] } : { set: [{ key: tag, value: label }] }),
      )

    return (
      <Box flexDirection="row" gap={1}>
        <Box flexGrow={1} flexShrink={1}>
          {row}
        </Box>
        {isPinned && <Text dimColor>pinned</Text>}
        <Button key={`pin:${e.requestId}`} plain dimColor={!isPinned} label="📌" onPress={pin} />
      </Box>
    )
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
        <Text bold>Pin me ({list.length})</Text>
      </Box>
    )
    // Stacked over what the plugins beneath draw (usage-bars, say), never in place of it.
    const below = next(e)
    // A card of its own, apart from the cards beneath.
    const cardProps = { flexDirection: 'column', borderStyle: 'round', borderDimColor: true, paddingX: 1 } as const
    if (isSmall) {
      const rest = await below
      return (
        <Box flexDirection="column" gap={rest ? 1 : 0}>
          <Box {...cardProps}>{header}</Box>
          {rest}
        </Box>
      )
    }

    const width = Math.max(12, e.props.bodyColumns - 24)
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
    // A note pasted without a key shows as its text alone.
    const shown = (item: Item) =>
      isNoteKey(item.key) ? item.value : isPinKey(item.key) ? `📌 ${item.value}` : `${item.key}: ${item.value}`
    const isEditing = (item: Item) => edited !== null && edited.toLowerCase() === item.key.toLowerCase()
    const remove = (item: Item) => update($, items, now => applyChange(now, { remove: [item.key] }))
    // The app's find searches the messages' own text, not what a plugin draws, so it is given words of the message.
    // On the Windows desktop app the find opens with them typed in and goes to them; elsewhere they are copied.
    const find = async (item: Item) => {
      const words = pinSearch(item.value)
      if (e.surface === 'desktop') {
        // SendKeys mistypes accented letters, so the words are pasted: put on the clipboard through the
        // environment, and the person's own clipboard text put back after.
        const keys =
          '$old = Get-Clipboard -Raw; Set-Clipboard -Value $env:INFO_HOLDER_FIND; $w = New-Object -ComObject WScript.Shell; ' +
          "$w.SendKeys('^f'); Start-Sleep -Milliseconds 250; $w.SendKeys('^a'); $w.SendKeys('^v'); Start-Sleep -Milliseconds 150; " +
          "$w.SendKeys('{ENTER}'); Start-Sleep -Milliseconds 150; if ($null -ne $old) { Set-Clipboard -Value $old }"
        const typed = await $.process
          .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', keys], {
            env: { INFO_HOLDER_FIND: words },
            timeoutMs: 10_000,
          })
          .then(({ exitCode }) => exitCode === 0, () => false)
        if (typed) return
      }
      const { isCopied } = await $.ui.copy({ text: words, surface: e.surface })
      $.ui.toast(isCopied ? 'Copied the words: search for them with Ctrl+F.' : 'Could not copy.')
    }
    const copy = async (item: Item) => {
      const { isCopied } = await $.ui.copy({ text: item.value, surface: e.surface })
      $.ui.toast(isCopied ? 'Copied.' : 'Could not copy.')
    }
    // The text, then its small copy and delete buttons beside it, on one row.
    const itemRow = (item: Item) =>
      isEditing(item) ? (
        <Box paddingLeft={2}>{editor(item.key, item.key, shown(item))}</Box>
      ) : (
        <Box paddingLeft={2} flexDirection="row" alignItems="center" gap={1}>
          <Button
            key={`item:${item.key}`}
            plain
            label={clip(shown(item))}
            onPress={() => (Input ? update($, editing, () => item.key) : undefined)}
          />
          {isPinKey(item.key) ? (
            <Button key={`find:${item.key}`} variant="secondary" dimColor label="find" onPress={() => find(item)} />
          ) : (
            <Button key={`copy:${item.key}`} variant="secondary" dimColor label="copy" onPress={() => copy(item)} />
          )}
          <Button key={`delete:${item.key}`} variant="secondary" dimColor label="delete" onPress={() => remove(item)} />
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

    const rest = await below
    return (
      <Box flexDirection="column" gap={rest ? 1 : 0}>
        <Box {...cardProps}>
          {header}
          {list.map(itemRow)}
          {adder}
        </Box>
        {rest}
      </Box>
    )
  })
}
