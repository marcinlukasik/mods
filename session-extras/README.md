# session-extras

Two small additions to the [statuspane](https://github.com/xuanji86/claude-statuspane) card above the Claude Code prompt:

- **📡 Remote Control row** inside the card while the session is reachable through Remote Control: `on`, or `N attached` while a phone or claude.ai has the session open. Gone outside Remote Control.
- **🪨 caveman button** in its own box under the card, framed like it. Pressed, it opens a list of [caveman](https://github.com/JuliusBrussee/caveman) modes; the pick applies now and is saved as caveman's `defaultMode`, so new sessions start in it.

## Needs

- **statuspane**, which draws the card. Add its marketplace first, so the dependency installs:

  ```
  /plugin marketplace add xuanji86/claude-statuspane
  ```

- **caveman**, for the mode picker (optional; without it the button reads `off` and picking a mode says caveman was not found):

  ```
  /plugin marketplace add JuliusBrussee/caveman
  /plugin install caveman@caveman
  ```

- A terminal session. The desktop app draws neither the card nor the button.

## Install

```
/plugin install session-extras --marketplace marcinlukasik/mods
```

## Notes

- Picking a mode writes `~/.config/caveman/config.json` (or `$XDG_CONFIG_HOME/caveman/config.json`), keeping any other keys in it. `/caveman <mode>` typed at the prompt changes the current session only.
- The Remote Control row is checked every 15 seconds, on each turn, and when a client attaches or detaches.

## Develop

```
claude plugin validate ./session-extras
claude plugin test ./session-extras
```
