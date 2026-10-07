# pin-me

Pins and notes above the prompt for long Claude Code sessions.

Forty messages in, the answer you need is somewhere up in the scroll: the plan Claude wrote, the query that worked, the value it found in a log. Pin that message when you see it, and later one click takes you back to it. Or paste the value itself into the band, and it stays above the prompt for the rest of the session.

What the band holds is for you only. It is never sent to the model: not with your messages, not in the system prompt, not in command output.

## Pinning messages

- **📌 beside each message.** Every prompt you type and every reply from Claude gets a faint 📌 on the right. Press it to pin the message: the row then shows `pinned 📌`, and the band lists it as `📌 you: …` or `📌 claude: …` with the message's first words. Press the pin again to unpin it.
- **find** takes you back to a pinned message. In the desktop app on Windows it opens the app's find (Ctrl+F), pastes the message's words and goes to the first match. Your clipboard is put back afterwards. Anywhere else it copies the words, so you paste them into your terminal's search.
- The words come from the message itself: the first plain run of text, up to 40 characters, skipping headings, bold, code and links (the app's find searches the text as it is shown). If the same words appear in another message, the find may land there first; press Enter or ↓ for the next match.

Why a search and not a jump: Claude Code only lets a mod scroll the transcript in the terminal's fullscreen mode, and the desktop app has no "go to message" a mod can call. The app's own find is what scrolls there.

## Notes

- **+ Add** opens a field: paste text and press Enter. Type `key: value` (or `key = value`) to name it; text without a key (or a bare URL) is saved as a plain note and shown as its text alone.
- **Click a note** to edit it in place. Change the key to rename it, or empty the value to remove it.
- **copy**, beside each note, puts its text (the value, without the key) on the clipboard; **delete** removes it.
- **▾ / ▸** collapses the band to its title.

Long values are cut off with `…` in the list; click the note to see all of it. Each note is one line of up to 2,000 characters. Pins and notes belong to the session and survive `/clear`; the band holds 50 of them.

## Install

In a terminal session of Claude Code:

```
/plugin install pin-me --marketplace jpzrdev/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope so it works in every project. A mod installed at the user scope also loads in the desktop app's Code tab.

pin-me was called info-holder before 0.2.0. If you have info-holder installed, remove it (`/plugin uninstall info-holder@claude-mods`) and install pin-me.

## The `/pin-me` command

| Command | What it does |
| --- | --- |
| `/pin-me` | collapse or expand the band |
| `/pin-me hide` / `/pin-me show` | collapse or expand the band |
| `/pin-me clear` | remove every pin and note |

The command doesn't add or list items, because a command's text and its reply enter the conversation.

## Developing

```
claude plugin validate ./pin-me
claude plugin test ./pin-me
```

To run it from this folder instead of an install: `claude --plugin-dir ./pin-me`. Claude Code writes the API's type declarations into `.claude-plugin/types/` when it loads the mod, which `tsconfig.json` extends.

Built and tested on Claude Code 2.1.293. The mods API is early access and may change between releases.
