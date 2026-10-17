# mods

Claude Code mods by Marcin Lukasik. This repository is a plugin marketplace: each folder is one mod, installed on its own.

| Mod | What it does |
| --- | --- |
| [session-extras](./session-extras) | Remote Control row in the [statuspane](https://github.com/xuanji86/claude-statuspane) card, and a caveman mode picker under it |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-extras --marketplace marcinlukasik/mods
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```
claude plugin install session-extras --marketplace marcinlukasik/mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `marcinlukasik/mods`, then Add plugin.

See each mod's README for what it needs.

## License

[MIT](./LICENSE)
