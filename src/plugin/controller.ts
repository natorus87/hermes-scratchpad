/**
 * ScratchpadController — the editor core's orchestrator. Owns the CodeMirror
 * view, document/tab lifecycle, persistence, command execution, AI runs and
 * dialog state. UI components only read atoms and call methods; adapters hide
 * the OS, filesystem, AI and Kanban specifics.
 */
import { atom } from 'nanostores'
import { host, type PluginContext } from '@hermes/plugin-sdk'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { historyField } from '@codemirror/commands'
import type { CommandId, CommandHandler } from '../commands/registry'
import { registerCommand } from '../commands/registry'
import { createEditor, setWordWrap, setLanguage } from '../editor/setup'
import { languageExtensions, languageForFilename, type LanguageId } from '../editor/languages'
import {
  $activeId,
  $dirty,
  $docs,
  $openTabs,
  $recentFiles,
  $settings,
  $snippets,
  activeDoc,
  addRecentFile,
  closeTab as closeTabInStore,
  fileDocId,
  hydrate,
  newScratchId,
  openTab,
  removeDoc,
  upsertDoc,
  upsertSnippet,
  deleteSnippet,
  type Doc,
  type FileDoc,
  type PersistedState,
  type ScratchDoc
} from '../documents/store'
import { initStorage, persistNow, persistSoon } from '../storage/persistence'
import { initFileSystem, openFileDialog, readFile, saveFileAs, writeFile } from '../filesystem/adapter'
import { initAIProxy } from '../ai/proxyFetch'
import { $aiConfig, setAIConfig, type AIConfig } from '../ai/config'
import { getAIProvider, providerFor, providerForAction } from '../ai/registry'
import { HermesAIProvider, resetHermesSession } from '../ai/providers/hermes'
import { AI_ACTIONS, buildActionPrompt, buildTaskTitlePrompt, type AIAction, type AIActionContext } from '../ai/actions'
import { initKanban, listBoards, createTask, type KanbanBoard } from '../kanban/adapter'
import { parseTags } from '../documents/search'
import { type LanguageSetting } from '../i18n'
import { $langSetting, $labelsVersion, translateIn } from '../ui/i18n'

export type DialogState =
  | { kind: 'none' }
  | { kind: 'kanban'; title: string; description: string; boards: KanbanBoard[] | null; board: string | null; priority: number; suggesting: boolean; creating: boolean }
  | {
      kind: 'ai-preview'
      action: AIAction
      scope: 'selection' | 'document'
      rangeFrom: number
      rangeTo: number
      original: string
      result: string
      isAnswer: boolean
    }
  | { kind: 'snippet'; content: string; language: LanguageId }
  | {
      kind: 'snippet-edit'
      id: string
      title: string
      tags: string
      favorite: boolean
      /** Delete button armed (first click confirms intent, second deletes). */
      confirming: boolean
    }
  | {
      kind: 'ai-settings'
      config: AIConfig
      test: 'ok' | 'fail' | null
      testing: boolean
      /** Agent profile names for the Hermes datalist (null = loading, [] = unavailable). */
      profiles: string[] | null
    }
  | { kind: 'confirm-close'; docId: string }

export class ScratchpadController {
  ctx!: PluginContext
  private view: EditorView | null = null
  /** In-session text per doc (source for dirty checks + tab switches). */
  private textCache = new Map<string, string>()
  /** Baseline per file doc = last saved / loaded content. */
  private baselines = new Map<string, string>()
  private state!: PersistedState
  private currentLocale = 'en'
  private extensions: Extension[] = []
  /** Serialized per-doc editor state (selection + undo history), keyed by doc
   *  id. Captured on every tab switch so history survives switching back, and
   *  persisted (pruned + size-capped) so it also survives app restarts. */
  private docStates = new Map<string, Record<string, unknown>>()
  /** Set when the in-memory docStates map may differ from the persisted one. */
  private docStatesDirty = false
  /** Which doc the view currently holds (may lag $activeId mid-transition). */
  private viewDocId: string | null = null

  // UI-visible atoms
  $dialog = atom<DialogState>({ kind: 'none' })
  $aiBusy = atom(false)
  $aiPopupOpen = atom(false)
  $sidebarOpen = atom(true)
  /** Scratchpad currently being renamed inline in the sidebar. */
  $renamingId = atom<string | null>(null)
  /** Bumped by focusSearch(); the sidebar search input listens and focuses. */
  $searchFocusSeq = atom(0)
  $toast = atom<{ text: string; kind: 'info' | 'error'; seq: number } | null>(null)
  $status = atom<{ lines: number; selected: number }>({ lines: 1, selected: 0 })
  /** Lazily read file contents for sidebar search, keyed by path. */
  $fileSearchContents = atom<Record<string, string>>({})

