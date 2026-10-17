#!/usr/bin/env node
// Sets caveman's mode the way caveman does: its own symlink-safe flag writer, or removing the flag for off.
// Also saves it as caveman's defaultMode, since caveman's SessionStart hook rewrites the flag from that.
const fs = require('fs')
const os = require('os')
const path = require('path')

const MODES = ['lite', 'full', 'ultra', 'wenyan-lite', 'wenyan', 'wenyan-ultra', 'off']
const mode = process.argv[2]
if (!MODES.includes(mode)) {
  console.error(`unknown mode: ${mode}`)
  process.exit(2)
}

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const flag = path.join(claudeDir, '.caveman-active')

// Plugin cache dir has a version hash, so take the newest install
const cache = path.join(claudeDir, 'plugins', 'cache', 'caveman', 'caveman')
const configModule = fs
  .readdirSync(cache)
  .map(dir => path.join(cache, dir, 'hooks', 'caveman-config.js'))
  .filter(file => fs.existsSync(file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
if (!configModule) {
  console.error('caveman plugin not found')
  process.exit(1)
}
const caveman = require(configModule)

// Keep whatever else the config holds; a broken or missing file starts fresh
const configPath = caveman.getConfigPath()
let config = {}
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {}
} catch {}
fs.mkdirSync(path.dirname(configPath), { recursive: true })
fs.writeFileSync(configPath, JSON.stringify({ ...config, defaultMode: mode }, null, 2) + '\n')

if (mode === 'off') {
  try {
    if (!fs.lstatSync(flag).isSymbolicLink()) fs.unlinkSync(flag)
  } catch {}
  process.exit(0)
}
caveman.safeWriteFlag(flag, mode)
