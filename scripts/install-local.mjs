// Installs the built plugin into the LOCAL Hermes Desktop installation.
// Determined from the installed app (see SDK-NOTES.md):
//   desktop half → $HERMES_HOME/desktop-plugins/hermes-scratchpad/plugin.js  (hot reload)
//   backend half → $HERMES_HOME/plugins/hermes-scratchpad/dashboard/{manifest.json,plugin_api.py}
// Never touches Hermes Core source files.
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = process.env.HERMES_HOME || join(homedir(), '.hermes')
const id = 'hermes-scratchpad'

const desktopDest = join(home, 'desktop-plugins', id)
const backendDest = join(home, 'plugins', id, 'dashboard')

if (!existsSync('dist/plugin.js')) {
  console.error('dist/plugin.js missing — run `npm run build` first.')
  process.exit(1)
}

// 1. Desktop half. A previous install is replaced in place (hot reload picks
//    the change up); the unified-package copy in plugins/<id>/desktop is NOT
//    used so there is exactly one delivery root.
mkdirSync(desktopDest, { recursive: true })
copyFileSync(join(root, 'dist', 'plugin.js'), join(desktopDest, 'plugin.js'))
console.log(`installed desktop plugin → ${desktopDest}/plugin.js`)

// 2. Backend half.
if (!existsSync(join(home, 'plugins', id))) {
  mkdirSync(join(home, 'plugins', id), { recursive: true })
}
mkdirSync(backendDest, { recursive: true })
cpSync(join(root, 'backend', 'manifest.json'), join(backendDest, 'manifest.json'))
cpSync(join(root, 'backend', 'plugin_api.py'), join(backendDest, 'plugin_api.py'))
// The agent plugin loader requires a python package marker in the plugin root.
copyFileSync(join(root, 'backend', '__init__.py'), join(home, 'plugins', id, '__init__.py'))
const pluginYaml = join(root, 'backend', 'plugin.yaml')
if (existsSync(pluginYaml)) {
  cpSync(pluginYaml, join(home, 'plugins', id, 'plugin.yaml'))
}
console.log(`installed backend plugin → ${backendDest}/`)

console.log(`
Next steps:
  1. Ensure "plugins.enabled" in ${join(home, 'config.yaml')} contains "${id}".
  2. Restart the Hermes backend once (desktop app restart or ⌘K → restart gateway)
     so /api/plugins/${id}/ is mounted.
  3. The desktop half hot-reloads automatically; ⌘K → "Reload desktop plugins" as fallback.
`)