  // ---------------------------------------------------------------- init

  init(ctx: PluginContext): void {
    this.ctx = ctx
    this.state = initStorage(ctx)
    initFileSystem(ctx)
    initAIProxy(ctx)
    initKanban(ctx)

    hydrate(this.state)
    $langSetting.set(this.state.settings.language)
    this.$sidebarOpen.set(ctx.storage.get('sidebarOpen', true))

    for (const [id, content] of Object.entries(this.state.contents)) {
      this.textCache.set(id, content)
    }
    this.docStates = new Map(Object.entries(this.state.docStates ?? {}))
  }

  setLocale(locale: string): void {
    this.currentLocale = locale
    $labelsVersion.set($labelsVersion.get() + 1)
  }

  t(key: string, ...args: unknown[]): string {
    return translateIn(this.currentLocale, key, ...args)
  }

  private snapshot(): PersistedState {
    const docs = $docs.get()
    const scratches: ScratchDoc[] = []
    const seen = new Set<string>()
    const contents: Record<string, string> = {}

    for (const doc of Object.values(docs)) {
      if (doc.kind === 'scratch') {
        scratches.push(doc)
        seen.add(doc.id)
      }
    }
    // scratches from earlier sessions that are currently closed stay persisted
    for (const s of this.state.scratches) {
      if (!seen.has(s.id)) {
        scratches.push(s)
        seen.add(s.id)
      }
    }
    for (const s of this.state.scratches) {
      if (this.state.contents[s.id] !== undefined) contents[s.id] = this.state.contents[s.id]
    }
    for (const [id, text] of this.textCache.entries()) {
      if (id.startsWith('scratch-')) contents[id] = text
    }

    return {
      scratches,
      contents,
      openTabs: $openTabs.get(),
      activeId: $activeId.get(),
      cursorLines: this.state.cursorLines,
      recentFiles: $recentFiles.get(),
      settings: { ...$settings.get(), ai: $aiConfig.get() },
      snippets: $snippets.get(),
      fileLanguages: this.state.fileLanguages ?? {},
      docStates: this.state.docStates ?? {}
    }
  }

  /** Fold the in-memory docStates into the persisted snapshot: refresh the
   *  current doc's entry when dirty, prune entries for docs that no longer
   *  exist (closed file tabs, deleted scratches) and cap the total size. */
  private foldDocStatesIntoSnapshot(): void {
    if (!this.docStatesDirty) return
    this.docStatesDirty = false
    if (this.view && this.viewDocId) {
      try {
        this.docStates.set(this.viewDocId, this.view.state.toJSON({ history: historyField }))
      } catch {
        // Serialization hiccup — keep the older entry, if any.
      }
    }
    const valid = new Set<string>()
    for (const s of this.state.scratches) valid.add(s.id)
    for (const id of $openTabs.get()) if (id.startsWith('file:')) valid.add(id)
    const out: Record<string, Record<string, unknown>> = {}
    let size = 2 // "{}"
    for (const [id, serialized] of this.docStates) {
      if (!valid.has(id)) continue
      out[id] = serialized
      size += JSON.stringify(serialized).length + id.length + 4
      if (size > 4_000_000) {
        // Stay well under storage limits; a dropped entry only costs undo
        // history for that doc, never content.
        break
      }
    }
    this.state.docStates = out
  }

  private persist(immediate = false): void {
    this.foldDocStatesIntoSnapshot()
    this.state = this.snapshot()
    if (immediate) persistNow(this.state)
    else persistSoon(this.state)
  }

  // ---------------------------------------------------------------- editor

