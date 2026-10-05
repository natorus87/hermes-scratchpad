// Detects forbidden external imports in the built plugin bundle.
// The Hermes desktop plugin loader resolves ONLY @hermes/plugin-sdk, react and
// react/jsx-runtime; any other bare import would fail at load time. CDN /
// http(s) imports and dynamic network-loaded dependencies are likewise banned.
import { readFileSync } from 'node:fs'

const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
const source = readFileSync('dist/plugin.js', 'utf8')

const problems = []

// Static import/export from specifiers (esbuild keeps externals as-is).
const staticRe = /(?:^|[\n;])\s*(?:import|export)\s+(?:[\w*\s{},$]*\s+from\s+)?["']([^"']+)["']/g
for (const [, spec] of source.matchAll(staticRe)) {
  if (spec.startsWith('.') || spec.startsWith('/')) continue // relative/absolute internal chunk
  if (!ALLOWED.has(spec)) problems.push(`static import of "${spec}"`)
}

// Dynamic imports — none are allowed in the disk plugin.
const dynRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g
for (const [, spec] of source.matchAll(dynRe)) {
  problems.push(`dynamic import of "${spec}"`)
}

// Remote code is banned outright.
if (/https?:\/\/[^"'\s)]+\.(?:js|mjs|cjs)/.test(source)) {
  problems.push('possible remote script URL referenced')
}

if (problems.length) {
  console.error('verify:bundle FAILED:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

console.log('verify:bundle OK — only @hermes/plugin-sdk, react, react/jsx-runtime are imported; no dynamic/remote imports.')
