# usage-bars

Shows your Claude plan's usage limits above the prompt: how much of the 5-hour session window and of the weekly window you have used, as a bar from 0 to 100%, and how long until each one resets.

## What it does

- **A card above the prompt** with one row per limit window: the session (5h) first, then the weekly window, then any model-specific weekly window (Opus, Sonnet) your account reports.
- **A bar per window.** In the desktop app's Code tab it is a rounded bar that spans the card; in the terminal, a thin line drawn in your theme's colors.
- **Colors that warn.** The bar turns amber at 70% and red at 90%.
- **A live countdown** to each reset, refreshed every 30 seconds: `resets in 2h 13m`, `resets in 3d 3h`.

The figures are the ones the status line has: the windows the last API response reported. The card stays hidden until the first response arrives, and off a subscription plan, where there are no such windows.

## Install

In a terminal session of Claude Code:

```
/plugin install usage-bars --marketplace jpzrdev/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope so it works in every project. A mod installed at the user scope also loads in the desktop app's Code tab.

## Compatibility

Built and tested on Claude Code 2.1.293.