  attachEditor(parent: HTMLElement): () => void {
    const active = activeDoc()
    const docId = active?.id ?? null
    const initialText = docId ? this.textCache.get(docId) ?? '' : ''

    const extraKeys = keymap.of([
      { key: 'Mod-s', run: () => (this.handlers.get('scratchpad.save')?.(), true) },
      { key: 'Mod-Shift-s', run: () => (this.handlers.get('scratchpad.saveAs')?.(), true) },
      { key: 'Mod-k', run: () => (this.toggleAIPopup(), true) }
    ])

    const created = createEditor({
      parent,
      doc: initialText,
      languageExtensions: [],
      wordWrap: $settings.get().wordWrap,
      onDocChanged: view => this.onDocChanged(view),
      onSelectionChanged: view => this.onSelectionChanged(view),
      extraKeys
    })
    this.view = created.view
    this.extensions = created.extensions
    this.viewDocId = docId
    // React remount of the editor host: restore the doc's captured state.
    if (docId && this.docStates.has(docId)) {
      created.view.setState(this.restoreStateFor(docId, initialText))
    }

    void this.applyLanguageFor(docId)
    void this.applyWrap()
    this.updateStatus(created.view)

    // A restored session with a FILE tab active: content is not persisted,
    // load it from disk now (scratchpads come from storage).
    if (active?.kind === 'file' && !this.textCache.has(active.id)) {
      void this.loadFileInto(active.id)
    }

    return () => {
      created.view.destroy()
      this.view = null
    }
  }

  private get text(): string {
    return this.view ? this.view.state.doc.toString() : ''
  }

  private onDocChanged(view: EditorView): void {
    const id = $activeId.get()
    if (!id) return
    const text = view.state.doc.toString()
    this.textCache.set(id, text)
    const doc = $docs.get()[id]
    if (doc?.kind === 'file') {
      const baseline = this.baselines.get(id) ?? ''
      const dirty = text !== baseline
      const current = $dirty.get()
      if (current[id] !== dirty) $dirty.set({ ...current, [id]: dirty })
    }
    const scratch = this.state.scratches.find(s => s.id === id)
    if (scratch) scratch.updatedAt = Date.now()
    this.docStatesDirty = true
    this.persist()
    this.updateStatus(view)
  }

  private onSelectionChanged(view: EditorView): void {
    const id = $activeId.get()
    if (id) {
      this.state.cursorLines[id] = view.state.doc.lineAt(view.state.selection.main.head).number
    }
    this.updateStatus(view)
  }

  private updateStatus(view: EditorView): void {
    const sel = view.state.selection.main
    this.$status.set({
      lines: view.state.doc.lines,
      selected: sel.empty ? 0 : sel.to - sel.from
    })
  }

  private async applyLanguageFor(docId: string | null): Promise<void> {
    if (!this.view) return
    const doc = docId ? $docs.get()[docId] : null
    const lang = doc?.language ?? 'plain'
    const exts = await languageExtensions(lang)
    if (this.view) await setLanguage(this.view, exts)
  }

  async applyWrap(): Promise<void> {
    if (this.view) setWordWrap(this.view, $settings.get().wordWrap)
  }

  /** Swap the CodeMirror document for a tab switch / open. The outgoing doc's
   *  selection + undo history are serialized into `docStates`; if the incoming
   *  doc has a matching cached state it is restored, so undo history and
   *  cursor survive tab switches. `text` must equal the doc's cached content —
   *  a cached state whose text disagrees (e.g. re-opened file reloaded from
   *  disk) is discarded. */
  private swapDoc(docId: string | null, text: string): void {
    if (!this.view) return
    if (docId === this.viewDocId) {
      // Same-doc swap (async file load landed): fresh state, cached one is stale.
      if (docId) {
        this.docStates.delete(docId)
        this.docStatesDirty = true
      }
      this.view.setState(EditorState.create({ doc: text, extensions: this.extensions }))
      void this.applyLanguageFor(docId)
      this.updateStatus(this.view)
      return
    }
    this.captureViewState()
    this.view.setState(this.restoreStateFor(docId, text))
    this.viewDocId = docId
    void this.applyLanguageFor(docId)
    this.updateStatus(this.view)
  }

  private captureViewState(): void {
    if (!this.view || !this.viewDocId) return
    this.docStates.set(this.viewDocId, this.view.state.toJSON({ history: historyField }))
    this.docStatesDirty = true
  }

  private restoreStateFor(docId: string | null, text: string): EditorState {
    const cached = docId ? this.docStates.get(docId) : undefined
    if (cached) {
      try {
        const state = EditorState.fromJSON(cached, { extensions: this.extensions }, { history: historyField })
        if (state.doc.toString() === text) return state
      } catch {
        // Malformed cache entry — fall through to a fresh state.
      }
    }
    return EditorState.create({ doc: text, extensions: this.extensions })
  }

