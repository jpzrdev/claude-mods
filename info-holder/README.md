# info-holder

A notepad above the prompt for long Claude Code sessions.

You ask Claude to look something up (a record in the database, a value in a log, a URL) and then move on to another question. Twenty messages later you need that value, and it is somewhere up in the scroll. Paste it into the info holder instead: it stays above the prompt for the rest of the session.

The info holder is for you only. Its items are never sent to the model: not with your messages, not in the system prompt, not in command output.

## What it does

- **A band above the prompt** lists the items, one line each, as `key: value`.
- **+ Add** opens a field: paste text and press Enter. Type `key: value` (or `key = value`) to name it; text without a key (or a bare URL) is saved as `note 1`, `note 2`, and so on.
- **Click an item** to edit it in place. Change the key to rename it, or empty the value to remove it.
- **▾ / ▸** collapses the band to its title.

Long values are cut off with `…` in the list; click the item to see all of it. Each item is one line of up to 2,000 characters. Items belong to the session and survive `/clear`.

## Install

In a terminal session of Claude Code:

```
/plugin install info-holder --marketplace jpzrdev/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope so it works in every project. A mod installed at the user scope also loads in the desktop app's Code tab.

## The `/info` command

| Command | What it does |
| --- | --- |
| `/info` | collapse or expand the band |
| `/info hide` / `/info show` | collapse or expand the band |
| `/info clear` | remove every item |

The command doesn't add or list items, because a command's text and its reply enter the conversation.

## Developing

```
claude plugin validate ./info-holder
claude plugin test ./info-holder
```

To run it from this folder instead of an install: `claude --plugin-dir ./info-holder`. Claude Code writes the API's type declarations into `.claude-plugin/types/` when it loads the mod, which `tsconfig.json` extends.

Built and tested on Claude Code 2.1.293. The mods API is early access and may change between releases.
