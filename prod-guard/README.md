# prod-guard

Stops risky Bash commands Claude is about to run and asks you first. The command waits in a **Prod Guard** pane (or above the prompt, where no pane fits) with a short report, until you press **Proceed** (`1`) or **Cancel** (`2`).

## What it holds

| Kind | Commands |
| --- | --- |
| Vercel | `vercel … --prod`, `vercel promote` / `rollback`, `vercel env add/rm/update`, `vercel rm`, `vercel domains/dns/project rm` |
| Git | force push, push to `main`/`master` (also a plain `git push` while on main), `git reset --hard`, `git clean -f` |
| Packages | `npm` / `pnpm` / `yarn` / `bun publish` |
| Databases | `prisma migrate reset/deploy`, `prisma db push`, `drizzle-kit push/migrate` |
| Files and infra | `rm -rf`, `terraform apply/destroy`, `kubectl delete/apply` |

## The report

Folder, branch, last commit and uncommitted changes; for a push, the commits that would go out; for `reset --hard`, the files it would discard; for `git clean`, the paths it would delete; for Vercel, the linked project from `.vercel/project.json`.

## Fails closed

- A session with no screen (`claude -p`) refuses risky commands, since nobody can confirm them.
- If the guard itself fails on a risky command, the command is refused, not run.

Cancel tells Claude you did not approve, and to ask you before trying again.

## Install

```
/plugin install prod-guard --marketplace marcinlukasik/mods
```

## Develop

```
claude plugin validate ./prod-guard
claude plugin test ./prod-guard
```