  /** Activate a tab (or re-open a closed scratchpad from the sidebar). */
  activate(docId: string): void {
    const alreadyActive = $activeId.get() === docId && $openTabs.get().includes(docId)
    // Short-circuit only when the content is present; a restored file tab with
    // no cached text must fall through so the lazy disk load can happen.
    if (alreadyActive && this.textCache.has(docId)) return
    const currentId = $activeId.get()
    if (currentId && this.view) this.textCache.set(currentId, this.text)

    const doc = $docs.get()[docId]
    if (!doc) return
    openTab(docId, doc)
    $activeId.set(docId)

    const cached = this.textCache.get(docId)
    if (cached !== undefined) {
      this.swapDoc(docId, cached)
    } else if (doc.kind === 'file') {
      this.swapDoc(docId, '')
      void this.loadFileInto(docId)
    } else {
      this.swapDoc(docId, '')
    }
    this.persist()
  }

  private async loadFileInto(docId: string): Promise<void> {
    const doc = $docs.get()[docId]
    if (!doc || doc.kind !== 'file') return
    try {
      const content = await readFile(doc.path)
      // If the user typed while the read was in flight, keep their edits
      // (the view text wins; the loaded content becomes the baseline).
      const typed = this.textCache.get(docId)
      const edited = typed !== undefined && typed !== ''
      this.baselines.set(docId, content)
      if (!edited) this.textCache.set(docId, content)
      if ($activeId.get() === docId && !edited) {
        this.swapDoc(docId, content)
        $dirty.set({ ...$dirty.get(), [docId]: false })
      }
    } catch {
      this.toast(this.t('error.fileRead'), 'error')
      this.textCache.set(docId, '')
    }
  }

  // ---------------------------------------------------------------- docs

