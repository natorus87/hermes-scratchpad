/**
 * CodeMirror editor setup. Theme integration uses Hermes CSS variables
 * (--ui-*, --chrome-*, --foreground/…) so Dark and Light mode both work
 * without hardcoded colors.
 */
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers, drawSelection, highlightSpecialChars } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'

export const languageCompartment = new Compartment()
export const wrapCompartment = new Compartment()

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: 'var(--foreground, inherit)'
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace',
    lineHeight: '1.5'
  },
  '.cm-content': { caretColor: 'var(--ui-accent, var(--foreground))' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ui-accent, var(--foreground))' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--ui-selection, rgba(127,127,127,.25))'
  },
  '.cm-activeLine': { backgroundColor: 'var(--ui-active-line, rgba(127,127,127,.08))' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ui-text-quaternary, rgba(127,127,127,.5))',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--ui-text-secondary, inherit)'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--ui-selection, rgba(127,127,127,.2))' },
  '.cm-panels': {
    backgroundColor: 'var(--ui-surface, inherit)',
    color: 'inherit',
    borderColor: 'var(--ui-stroke-secondary, rgba(127,127,127,.3))'
  },
  '.cm-panel input, .cm-panel button': { color: 'inherit' },
  '.cm-searchMatch': {
    backgroundColor: 'var(--ui-search-match, rgba(255,200,0,.35))',
    outline: '1px solid var(--ui-stroke-secondary, transparent)'
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--ui-surface, inherit)',
    color: 'inherit',
    border: '1px solid var(--ui-stroke-secondary, rgba(127,127,127,.3))'
  }
})

const highlightTheme = syntaxHighlighting(defaultHighlightStyle, { fallback: true })

export interface EditorOptions {
  parent: HTMLElement
  doc: string
  languageExtensions: Extension[]
  wordWrap: boolean
  onDocChanged: (view: EditorView) => void
  onSelectionChanged: (view: EditorView) => void
  /** Extra keymap entries (command surface: save, AI popup, …). */
  extraKeys?: Extension
}

export function createEditor(options: EditorOptions): {
  view: EditorView
  state: EditorState
  extensions: Extension[]
} {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of('  '),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    ...(options.extraKeys ? [options.extraKeys] : []),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab
    ]),
    languageCompartment.of(options.languageExtensions),
    wrapCompartment.of(options.wordWrap ? EditorView.lineWrapping : []),
    highlightTheme,
    editorTheme,
    EditorView.updateListener.of(update => {
      if (update.docChanged) options.onDocChanged(update.view)
      if (update.selectionSet || update.docChanged) options.onSelectionChanged(update.view)
    })
  ]

  const state = EditorState.create({ doc: options.doc, extensions })
  const view = new EditorView({ state, parent: options.parent })
  return { view, state, extensions }
}

export function setWordWrap(view: EditorView, on: boolean): void {
  view.dispatch({ effects: wrapCompartment.reconfigure(on ? EditorView.lineWrapping : []) })
}

export async function setLanguage(view: EditorView, extensions: Extension[]): Promise<void> {
  view.dispatch({ effects: languageCompartment.reconfigure(extensions) })
}

export { EditorView }
