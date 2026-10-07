import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextSize, Fact, Mode, Presence } from '../types'
import { applyChange, contextBlock, editChange, listFacts, parseCommand, USAGE } from './facts'
import type { Change } from './facts'
import { freshness, LEVEL_COLOR, shouldSend } from './freshness'
import { dotSvg } from './svg'

const TOOL = 'update_case_facts'
const TOOL_ID = 'mcp__case-facts__update_case_facts'

const facts = atom({ plugin: 'case-facts', key: 'facts' } as const, [] as Fact[])
const isMinimized = atom({ plugin: 'case-facts', key: 'isMinimized' } as const, false)
const mode = atom({ plugin: 'case-facts', key: 'mode' } as const, 'auto' as Mode)
const presence = atom({ plugin: 'case-facts', key: 'presence' } as const, null as Presence | null)
const context = atom({ plugin: 'case-facts', key: 'context' } as const, { tokens: 0, window: 0, compactions: 0 } as ContextSize)
const isSendQueued = atom({ plugin: 'case-facts', key: 'isSendQueued' } as const, false)
const editing = atom({ plugin: 'case-facts', key: 'editing' } as const, null as string | null)

const MODE_LABEL: Record<Mode, string> = { off: 'Off', auto: 'Auto', always: 'Always' }

/** Reads the context's size off the session (free: no breakdown asked). */
async function refreshContext($: EngineInterface): Promise<ContextSize> {
  const usage = await $.session.usage()
  return update($, context, now => ({
    tokens: usage.context.tokens ?? now.tokens,
    window: usage.context.window,
    compactions: now.compactions,
  }))
}