  newScratch(): void {
    const seq = this.state.scratches.length + 1
    const doc: ScratchDoc = {
      kind: 'scratch',
      id: newScratchId(),
      name: `${this.t('tabs.untitled')} ${seq}`,
      language: 'plain',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const currentId = $activeId.get()
    if (currentId && this.view) this.textCache.set(currentId, this.text)
    this.textCache.set(doc.id, '')
    this.state.scratches.push(doc)
    openTab(doc.id, doc)
    $activeId.set(doc.id)
    this.swapDoc(doc.id, '')
    this.persist()
  }

  async openPath(path?: string): Promise<void> {
    let target = path
    let content: string | null = null
    if (target) {
      try {
        content = await readFile(target)
      } catch {
        this.toast(this.t('error.fileRead'), 'error')
        return
      }
    } else {
      const res = await openFileDialog()
      if (res.canceled || !res.file) return
      target = res.file.path
      content = res.file.content
    }

    const id = fileDocId(target!)
    const doc: FileDoc = {
      kind: 'file',
      id,
      path: target!,
      name: target!.split('/').pop() || target!,
      language: this.state.fileLanguages?.[target!] ?? languageForFilename(target!),
      dirty: false
    }
    const currentId = $activeId.get()
    if (currentId && this.view) this.textCache.set(currentId, this.text)
    this.textCache.set(id, content!)
    this.baselines.set(id, content!)
    openTab(id, doc)
    $activeId.set(id)
    addRecentFile(target!)
    this.swapDoc(id, content!)
    $dirty.set({ ...$dirty.get(), [id]: false })
    this.persist()
  }

  openRecent(path: string): void {
    void this.openPath(path)
  }

  async save(): Promise<void> {
    const doc = activeDoc()
    if (!doc) return
    const text = this.text
    if (doc.kind === 'scratch') {
      this.textCache.set(doc.id, text)
      this.persist(true)
      this.toast(this.t('status.saved'), 'info')
      return
    }
    try {
      await writeFile(doc.path, text)
      this.baselines.set(doc.id, text)
      $dirty.set({ ...$dirty.get(), [doc.id]: false })
      this.toast(this.t('status.saved'), 'info')
    } catch {
      this.toast(this.t('error.fileWrite'), 'error')
    }
  }

  async saveAs(): Promise<void> {
    const doc = activeDoc()
    if (!doc) return
    const text = this.text
    const suggested = doc.kind === 'file' ? doc.name : `${doc.name || 'scratchpad'}.md`
    const target = await saveFileAs(suggested, text)
    if (!target) return
    const id = fileDocId(target)
    const fileDoc: FileDoc = {
      kind: 'file',
      id,
      path: target,
      name: target.split('/').pop() || target,
      language: this.state.fileLanguages?.[target] ?? languageForFilename(target),
      dirty: false
    }
    if (doc.kind === 'scratch') {
      this.textCache.delete(doc.id)
      this.docStates.delete(doc.id)
      this.docStatesDirty = true
      this.state.scratches = this.state.scratches.filter(s => s.id !== doc.id)
      removeDoc(doc.id)
    }
    this.textCache.set(id, text)
    this.baselines.set(id, text)
    openTab(id, fileDoc)
    $activeId.set(id)
    addRecentFile(target)
    this.swapDoc(id, text)
    $dirty.set({ ...$dirty.get(), [id]: false })
    this.persist(true)
    this.toast(this.t('status.saved'), 'info')
  }

  closeActiveTab(): void {
    const doc = activeDoc()
    if (!doc) return
    if (doc.kind === 'file' && $dirty.get()[doc.id]) {
      this.$dialog.set({ kind: 'confirm-close', docId: doc.id })
      return
    }
    this.doClose(doc.id)
  }

  doClose(docId: string): void {
    const currentId = $activeId.get()
    if (currentId === docId && this.view) this.textCache.set(docId, this.text)
    closeTabInStore(docId)
    const next = activeDoc()
    const text = next ? this.textCache.get(next.id) ?? '' : ''
    if (next) {
      openTab(next.id, next)
    }
    this.swapDoc(next?.id ?? null, text)
    // After swapDoc: its capture step re-recorded the closed doc's state.
    this.docStates.delete(docId)
    this.docStatesDirty = true
    this.persist()
  }

  setDocLanguage(lang: LanguageId): void {
    const doc = activeDoc()
    if (!doc) return
    const updated: Doc = { ...doc, language: lang }
    upsertDoc(updated)
    const scratch = this.state.scratches.find(s => s.id === doc.id)
    if (scratch) scratch.language = lang
    if (doc.kind === 'file') {
      // Filename-derived language would reset on the next hydrate — persist.
      this.state.fileLanguages = { ...(this.state.fileLanguages ?? {}), [doc.path]: lang }
    }
    void this.applyLanguageFor(doc.id)
    this.persist()
  }

  toggleWrap(): void {
    const next = { ...$settings.get(), wordWrap: !$settings.get().wordWrap }
    $settings.set(next)
    void this.applyWrap()
    this.persist(true)
  }

  setLanguageSetting(setting: LanguageSetting): void {
    $langSetting.set(setting)
    $settings.set({ ...$settings.get(), language: setting })
    this.setLocale(setting === 'system' ? this.currentLocale : setting)
    this.persist(true)
  }

  toggleSidebar(): void {
    const next = !this.$sidebarOpen.get()
    this.$sidebarOpen.set(next)
    this.ctx.storage.set('sidebarOpen', next)
  }

  // ---------------------------------------------------------------- AI

  toggleAIPopup(): void {
    this.$aiPopupOpen.set(!this.$aiPopupOpen.get())
  }

  closeAIPopup(): void {
    this.$aiPopupOpen.set(false)
  }

  private aiContext(scope: 'selection' | 'document'): AIActionContext & { rangeFrom: number; rangeTo: number } {
    const doc = activeDoc()
    const documentText = this.text
    let selectedText = ''
    let rangeFrom = 0
    let rangeTo = 0
    if (scope === 'selection' && this.view) {
      const sel = this.view.state.selection.main
      selectedText = this.view.state.doc.sliceString(sel.from, sel.to)
      rangeFrom = sel.from
      rangeTo = sel.to
    }
    return {
      scope,
      selectedText,
      documentText,
      language: doc?.language ?? 'plain',
      rangeFrom,
      rangeTo,
      question: undefined
    }
  }

  private hasSelection(): boolean {
    if (!this.view) return false
    return !this.view.state.selection.main.empty
  }

  runAIAction(actionId: string, question?: string): void {
    const action = AI_ACTIONS.find(a => a.id === actionId)
    if (!action || this.$aiBusy.get()) return
    this.closeAIPopup()
    const scope: 'selection' | 'document' = this.hasSelection() ? 'selection' : 'document'
    void this.executeAI(action, scope, question)
  }

  private async executeAI(
    action: AIAction,
    scope: 'selection' | 'document',
    question?: string
  ): Promise<void> {
    const ctx = this.aiContext(scope)
    ctx.question = question

    if (scope === 'selection' && !ctx.selectedText.trim()) return
    if (scope === 'document' && !ctx.documentText.trim()) return

    this.$aiBusy.set(true)
    try {
      const ai = $aiConfig.get()
      const provider = providerForAction(ai, action.id)
      const instruction = ai.persona.trim() || undefined
      const template = ai.templates[action.id]
      const result = await provider.complete({
        prompt: buildActionPrompt(action, ctx, template),
        instruction
      })
      const text = result.text.trim()
      if (!text) {
        this.toast(this.t('ai.preview.empty'), 'error')
        return
      }
      this.$dialog.set({
        kind: 'ai-preview',
        action,
        scope,
        rangeFrom: ctx.rangeFrom,
        rangeTo: ctx.rangeTo,
        original: scope === 'selection' ? ctx.selectedText : ctx.documentText,
        result: text,
        isAnswer: action.kind === 'answer'
      })
    } catch {
      const available = await providerForAction($aiConfig.get(), action.id)
        .isAvailable()
        .catch(() => false)
      this.toast(available ? this.t('ai.error') : this.t('ai.error.unavailable'), 'error')
    } finally {
      this.$aiBusy.set(false)
    }
  }

  // ------------------------------------------------------- AI preview apply

  dismissDialog(): void {
    this.$dialog.set({ kind: 'none' })
  }

  copyResult(text: string): void {
    void this.ctx.os.writeClipboard(text)
    this.dismissDialog()
  }

  applyAIResult(mode: 'replaceSelection' | 'insertBelow' | 'replaceDocument'): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'ai-preview' || !this.view) return
    const { result, scope, rangeFrom, rangeTo } = dialog

