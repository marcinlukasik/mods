// Prod Guard: holds risky Bash commands until the person presses Proceed or Cancel.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Held } from '../types'

const PANE = 'prod-guard'
const held = atom({ plugin: 'prod-guard', key: 'held' } as const, null)

type Rule = { risk: string; test: RegExp }

const RULES: Rule[] = [
  { risk: 'Vercel production deploy', test: /\bvercel\b[^;&|]*\s--prod(uction)?\b/ },
  { risk: 'Vercel promote / rollback', test: /\bvercel\s+(promote|rollback)\b/ },
  { risk: 'Vercel env change', test: /\bvercel\s+env\s+(rm|remove|add|update)\b/ },
  { risk: 'Vercel remove', test: /\bvercel\s+((rm|remove)\b|(domains|dns|project|projects)\s+(rm|remove)\b)/ },
  { risk: 'Force push', test: /\bgit\s+push\b[^;&|]*\s(-f\b|--force)/ },
  { risk: 'Push to main', test: /\bgit\s+push\b[^;&|]*\s(origin\s+)?(HEAD:)?(main|master)\b/ },
  { risk: 'git reset --hard', test: /\bgit\s+reset\b[^;&|]*--hard\b/ },
  { risk: 'git clean', test: /\bgit\s+clean\s+-[a-zA-Z]*f/ },
  { risk: 'Package publish', test: /\b(npm|pnpm|yarn|bun)\s+publish\b/ },
  { risk: 'Database migration', test: /\b(prisma\s+(migrate\s+(reset|deploy)|db\s+push)|drizzle-kit\s+(push|migrate))\b/ },
  { risk: 'rm -rf', test: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)\b/ },
  { risk: 'Infra change', test: /\b(terraform\s+(apply|destroy)|kubectl\s+(delete|apply))\b/ },
]

const PLAIN_PUSH = /\bgit\s+push\b/

// The waiting hook polls this, not $.state: every $.state.get of one dispatch reads one moment.
let decided: Held['decision'] = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await update($, held, () => null)
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String(e.command ?? '')
    let risk = classify(command)

    // A plain `git push` is only risky when the current branch is main/master.
    if (risk === null && PLAIN_PUSH.test(command)) {
      const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
      if (branch === 'main' || branch === 'master') risk = `Push to ${branch}`
    }
    if (risk === null) return next(e)

    // The desktop app runs the session through the SDK (isInteractive false), so ask
    // whether anything draws at all: empty only in a plain -p run, where no one can press.
    if ((await $.session.surfaces()).length === 0) {
      return { deny: `Prod Guard: "${risk}" needs a person to confirm, and this session has no screen to ask on.` }
    }

    const details = await measure($, command, risk)
    decided = null
    await update($, held, () => ({ command, risk, details, decision: null, where: 'pane' }))

    const opened = await $.ui.open({ id: PANE, title: `Prod Guard: ${risk}`, focus: true })
    if (!opened.isPlaced) {
      await update($, held, cur => (cur ? { ...cur, where: 'band' } : cur))
    }

    while (decided === null && !next.signal.aborted) {
      // Time spent inside a $ call does not count against the hook's budget.
      await $.process.run(['sleep', '0.25'])
    }
    const decision = decided
    decided = null

    await update($, held, () => null)
    await $.ui.close({ id: PANE })

    if (decision === 'proceed') return next(e)
    return { deny: `Prod Guard held this command (${risk}) and the user did not approve it. Ask the user before trying again.` }
  }).catch(async ($, e) => {
    // Fail closed: if the guard itself breaks on a risky command, refuse rather than run it.
    await update($, held, () => null)
    return { deny: 'Prod Guard failed while checking this command, so it was not run. Ask the user to run it themselves.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const pending = await read($, held)
    if (pending === null) return next(e)
    return report($, e, pending, 'magenta')
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pending = await read($, held)
    if (pending === null || pending.where !== 'band' || e.props.hasSurvey) return next(e)
    return report($, e, pending, 'yellow')
  })
}

function classify(command: string): string | null {
  return RULES.find(rule => rule.test.test(command))?.risk ?? null
}

async function git($: any, args: string[]): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(['git', ...args], { timeoutMs: 5000 })
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

async function measure($: any, command: string, risk: string): Promise<string[]> {
  const lines: string[] = []
  const cwd = await $.session.cwd()
  lines.push(`dir      ${cwd}`)

  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== null) {
    lines.push(`branch   ${branch}`)
    const last = await git($, ['log', '-1', '--format=%h %s (%cr)'])
    if (last) lines.push(`HEAD     ${last}`)
    const dirty = (await git($, ['status', '--porcelain'])) ?? ''
    const changed = dirty.split('\n').filter(Boolean)
    lines.push(`changes  ${changed.length === 0 ? 'clean' : `${changed.length} uncommitted`}`)

    if (/push/i.test(risk)) {
      const ahead = await git($, ['log', '@{u}..HEAD', '--oneline'])
      if (ahead) {
        const commits = ahead.split('\n')
        lines.push(`pushing  ${commits.length} commit(s):`)
        commits.slice(0, 5).forEach(c => lines.push(`         ${c}`))
      }
    }
    if (risk === 'git reset --hard' && changed.length > 0) {
      lines.push('would discard:')
      changed.slice(0, 8).forEach(c => lines.push(`         ${c}`))
    }
    if (risk === 'git clean') {
      const dry = await git($, ['clean', '-n', '-d'])
      if (dry) {
        const files = dry.split('\n')
        lines.push(`would delete ${files.length} path(s):`)
        files.slice(0, 8).forEach(f => lines.push(`         ${f.replace(/^Would remove /, '')}`))
      }
    }
  }

  if (/vercel/i.test(risk)) {
    try {
      const project = JSON.parse(await $.fs.read('.vercel/project.json'))
      lines.push(`vercel   project ${project.projectName ?? project.projectId}`)
    } catch {
      lines.push('vercel   no .vercel/project.json here')
    }
  }
  return lines
}

function report($: any, e: any, pending: Held, color: string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const decide = (decision: 'proceed' | 'cancel') => () => {
    decided = decision
    return update($, held, cur => (cur ? { ...cur, decision } : cur))
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color} bold>
        ⚠ Prod Guard: {pending.risk}
      </Text>
      <Text>$ {pending.command}</Text>
      {pending.details.map(line => (
        <Text dimColor>{line}</Text>
      ))}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="proceed" label="Proceed" hotkey="1" onPress={decide('proceed')} />
        <Button key="cancel" label="Cancel" hotkey="2" onPress={decide('cancel')} />
      </Box>
    </Box>
  )
}
