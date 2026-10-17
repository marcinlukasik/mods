import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

export const ROW = 'remote-control'
// Long ttl: the row is refreshed on every turn and attach, and cleared outside RC
const TTL = 24 * 60 * 60

const cavemanMode = atom({ plugin: 'session-extras', key: 'cavemanMode' } as const, null)
const isCavemanMenuOpen = atom({ plugin: 'session-extras', key: 'isCavemanMenuOpen' } as const, false)

// What the menu offers, in order; off removes the flag
export const MENU_MODES = ['lite', 'full', 'ultra', 'wenyan-lite', 'wenyan', 'wenyan-ultra', 'off'] as const
const KNOWN_MODES = new Set<string>([...MENU_MODES, 'wenyan-full', 'commit', 'review', 'compress'])

// The statuspane row for this session, or null outside Remote Control
export function rcRow(bridge: string | undefined, surfaces: readonly RenderSurface[]) {
  if (!bridge) return null
  const remotes = surfaces.filter(s => s !== 'terminal').length
  return {
    id: ROW,
    label: '📡 Remote Control',
    text: remotes > 0 ? `${remotes} attached` : 'on',
    ttl: TTL,
    state: 'ok' as const,
  }
}

// Caveman's flag file holds the mode; same sanitizing and whitelist as its own statusline script
export function parseCavemanMode(flag: string | undefined) {
  const mode = (flag ?? '').slice(0, 64).toLowerCase().replace(/[^a-z0-9-]/g, '')
  return KNOWN_MODES.has(mode) && mode !== 'off' ? mode : null
}

async function cavemanFlagPath($: EngineInterface) {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  return `${dir}/.caveman-active`
}

async function readCavemanMode($: EngineInterface) {
  const path = await cavemanFlagPath($)
  // Refuse symlinks, as caveman does: stat without resolving reports a link as 'other'
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat?.kind !== 'file') return null
  return parseCavemanMode(await $.fs.read(path).catch(() => undefined))
}

// Bridge session id is set while the session is reachable from claude.ai / mobile
async function refresh($: EngineInterface) {
  const rc = rcRow(await $.env.get('CLAUDE_CODE_BRIDGE_SESSION_ID'), await $.session.surfaces())
  await (rc ? $.statuspane.progress(rc) : $.statuspane.clear(ROW))
  const mode = await readCavemanMode($)
  await update($, cavemanMode, () => mode)
}

async function pickCavemanMode($: EngineInterface, mode: string) {
  const { exitCode, stderr } = await $.process.run(['node', `${$.plugin.root}/bin/set-caveman-mode.js`, mode])
  if (exitCode !== 0) $.ui.toast(`caveman: ${stderr.trim() || 'mode not changed'}`)
  const now = await readCavemanMode($)
  await update($, cavemanMode, () => now)
  await update($, isCavemanMenuOpen, () => false)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    // Remote Control connects a moment after start, so poll rather than wait for the first turn
    $.clock.every(15_000, () => void refresh($))
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('session.attach', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })
  on('session.detach', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  // Caveman button under the statuspane card; pressed, it opens a mode list framed like statuspane's settings
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'desktop') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Keep what the plugins beneath drew; never hand the band itself back, or it stops redrawing
    const below = await next(e).catch(() => null)
    const mode = await read($, cavemanMode)
    const setOpen = (open: boolean) => update($, isCavemanMenuOpen, () => open)

    const ours = (await read($, isCavemanMenuOpen)) ? (
      <Box justifyContent="flex-end" paddingRight={1}>
        <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
          <Text color="claude" bold>Caveman mode</Text>
          {MENU_MODES.map(m => (
            // hover needs a keyed Box around the Button, or the whole band is refused
            <Box key={`caveman-row-${m}`}>
              <Button
                key={`caveman-${m}`}
                label={`${(mode ?? 'off') === m ? '●' : '○'} ${m}`}
                plain
                hover={{ color: 'claude' }}
                onPress={() => pickCavemanMode($, m)}
              />
            </Box>
          ))}
          <Box justifyContent="flex-end">
            <Button key="caveman-close" label="Done" variant="primary" onPress={() => setOpen(false)} />
          </Box>
        </Box>
      </Box>
    ) : (
      // Own box, framed like the statuspane card above it; keyed so the Button's hover is allowed
      <Box justifyContent="flex-end" paddingRight={1}>
        <Box key="caveman-open-row" borderStyle="round" borderColor="claude" paddingX={1}>
          <Button
            key="caveman-open"
            label={`🪨 caveman: ${mode ?? 'off'} ▾`}
            plain
            dimColor
            hover={{ color: 'claude' }}
            onPress={() => setOpen(true)}
          />
        </Box>
      </Box>
    )

    return below ? (
      <Box flexDirection="column">
        {below}
        {ours}
      </Box>
    ) : (
      ours
    )
  })
}