    if (mode === 'replaceDocument') {
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: result } })
    } else if (mode === 'replaceSelection' && scope === 'selection') {
      this.view.dispatch({ changes: { from: rangeFrom, to: rangeTo, insert: result } })
    } else {
      const at = scope === 'selection' ? rangeTo : this.view.state.selection.main.head
      this.view.dispatch({ changes: { from: at, insert: `\n${result}` } })
    }
    this.dismissDialog()
  }

  // ------------------------------------------------------- AI settings

  openAISettings(): void {
    this.closeAIPopup()
    const config = JSON.parse(JSON.stringify($aiConfig.get())) as AIConfig
    this.$dialog.set({ kind: 'ai-settings', config, test: null, testing: false, profiles: null })
    // Suggest the gateway's agent profiles in the Hermes profile field; the
    // field stays free-text (a failed lookup just leaves it without hints).
    host
      .request<{ profiles?: Array<{ name?: string }> }>('profiles.list', {})
      .then(res => {
        const dialog = this.$dialog.get()
        if (dialog.kind !== 'ai-settings') return
        this.$dialog.set({
          ...dialog,
          profiles: (res.profiles ?? []).map(p => p.name ?? '').filter(Boolean)
        })
      })
      .catch(() => {
        const dialog = this.$dialog.get()
        if (dialog.kind === 'ai-settings') this.$dialog.set({ ...dialog, profiles: [] })
      })
  }

  updateAISettings(patch: Partial<Extract<DialogState, { kind: 'ai-settings' }>>): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'ai-settings') return
    this.$dialog.set({ ...dialog, ...patch })
  }

  /** Probe the dialog's (possibly unsaved) config for reachability. */
  testAIConnection(): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'ai-settings' || dialog.testing) return
    this.updateAISettings({ testing: true, test: null })
    providerFor(dialog.config)
      .isAvailable()
      .then(ok => this.updateAISettings({ testing: false, test: ok ? 'ok' : 'fail' }))
      .catch(() => this.updateAISettings({ testing: false, test: 'fail' }))
  }

  saveAISettings(): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'ai-settings') return
    setAIConfig(dialog.config)
    // Profile/model changes only affect the NEXT hidden session.
    resetHermesSession()
    this.dismissDialog()
    this.persist(true)
    this.toast(this.t('ai.settings.saved'), 'info')
  }

  // ---------------------------------------------------------------- kanban

  openKanbanDialog(): void {
    this.closeAIPopup()
    const scope: 'selection' | 'document' = this.hasSelection() ? 'selection' : 'document'
    const ctx = this.aiContext(scope)
    const source = scope === 'selection' ? ctx.selectedText : ctx.documentText
    if (!source.trim()) return
    this.$dialog.set({
      kind: 'kanban',
      title: '',
      description: this.buildTaskDescription(source),
      boards: null,
      board: null,
      priority: 0,
      suggesting: false,
      creating: false
    })
    void this.loadBoards()
  }

  private buildTaskDescription(source: string): string {
    const doc = activeDoc()
    const lines = [source.trimEnd(), '', '---', 'Source: Hermes Scratchpad']
    if (doc?.kind === 'file') lines.push(`File: ${doc.name}`)
    if (doc) lines.push(`Language: ${doc.language}`)
    return lines.join('\n')
  }

  private async loadBoards(): Promise<void> {
    try {
      const boards = await listBoards()
      const dialog = this.$dialog.get()
      if (dialog.kind !== 'kanban') return
      const current = boards.find(b => b.current)
      this.$dialog.set({ ...dialog, boards, board: current?.slug ?? boards[0]?.slug ?? null })
    } catch {
      // Boards stay null; the dialog falls back to the board's current default.
    }
  }

  updateKanbanDialog(patch: Partial<Extract<DialogState, { kind: 'kanban' }>>): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'kanban') return
    this.$dialog.set({ ...dialog, ...patch })
  }

  suggestKanbanTitle(): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'kanban' || dialog.suggesting) return
    this.updateKanbanDialog({ suggesting: true })
    const source = dialog.description.split('\n---')[0]
    const instruction = $aiConfig.get().persona.trim() || undefined
    getAIProvider()
      .complete({ prompt: buildTaskTitlePrompt(source), instruction })
      .then(res => {
        const current = this.$dialog.get()
        if (current.kind !== 'kanban') return
        this.$dialog.set({ ...current, title: res.text.trim().replace(/^["']|["']$/g, ''), suggesting: false })
      })
      .catch(() => {
        this.updateKanbanDialog({ suggesting: false })
        this.toast(this.t('ai.error.unavailable'), 'error')
      })
  }

  async submitKanbanTask(): Promise<void> {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'kanban' || dialog.creating) return
    const title = dialog.title.trim()
    if (!title) return
    this.updateKanbanDialog({ creating: true })
    try {
      await createTask({
        title,
        description: dialog.description,
        board: dialog.board,
        priority: dialog.priority
      })
      this.dismissDialog()
      this.toast(this.t('kanban.success', title), 'info')
    } catch {
      this.updateKanbanDialog({ creating: false })
      this.toast(this.t('kanban.error'), 'error')
    }
  }

  // ---------------------------------------------------------------- rename

  startRename(docId: string): void {
    const doc = $docs.get()[docId]
    if (!doc || doc.kind !== 'scratch') return
    this.$renamingId.set(docId)
  }

  commitRename(name: string): void {
    const docId = this.$renamingId.get()
    this.$renamingId.set(null)
    const trimmed = name.trim()
    const doc = docId ? $docs.get()[docId] : null
    if (!docId || !doc || doc.kind !== 'scratch') return
    if (!trimmed || trimmed === doc.name) return
    const updated: ScratchDoc = { ...doc, name: trimmed }
    upsertDoc(updated)
    const scratch = this.state.scratches.find(s => s.id === docId)
    if (scratch) scratch.name = trimmed
    this.persist(true)
  }

  cancelRename(): void {
    this.$renamingId.set(null)
  }

  // ---------------------------------------------------------------- search

  /** Focus the sidebar search field (palette command + mod+alt+f). */
  focusSearch(): void {
    this.closeAIPopup()
    this.$searchFocusSeq.set(this.$searchFocusSeq.get() + 1)
  }

  /** Searchable content of a scratchpad (in-session text wins over persisted). */
  scratchContent(id: string): string {
    return this.textCache.get(id) ?? this.state.contents[id] ?? ''
  }

  /** Paths whose disk read for search is already in flight or failed. */
  private fileSearchPending = new Set<string>()

  /** Searchable content of a file doc. Open tabs use their in-session cache;
   *  closed file tabs have no cached text, so their content is read lazily
   *  from disk once per session and memoized in $fileSearchContents (which
   *  re-renders the sidebar when the read lands). Until then '' is returned —
   *  name matches still show, content matches appear after the read. */
  fileSearchContent(path: string): string {
    const cached = this.textCache.get(fileDocId(path))
    if (cached !== undefined) return cached
    const memo = this.$fileSearchContents.get()[path]
    if (memo !== undefined) return memo
    if (!this.fileSearchPending.has(path)) {
      this.fileSearchPending.add(path)
      readFile(path)
        .then(content => this.$fileSearchContents.set({ ...this.$fileSearchContents.get(), [path]: content }))
        .catch(() => this.$fileSearchContents.set({ ...this.$fileSearchContents.get(), [path]: '' }))
    }
    return ''
  }

  // ---------------------------------------------------------------- snippets

  openSnippetDialog(): void {
    this.closeAIPopup()
    const scope: 'selection' | 'document' = this.hasSelection() ? 'selection' : 'document'
    const ctx = this.aiContext(scope)
    const content = scope === 'selection' ? ctx.selectedText : ctx.documentText
    if (!content.trim()) return
    const doc = activeDoc()
    this.$dialog.set({ kind: 'snippet', content, language: doc?.language ?? 'plain' })
  }

  saveSnippet(title: string, favorite: boolean, tagsRaw = ''): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'snippet' || !title.trim()) return
    upsertSnippet({
      id: `snip-${Date.now().toString(36)}`,
      title: title.trim(),
      language: dialog.language,
      content: dialog.content,
      tags: parseTags(tagsRaw),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite
    })
    this.dismissDialog()
    this.persist(true)
    this.toast(this.t('snippets.saved', title.trim()), 'info')
  }

  insertSnippet(id: string): void {
    const snippet = $snippets.get().find(s => s.id === id)
    if (!snippet || !this.view) return
    const pos = this.view.state.selection.main.head
    this.view.dispatch({ changes: { from: pos, insert: snippet.content } })
  }

  openSnippet(id: string): void {
    const snippet = $snippets.get().find(s => s.id === id)
    if (!snippet) return
    const doc: ScratchDoc = {
      kind: 'scratch',
      id: newScratchId(),
      name: snippet.title,
      language: snippet.language,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.textCache.set(doc.id, snippet.content)
    this.state.scratches.push(doc)
    openTab(doc.id, doc)
    $activeId.set(doc.id)
    this.swapDoc(doc.id, snippet.content)
    this.persist()
  }

  toggleSnippetFavorite(id: string): void {
    const snippet = $snippets.get().find(s => s.id === id)
    if (!snippet) return
    upsertSnippet({ ...snippet, favorite: !snippet.favorite })
    this.persist()
  }

  /** Open the edit dialog for an existing snippet (tags/title/favorite/delete). */
  editSnippet(id: string): void {
    const snippet = $snippets.get().find(s => s.id === id)
    if (!snippet) return
    this.$dialog.set({
      kind: 'snippet-edit',
      id,
      title: snippet.title,
      tags: snippet.tags.join(', '),
      favorite: snippet.favorite,
      confirming: false
    })
  }

  updateSnippetEdit(patch: Partial<Extract<DialogState, { kind: 'snippet-edit' }>>): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'snippet-edit') return
    this.$dialog.set({ ...dialog, ...patch })
  }

  commitSnippetEdit(): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'snippet-edit') return
    const snippet = $snippets.get().find(s => s.id === dialog.id)
    const title = dialog.title.trim()
    if (!snippet || !title) return
    upsertSnippet({
      ...snippet,
      title,
      tags: parseTags(dialog.tags),
      favorite: dialog.favorite,
      updatedAt: Date.now()
    })
    this.dismissDialog()
    this.persist(true)
    this.toast(this.t('snippets.updated', title), 'info')
  }

  /** Two-step delete: first call arms the button, second call deletes. */
  deleteSnippetFromEdit(): void {
    const dialog = this.$dialog.get()
    if (dialog.kind !== 'snippet-edit') return
    if (!dialog.confirming) {
      this.$dialog.set({ ...dialog, confirming: true })
      return
    }
    const snippet = $snippets.get().find(s => s.id === dialog.id)
    deleteSnippet(dialog.id)
    this.dismissDialog()
    this.persist(true)
    if (snippet) this.toast(this.t('snippets.deleted', snippet.title), 'info')
  }

  // ---------------------------------------------------------------- toasts

  toast(text: string, kind: 'info' | 'error'): void {
    const seq = Date.now()
    this.$toast.set({ text, kind, seq })
    if (kind === 'error') {
      void host.notify({ kind: 'error', message: text })
    }
    setTimeout(() => {
      const current = this.$toast.get()
      if (current?.seq === seq) this.$toast.set(null)
    }, 4000)
  }

  // ---------------------------------------------------------------- commands

  /** Public command entry (palette, keybinds, in-editor keys). */
  dispatch(id: CommandId): void {
    this.handlers.get(id)?.()
  }

  private handlers = new Map<CommandId, CommandHandler>()

  registerCommands(map: Array<[CommandId, CommandHandler]>): void {
    for (const [id, handler] of map) {
      this.handlers.set(id, handler)
      registerCommand(id, handler)
    }
  }
}

export const controller = new ScratchpadController()
