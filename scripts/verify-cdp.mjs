// Repeatable real-app verification checks for the Hermes Scratchpad plugin.
// Wraps scripts/cdp.mjs (CDP dev instance on port 9333, see AGENTS.md) with
// named, non-destructive checks — the flows previously done by hand in
// sessions. NOTHING is saved or deleted: dialogs are cancelled, the search
// field is cleared, no tabs are created.
//
// Usage:
//   node scripts/verify-cdp.mjs            # run all checks
//   node scripts/verify-cdp.mjs env page   # only named checks
//   node scripts/verify-cdp.mjs --list     # list checks
//
// Exit code 0 = all passed, 1 = at least one failed / CDP unreachable.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// One eval = one cdp.mjs call. Expressions must be IIFEs (the CDP context
// shares globals across calls) returning JSON.stringify(...).
function evalJson(expr, { timeoutMs = 30000 } = {}) {
  const out = execFileSync('node', [join(ROOT, 'scripts', 'cdp.mjs'), 'eval', expr], {
    encoding: 'utf8',
    timeout: timeoutMs
  }).trim()
  // cdp.mjs prints JSON.stringify(value, null, 2). Expressions either return
  // a JSON string ("{\"a\":1}") or a plain marker ("ok") — accept both.
  const value = JSON.parse(out)
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const nativeSet = (selector, value, proto = 'HTMLInputElement') =>
  `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; const s = Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set; s.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok' })()`

function waitFor(predicateExpr, { tries = 10, delayMs = 400 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = evalJson(predicateExpr)
    if (v) return true
    execFileSync('sleep', [String(delayMs / 1000)])
  }
  return false
}

const checks = {
  // CDP + SDK + controller reachable, plugin page navigable.
  env() {
    evalJson(`window.__HERMES_PLUGIN_SDK__.host.navigate('/scratchpad'); 'ok'`)
    const v = evalJson(
      `(() => JSON.stringify({ sdk: !!window.__HERMES_PLUGIN_SDK__, ctl: !!window.__hermesScratchpad, hasSettings: typeof window.__hermesScratchpad.openAISettings === 'function', gateway: window.__HERMES_PLUGIN_SDK__.host.state.gateway.get() }))()`
    )
    if (!v.sdk || !v.ctl || !v.hasSettings) throw new Error(`plugin not ready: ${JSON.stringify(v)}`)
    return `sdk+controller ready, gateway=${v.gateway}`
  },

  // The workspace page renders its main regions.
  page() {
    const v = evalJson(
      `(() => { const q = s => !!document.querySelector(s); return JSON.stringify({ root: q('.hsp-root'), sidebar: q('.hsp-sidebar'), tabs: q('.hsp-tabbar'), status: q('.hsp-statusbar'), editor: q('.hsp-editor-host') }) })()`
    )
    for (const [k, ok] of Object.entries(v)) if (!ok) throw new Error(`missing region: .hsp-${k === 'tabs' ? 'tabbar' : k}`)
    return 'root, sidebar, tabbar, statusbar, editor host present'
  },

  // Sidebar search: no-match query shows the empty state, Escape restores.
  search() {
    if (evalJson(nativeSet('.hsp-search-input', 'zzz-no-match-xyz')) !== 'ok') throw new Error('search input not found')
    execFileSync('sleep', ['0.4'])
    const empty = evalJson(
      `(() => JSON.stringify({ noResults: !!document.querySelector('.hsp-noresults'), scratchItems: document.querySelectorAll('.hsp-side-item').length }))()`
    )
    if (!empty.noResults) throw new Error(`expected no-results state: ${JSON.stringify(empty)}`)
    evalJson(
      `(() => { const el = document.querySelector('.hsp-search-input'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'ok' })()`
    )
    execFileSync('sleep', ['0.4'])
    const restored = evalJson(
      `(() => JSON.stringify({ noResults: !!document.querySelector('.hsp-noresults'), cleared: document.querySelector('.hsp-search-input').value === '' }))()`
    )
    if (restored.noResults || !restored.cleared) throw new Error(`search not restored: ${JSON.stringify(restored)}`)
    return `no-match state + Escape restore OK (${empty.scratchItems} items visible afterwards)`
  },

  // Snippet edit dialog opens prefilled and cancels without changes.
  snippetEditDialog() {
    const v = evalJson(
      `(() => { const c = window.__hermesScratchpad; const s = (c.state.snippets || [])[0]; if (!s) return JSON.stringify({ skipped: true }); c.editSnippet(s.id); const d = c.\$dialog.get(); const out = { kind: d.kind, title: d.title, tags: d.tags, confirming: d.confirming }; c.dismissDialog(); return JSON.stringify(out) })()`
    )
    if (v.skipped) return 'skipped — no snippets exist (non-destructive check)'
    if (v.kind !== 'snippet-edit') throw new Error(`wrong dialog: ${v.kind}`)
    if (typeof v.title !== 'string' || v.confirming !== false) throw new Error(`bad prefill: ${JSON.stringify(v)}`)
    return `edit dialog prefilled ("${v.title}") and cancelled`
  },

  // AI settings dialog: provider rows + per-action overrides render; a
  // provider switch happens in the dialog COPY only, then cancel (no save).
  aiSettingsDialog() {
    evalJson(`window.__hermesScratchpad.openAISettings(); 'ok'`)
    if (!waitFor(`(() => !!document.querySelector('.hsp-dialog h3'))()`)) throw new Error('dialog did not render')
    const before = evalJson(
      `(() => { const c = window.__hermesScratchpad; const dlg = document.querySelector('.hsp-dialog'); const sel = dlg.querySelector('.hsp-formrow select'); const rows = [...dlg.querySelectorAll('.hsp-formrow')]; const actionRows = dlg.querySelectorAll('.hsp-action-row').length; const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(sel, 'openai'); sel.dispatchEvent(new Event('change', { bubbles: true })); return JSON.stringify({ providerOptions: sel.options.length, actionRows, savedStill: c.state.settings.ai.provider }) })()`
    )
    execFileSync('sleep', ['0.4'])
    const openaiRows = evalJson(
      `(() => { const rows = [...document.querySelectorAll('.hsp-dialog .hsp-formrow')]; return JSON.stringify({ labels: rows.map(r => (r.querySelector('label') || {}).textContent), templateRows: document.querySelectorAll('.hsp-action-row').length }) })()`
    )
    evalJson(`window.__hermesScratchpad.dismissDialog(); 'ok'`)
    if (before.providerOptions !== 3) throw new Error(`provider select has ${before.providerOptions} options`)
    if (!openaiRows.labels.includes('Basis-URL') && !openaiRows.labels.includes('Base URL')) throw new Error(`openai fields missing: ${JSON.stringify(openaiRows.labels)}`)
    if (openaiRows.templateRows < 1) throw new Error('per-action section missing')
    if (before.savedStill !== 'hermes') throw new Error(`dialog switch leaked into saved config: ${before.savedStill}`)
    return `dialog OK: 3 providers, ${before.actionRows} action rows, openai fields appear, cancel saved nothing`
  },

  // Screenshot of the plugin page (evidence artifact).
  shot() {
    const out = execFileSync('node', [join(ROOT, 'scripts', 'cdp.mjs'), 'shot', '/tmp/scratchpad-verify.png'], { encoding: 'utf8' })
    return out.trim()
  }
}

const [sel, ...rest] = process.argv.slice(2)
if (sel === '--list' || sel === '-l') {
  console.log(Object.keys(checks).join('\n'))
  process.exit(0)
}

const wanted = !sel || sel === 'all' ? Object.keys(checks) : [sel, ...rest]
const unknown = wanted.filter(k => !checks[k])
if (unknown.length) {
  console.error(`unknown checks: ${unknown.join(', ')} (available: ${Object.keys(checks).join(', ')})`)
  process.exit(1)
}

let failed = 0
for (const name of wanted) {
  try {
    const detail = await checks[name]()
    console.log(`PASS ${name} — ${detail}`)
  } catch (error) {
    failed++
    console.log(`FAIL ${name} — ${error.message}`)
  }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
