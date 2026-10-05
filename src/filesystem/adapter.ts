/**
 * FileSystemAdapter — the ONLY module that knows how files are actually
 * reached: native dialogs come from ctx.os, content read/write goes through
 * the plugin's own backend namespace (/api/plugins/hermes-scratchpad/fs/*).
 * No UI component touches ctx.os or ctx.rest directly.
 */
import type { PluginContext } from '@hermes/plugin-sdk'

export interface PickedFile {
  path: string
  content: string
}

export interface OpenResult {
  canceled: boolean
  file?: PickedFile
}

const MAX_BYTES = 8 * 1024 * 1024

let ctxRef: PluginContext | null = null

export function initFileSystem(ctx: PluginContext): void {
  ctxRef = ctx
}

function ctx(): PluginContext {
  if (!ctxRef) throw new Error('FileSystemAdapter not initialized')
  return ctxRef
}

const TEXT_FILTERS = [
  { extensions: ['md', 'txt', 'log'], name: 'Markdown / Text' },
  { extensions: ['py'], name: 'Python' },
  { extensions: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'], name: 'JavaScript / TypeScript' },
  { extensions: ['sh', 'bash', 'zsh'], name: 'Shell' },
  { extensions: ['json', 'yaml', 'yml', 'toml'], name: 'Config' },
  { extensions: ['sql'], name: 'SQL' },
  { extensions: ['html', 'htm', 'css'], name: 'Web' },
  { extensions: ['*'], name: 'All files' }
]

/** ⌘⌥O — native open dialog, then read through the backend. */
export async function openFileDialog(): Promise<OpenResult> {
  const picked = await ctx().os.pickOpenPath({ title: undefined, filters: TEXT_FILTERS })
  if (!picked) return { canceled: true }
  const content = await readFile(picked)
  return { canceled: false, file: { path: picked, content } }
}

export async function readFile(path: string): Promise<string> {
  const res = await ctx().rest<{ ok: boolean; content?: string; error?: string }>('/fs/read', {
    method: 'POST',
    body: { path },
    timeoutMs: 20000
  })
  if (!res.ok || typeof res.content !== 'string') {
    throw new Error(res.error || 'read failed')
  }
  return res.content
}

/** Atomic write (tempfile + rename) on the backend. */
export async function writeFile(path: string, content: string): Promise<void> {
  if (new TextEncoder().encode(content).byteLength > MAX_BYTES) {
    throw new Error('file too large')
  }
  const res = await ctx().rest<{ ok: boolean; error?: string }>('/fs/write', {
    method: 'POST',
    body: { path, content },
    timeoutMs: 30000
  })
  if (!res.ok) throw new Error(res.error || 'write failed')
}

/** ⌘⌥⇧S — native save dialog, then write through the backend. Returns path or null. */
export async function saveFileAs(defaultPath: string, content: string): Promise<string | null> {
  const target = await ctx().os.pickSavePath({ defaultPath, filters: TEXT_FILTERS })
  if (!target) return null
  await writeFile(target, content)
  return target
}

export async function revealInFinder(path: string): Promise<boolean> {
  return ctx().os.revealPath(path)
}
