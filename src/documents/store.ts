/**
 * Document model + tab session.
 *
 * ScratchDocument: no filesystem path; auto-persisted (debounced) via plugin
 * storage. FileDocument: a real local file is the source of truth — the plugin
 * keeps only path + dirty flag, content lives in the CodeMirror document.
 */
import { atom } from 'nanostores'
import { $aiConfig, mergeAIConfig, type AIConfig } from '../ai/config'
import type { LanguageId } from '../editor/languages'
import { languageForFilename } from '../editor/languages'

export type DocKind = 'scratch' | 'file'

export interface ScratchDoc {
  kind: 'scratch'
  id: string
  name: string
  language: LanguageId
  createdAt: number
  updatedAt: number
}

export interface FileDoc {
  kind: 'file'
  id: string
  path: string
  name: string
  language: LanguageId
  dirty: boolean
}

export type Doc = ScratchDoc | FileDoc

export interface PersistedState {
  scratches: ScratchDoc[]
  /** Content per scratch id. Kept separate so doc lists stay small. */
  contents: Record<string, string>
  /** Open tab order: doc ids. File docs use `file:<path>` ids. */
  openTabs: string[]
  activeId: string | null
  cursorLines: Record<string, number>
  recentFiles: string[]
  settings: {
    language: 'system' | 'en' | 'de'
    wordWrap: boolean
    /** AI provider config; optional for pre-existing persisted state. */
    ai?: AIConfig
  }
  snippets: Snippet[]
  /** Manual language overrides for file docs, keyed by path (deriving from
   *  the filename would otherwise reset them on every hydrate). */
  fileLanguages: Record<string, LanguageId>
  /** Serialized per-doc editor states (selection + undo history), keyed by
   *  doc id. Optional for pre-existing persisted state. */
  docStates?: Record<string, Record<string, unknown>>
}

export interface Snippet {
  id: string
  title: string
  language: LanguageId
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  favorite: boolean
}

export const DEFAULT_STATE: PersistedState = {
  scratches: [],
  contents: {},
  openTabs: [],
  activeId: null,
  cursorLines: {},
  recentFiles: [],
  settings: { language: 'system', wordWrap: false },
  snippets: [],
  fileLanguages: {}
}

// --- reactive stores (plugin-local, nanostores via the SDK) ---
export const $docs = atom<Record<string, Doc>>({})
export const $openTabs = atom<string[]>([])
export const $activeId = atom<null | string>(null)
export const $dirty = atom<Record<string, boolean>>({})
export const $settings = atom<PersistedState['settings']>({ language: 'system', wordWrap: false })
export const $snippets = atom<Snippet[]>([])
export const $recentFiles = atom<string[]>([])

let nextScratchSeq = 1

export function fileDocId(path: string): string {
  return `file:${path}`
}

export function newScratchId(): string {
  return `scratch-${Date.now().toString(36)}-${nextScratchSeq++}`
}

/** Load persisted state (storage layer calls this once at register). */
export function hydrate(state: PersistedState): void {
  const docs: Record<string, Doc> = {}
  for (const s of state.scratches ?? []) docs[s.id] = s
  for (const id of state.openTabs ?? []) {
    if (id.startsWith('file:')) {
      const path = id.slice(5)
      docs[id] = {
        kind: 'file',
        id,
        path,
        name: path.split('/').pop() || path,
        language: state.fileLanguages?.[path] ?? languageForFilename(path),
        dirty: false
      }
    }
  }
  $docs.set(docs)
  $openTabs.set(state.openTabs ?? [])
  $activeId.set(state.activeId ?? null)
  $settings.set({ ...DEFAULT_STATE.settings, ...(state.settings ?? {}) })
  $aiConfig.set(mergeAIConfig(state.settings?.ai))
  $snippets.set(state.snippets ?? [])
  $recentFiles.set(state.recentFiles ?? [])
}

export function upsertDoc(doc: Doc): void {
  const docs = { ...$docs.get() }
  docs[doc.id] = doc
  $docs.set(docs)
}

export function removeDoc(id: string): void {
  const docs = { ...$docs.get() }
  delete docs[id]
  $docs.set(docs)
  $openTabs.set($openTabs.get().filter(t => t !== id))
  if ($activeId.get() === id) $activeId.set($openTabs.get()[0] ?? null)
}

export function openTab(id: string, doc: Doc): void {
  upsertDoc(doc)
  const tabs = $openTabs.get()
  if (!tabs.includes(id)) $openTabs.set([...tabs, id])
  $activeId.set(id)
}

export function closeTab(id: string): void {
  const tabs = $openTabs.get()
  const idx = tabs.indexOf(id)
  const next = tabs.filter(t => t !== id)
  $openTabs.set(next)
  removeDoc(id)
  if ($activeId.get() === id) {
    $activeId.set(next[Math.min(idx, next.length - 1)] ?? null)
  }
}

export function setDirty(id: string, dirty: boolean): void {
  const current = $dirty.get()
  if (current[id] === dirty) return
  $dirty.set({ ...current, [id]: dirty })
}

export function activeDoc(): Doc | null {
  const id = $activeId.get()
  return id ? $docs.get()[id] ?? null : null
}

export function tabTitle(doc: Doc, untitledLabel: string): string {
  if (doc.kind === 'scratch') return doc.name || untitledLabel
  return doc.name
}

export function addRecentFile(path: string): void {
  const list = $recentFiles.get().filter(p => p !== path)
  $recentFiles.set([path, ...list].slice(0, 20))
}

export function upsertSnippet(snippet: Snippet): void {
  const list = $snippets.get()
  const idx = list.findIndex(s => s.id === snippet.id)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = snippet
    $snippets.set(next)
  } else {
    $snippets.set([snippet, ...list])
  }
}

export function deleteSnippet(id: string): void {
  $snippets.set($snippets.get().filter(s => s.id !== id))
}