/** The whole list just entered the conversation (a tool result, a command's output, a prompt's context). */
async function markPresent($: EngineInterface, at?: ContextSize) {
  const now = at ?? (await refreshContext($))
  await update($, presence, () => ({ tokens: now.tokens, compactions: now.compactions }))
  await update($, isSendQueued, () => false)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description: [
        "Records, changes or removes the current task's case facts: durable facts such as decisions the user made, identifiers, numbers, paths, constraints and the goal. The user sees them above the prompt, and they are restated in the conversation when they are at risk of being forgotten.",
        'Record a fact when one is established or changes, reusing an existing key for the same subject (the result lists the current facts). Keep values short and factual, skip transient details, and batch changes into one call.',
        '`set` adds or replaces facts by key (an empty value removes one); `remove` drops keys.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          set: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'A short, stable name, e.g. "branch" or "goal".' },
                value: { type: 'string', description: 'The fact, in one short line.' },
              },
              required: ['key', 'value'],
            },
          },
          remove: { type: 'array', items: { type: 'string' } },
        },
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'facts',
      description: 'Case facts: [list] | [set] <key> = <value> | rm <key> | clear | send | mode <off|auto|always> | hide | show',
    })
    await refreshContext($)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, facts, () => [])
      await update($, presence, () => null)
      await update($, context, () => ({ tokens: 0, window: 0, compactions: 0 }))
      await update($, isSendQueued, () => false)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.trigger !== 'precompute' && e.agentId === undefined && result.skip === undefined) {
      await update($, context, now => ({ ...now, compactions: now.compactions + 1 }))
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    await refreshContext($)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const list = await read($, facts)
    if (list.length === 0 || e.text.trimStart().startsWith('/')) return next(e)

    const now = await refreshContext($)
    const { level } = freshness(await read($, presence), now)
    if (!shouldSend(await read($, mode), level, await read($, isSendQueued))) return next(e)

    const result = await next({ ...e, context: [...(e.context ?? []), contextBlock(list)] })
    await markPresent($, now)

    return result
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const input = e as unknown as Change
    const after = await update($, facts, list => applyChange(list, input))
    await markPresent($)

    return { result: `Case facts now:\n${listFacts(after)}` }
  })

  on('command.run', { command: 'facts' }, async ($, e) => {
    const command = parseCommand(e.args)

    switch (command.kind) {
      case 'list': {
        const list = await read($, facts)
        if (list.length > 0) await markPresent($)
        return { text: `Case facts:\n${listFacts(list)}` }
      }
      case 'change': {
        const after = await update($, facts, list => applyChange(list, command.change))
        await markPresent($)
        return { text: `Case facts:\n${listFacts(after)}` }
      }
      case 'clear':
        await update($, facts, () => [])
        await update($, presence, () => null)
        return { text: 'Case facts cleared.' }
      case 'send':
        await update($, isSendQueued, () => true)
        return { text: 'The case facts will be sent with your next message.' }
      case 'mode':
        await update($, mode, () => command.mode)
        return { text: `Case facts mode: ${MODE_LABEL[command.mode]}.` }
      case 'hide':
      case 'show':
        await update($, isMinimized, () => command.kind === 'hide')
        return { text: command.kind === 'hide' ? 'Case facts band minimized.' : 'Case facts band expanded.' }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, facts)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const isSmall = await read($, isMinimized)
    const current = await read($, mode)
    const isQueued = await read($, isSendQueued)
    const { level, message, detail } = freshness(await read($, presence), await read($, context))
    const color = LEVEL_COLOR[level]
    const willSend = shouldSend(current, level, isQueued)
    const toggleSize = () => update($, isMinimized, now => !now)

    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // The app, the editor and the phone draw the level's dot in SVG; the terminal, as a colored glyph.
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined

    const dot = Svg ? <Svg source={dotSvg(level)} alt={message} width={12} height={12} /> : <Text color={color}>●</Text>
    // A toggle: in the app, its own rounded button, the primary look when on; in the terminal, a chip,
    // the label on a filled background, gray and dim when off, green when on.
    const chip = (key: string, isOn: boolean, label: string, onPress: () => unknown) =>
      e.surface === 'terminal' ? (
        <Box backgroundColor={isOn ? 'success' : 'subtle'} paddingX={1}>
          <Button key={key} plain label={label} dimColor={!isOn} onPress={onPress} />
        </Box>
      ) : (
        <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={onPress} />
      )

    // The title row holds the toggles too, so they stay within reach while the band is minimized.
    const header = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box gap={1} alignItems="center">
          <Button key="size" plain label={isSmall ? '▸' : '▾'} onPress={toggleSize} />
          <Text bold>Case facts ({list.length})</Text>
          {isSmall && dot}
        </Box>
        <Box gap={1} alignItems="center">
          {chip('auto', current === 'auto', 'Auto', () => update($, mode, now => (now === 'auto' ? 'off' : 'auto')))}
          {chip('send', isQueued, 'Send in next message', () => update($, isSendQueued, now => !now))}
        </Box>
      </Box>
    )
    if (isSmall) return header

    // The controls take the right side; the facts get what is left, drawn as a JSON object, a line each.
    const side = Math.min(48, Math.floor(e.props.bodyColumns / 2))
    const width = Math.max(12, e.props.bodyColumns - side - 4)
    const json = (text: string) => JSON.stringify(text)
    const clip = (text: string) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)

    // Editing happens in place where the surface has a text field (not the phone). An edit the model
    // has not seen yet rides along with the next message.
    const Input = 'Input' in table ? table.Input : undefined
    const edited = await read($, editing)
    const stopEditing = () => update($, editing, () => null)
    const save = async (oldKey: string | null, text: string) => {
      const change = editChange(oldKey, text)
      if (change) {
        await update($, facts, now => applyChange(now, change))
        await update($, isSendQueued, () => true)
      }
      await stopEditing()
    }
    const editor = (id: string, oldKey: string | null, value: string) =>
      Input && (
        <Box gap={1}>
          <Input
            key={`edit:${id}`}
            value={value}
            placeholder="key: value"
            submitLabel="save"
            autoFocus
            onSubmit={text => save(oldKey, text)}
          />
          <Button key={`cancel:${id}`} plain dimColor label="✕" onPress={stopEditing} />
        </Box>
      )
    const isEditing = (fact: Fact) => edited !== null && edited.toLowerCase() === fact.key.toLowerCase()
    const factRow = (fact: Fact, at: number) => (
      <Box paddingLeft={2}>
        {isEditing(fact) ? (
          editor(fact.key, fact.key, `${fact.key}: ${fact.value}`)
        ) : (
          <Button
            key={`fact:${fact.key}`}
            plain
            label={clip(`${json(fact.key)}: ${json(fact.value)}${at < list.length - 1 ? ',' : ''}`)}
            onPress={() => (Input ? update($, editing, () => fact.key) : undefined)}
          />
        )}
      </Box>
    )
    const adder =
      Input &&
      (edited === '' ? (
        <Box paddingLeft={2}>{editor('new', null, '')}</Box>
      ) : (
        <Button key="add" plain dimColor label="+ Add fact" onPress={() => update($, editing, () => '')} />
      ))

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column" flexShrink={1}>
            <Text dimColor>{'{'}</Text>
            {list.map(factRow)}
            {edited === '' && adder}
            <Text dimColor>{'}'}</Text>
            {edited !== '' && adder}
          </Box>
          <Box flexDirection="column" alignItems="flex-end" flexShrink={0} width={side} marginTop={1}>
            <Box gap={1} alignItems="center">
              <Text wrap="truncate">{message}</Text>
              {dot}
            </Box>
            <Text dimColor wrap="truncate">
              {willSend ? 'sent with your next message' : detail}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
