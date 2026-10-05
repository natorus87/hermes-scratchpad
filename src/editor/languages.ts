/** LanguageRegistry: language ids, file-extension detection, CodeMirror support. */
import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'

export type LanguageId =
  | 'plain'
  | 'markdown'
  | 'shell'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'sql'
  | 'html'
  | 'css'

export const LANGUAGE_IDS: LanguageId[] = [
  'plain',
  'markdown',
  'shell',
  'python',
  'javascript',
  'typescript',
  'json',
  'yaml',
  'toml',
  'sql',
  'html',
  'css'
]

const BY_EXTENSION: Record<string, LanguageId> = {
  md: 'markdown',
  markdown: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  pyw: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css'
}

export function languageForFilename(name: string): LanguageId {
  const base = name.toLowerCase()
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot + 1) : ''
  return BY_EXTENSION[ext] ?? 'plain'
}

const cache = new Map<LanguageId, Extension[]>()

/**
 * Resolves the CodeMirror language support for one id. esbuild bundles the
 * dynamic imports into dist/plugin.js (no splitting configured), so nothing is
 * fetched at runtime; the cache simply avoids re-entering the module factories.
 */
export async function languageExtensions(id: LanguageId): Promise<Extension[]> {
  const hit = cache.get(id)
  if (hit) return hit

  let exts: Extension[] = []
  switch (id) {
    case 'markdown': {
      const m = await import('@codemirror/lang-markdown')
      exts = [m.markdown()]
      break
    }
    case 'shell': {
      const m = await import('@codemirror/legacy-modes/mode/shell')
      exts = [StreamLanguage.define(m.shell)]
      break
    }
    case 'python': {
      const m = await import('@codemirror/lang-python')
      exts = [m.python()]
      break
    }
    case 'javascript': {
      const m = await import('@codemirror/lang-javascript')
      exts = [m.javascript()]
      break
    }
    case 'typescript': {
      const m = await import('@codemirror/lang-javascript')
      exts = [m.javascript({ typescript: true, jsx: true })]
      break
    }
    case 'json': {
      const m = await import('@codemirror/lang-json')
      exts = [m.json()]
      break
    }
    case 'yaml': {
      const m = await import('@codemirror/lang-yaml')
      exts = [m.yaml()]
      break
    }
    case 'toml': {
      const m = await import('@codemirror/legacy-modes/mode/toml')
      exts = [StreamLanguage.define(m.toml)]
      break
    }
    case 'sql': {
      const m = await import('@codemirror/lang-sql')
      exts = [m.sql()]
      break
    }
    case 'html': {
      const m = await import('@codemirror/lang-html')
      exts = [m.html()]
      break
    }
    case 'css': {
      const m = await import('@codemirror/lang-css')
      exts = [m.css()]
      break
    }
    default:
      exts = []
  }

  cache.set(id, exts)
  return exts
}
