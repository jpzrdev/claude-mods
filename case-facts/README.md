# case-facts

Keeps the current task's key facts in view during long Claude Code sessions.

In a long session the conversation gets summarized (compaction), and facts stated early on drift into the middle of a large context, where the model pays them less attention. Summaries are exactly where precise details get lost: was the order 48213 or 48231? Was the budget 4,500 or 5,400?

*Case facts* is the agent-design answer to this: keep the task's facts in a small structured block outside the history and restate it, so the history can be summarized freely while the facts can't be lost. This mod does that inside Claude Code.

## What it does

- **The model records facts by itself.** A tool, `update_case_facts`, lets Claude add, change and remove facts as they come up: decisions, identifiers, numbers, paths, constraints, the goal.
- **The facts are restated before they are forgotten.** The block rides along with your next message (as context only the model reads, so your text stays as typed) when it is at risk:
  - a fact changed and the model hasn't seen it;
  - the conversation was compacted since the last copy;
  - the last copy is more than ~25k tokens behind.

  It is never added to the system prompt, so the prompt cache stays intact, and it is never sent when the last copy is still fresh, so the history doesn't fill up with copies.
- **A band above the prompt** shows the facts and how likely the model still has them in mind:

  | Dot | Message |
  | --- | --- |
  | 🟢 | Context remembers it |
  | 🔵 | Context probably still remembers it |
  | 🟡 | It's almost time to present the facts again |
  | 🟠 | You should send the facts again |
  | 🔴 | Context probably forgot about it |

  Click a fact to edit it in place, or **+ Add fact** to add one (type `key: value`). Two toggles sit on the title row, also while the band is minimized: **Auto** (send when at risk) and **Send in next message** (send once).

## Install

In a terminal session of Claude Code:

```
/plugin install case-facts --marketplace jpzrdev/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope so it works in every project. A mod installed at the user scope also loads in the desktop app's Code tab.

## The `/facts` command

| Command | What it does |
| --- | --- |
| `/facts` | list the facts |
| `/facts key = value` | add or replace a fact (`set key = value` works too) |
| `/facts rm key` | remove a fact |
| `/facts clear` | remove every fact |
| `/facts send` | send the facts with your next message |
| `/facts mode auto\|always\|off` | when the facts are sent; `auto` is the default |
| `/facts hide` / `/facts show` | minimize or expand the band |

Facts belong to the session: a `/clear` starts over.

## When it helps (and when it doesn't)

It earns its place in long sessions (a migration, a big refactor, a bug hunt that runs for hours and compacts along the way) where precise facts are set early and needed late. In short sessions everything fits in context anyway: keep the band minimized and let Auto stay quiet. Preferences that hold for every session (language, test framework) belong in `CLAUDE.md`, not here.

## Developing

```
claude plugin validate ./case-facts
claude plugin test ./case-facts
```

To run it from this folder instead of an install: `claude --plugin-dir ./case-facts`. Claude Code writes the API's type declarations into `.claude-plugin/types/` when it loads the mod, which `tsconfig.json` extends.

Built and tested on Claude Code 2.1.293. The mods API is early access and may change between releases.
