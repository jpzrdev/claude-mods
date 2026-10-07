# claude-mods

Mods for [Claude Code](https://claude.com/claude-code): plugins of function hooks that add bands, panes, commands and guards to the terminal and the desktop app.

## Mods

| Mod | What it does |
| --- | --- |
| [info-holder](./info-holder) | A notepad above the prompt: paste information you want at hand during a long session. It is never sent to the model. |
| [usage-bars](./usage-bars) | Shows session (5h) and weekly usage above the prompt as 0-100% bars, with the time left until each window resets. |

## Install

This repository is a plugin marketplace. Install a mod by name, in a terminal session of Claude Code:

```
/plugin install <mod> --marketplace jpzrdev/claude-mods
```

Answer `y` to add the marketplace, then choose a scope (user: every project; project: this repository only). Mods installed at the user scope also load in the desktop app's Code tab.

To browse every mod instead, add the marketplace once and open the plugin menu:

```
/plugin marketplace add jpzrdev/claude-mods
/plugin
```

Update installed mods with `claude plugin update`.

## Compatibility

Built and tested on Claude Code 2.1.293. The mods API is early access and may change between releases; each mod's README says what it was tested on.

## License

MIT
