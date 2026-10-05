/**
 * ScratchpadPage — the full workspace page: sidebar, tab bar, editor host,
 * status bar, AI popup, dialogs. Written with jsx() calls (the disk plugin
 * file loads uncompiled — JSX syntax would not parse).
 */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type FocusEvent as ReactFocusEvent } from 'react'
import { useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { controller, type DialogState } from '../plugin/controller'
import { candidateFilePaths, filterScratches, filterSnippets, matchesQuery, scratchEntry } from '../documents/search'
import { $activeId, $dirty, $docs, $openTabs, $recentFiles, $settings, $snippets, $docs as $docsStore, type Doc, type Snippet } from '../documents/store'
import { $langSetting, useT, type LanguageSetting } from './i18n'
import { LANGUAGE_IDS, type LanguageId } from '../editor/languages'
import { AI_ACTIONS } from '../ai/actions'
import { diffLines, originalLines, resultLines } from '../ai/diff'

function TabBar(): any {
  const t = useT()
  const tabs = useValue($openTabs)
  const docs = useValue($docs)
  const activeId = useValue($activeId)
  const dirty = useValue($dirty)

  return jsxs('div', {
    className: 'hsp-tabbar',
    children: [
      tabs.map(id => {
        const doc = docs[id]
        if (!doc) return null
        const isDirty = dirty[id]
        return jsxs(
          'div',
          {
            className: 'hsp-tab',
            'data-active': id === activeId ? 'true' : 'false',
            onClick: () => controller.activate(id),
            title: doc.kind === 'file' ? doc.path : doc.name,
            children: [
              isDirty ? jsx('span', { className: 'hsp-dirty', title: t('tabs.dirty') }) : null,
              jsx('span', { className: 'hsp-tab-name', children: doc.kind === 'file' ? `${doc.name}${isDirty ? ' ●' : ''}` : doc.name }),
              jsx('button', {
                className: 'hsp-close',
                type: 'button',
                title: t('tabs.close'),
                onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation()
                  if (id === activeId) controller.closeActiveTab()
                  else controller.doClose(id)
                },
                children: '✕'
              })
            ]
          },
          id
        )
      }),
      jsx('div', { className: 'hsp-tabbar-spacer' }),
      jsxs('div', {
        className: 'hsp-tabbar-actions',
        children: [
          jsx(
            'button',
            {
              className: 'hsp-iconbtn',
              type: 'button',
              title: t('command.new'),
              onClick: () => controller.newScratch(),
              children: '+'
            },
            'new'
          ),
          jsx(
            'button',
            {
              className: 'hsp-iconbtn',
              type: 'button',
              title: t('command.open'),
              onClick: () => void controller.openPath(),
              children: t('file.open')
            },
            'open'
          )
        ]
      })
    ]
  })
}

function RenameInput({ docId, initialName }: { docId: string; initialName: string }): any {
  const t = useT()
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return jsx('input', {
    ref,
    className: 'hsp-rename-input',
    defaultValue: initialName,
    placeholder: t('list.renamePlaceholder'),
    title: t('list.rename'),
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      // keep the value; commit happens on Enter/blur
      void event
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') controller.commitRename((event.target as HTMLInputElement).value)
      if (event.key === 'Escape') controller.cancelRename()
    },
    onBlur: (event: ReactFocusEvent<HTMLInputElement>) => controller.commitRename(event.target.value)
  })
}

function Sidebar(): any {
  const t = useT()
  const open = useValue(controller.$sidebarOpen)
  const docs = useValue($docs)
  const openTabs = useValue($openTabs)
  const recent = useValue($recentFiles)
  const snippets = useValue($snippets)
  const renamingId = useValue(controller.$renamingId)
  const focusSeq = useValue(controller.$searchFocusSeq)
  // Subscribed so lazy file-content reads re-render the search results.
  useValue(controller.$fileSearchContents)

  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const searching = query.trim().length > 0
  useEffect(() => {
    if (focusSeq > 0) searchRef.current?.focus()
  }, [focusSeq])

  const allScratches = Object.values(docs).filter((d): d is Extract<Doc, { kind: 'scratch' }> => d.kind === 'scratch')
  const closedScratches = allScratches.filter(s => !openTabs.includes(s.id))
  const scratchMatches = searching
    ? filterScratches(
        allScratches.map(s => scratchEntry(s, controller.scratchContent(s.id))),
        query
      )
    : []
  const matchedSnippets = searching ? filterSnippets(snippets, query) : []
  const openFilePaths = Object.values(docs)
    .filter((d): d is Extract<Doc, { kind: 'file' }> => d.kind === 'file')
    .map(d => d.path)
  const fileMatches = searching
    ? candidateFilePaths(openFilePaths, recent)
        .map(path => ({
          path,
          name: path.split('/').pop() || path,
          content: controller.fileSearchContent(path)
        }))
        .filter(e => matchesQuery(query, e.name, e.content))
    : []
  const favorites = snippets.filter(s => s.favorite)

  const scratchItem = (s: { id: string; name: string }, active: boolean, key: string) =>
    renamingId === s.id
      ? jsx(RenameInput, { docId: s.id, initialName: s.name }, key + '-rename')
      : jsx(
          'button',
          {
            className: 'hsp-side-item',
            'data-active': active ? 'true' : 'false',
            type: 'button',
            title: t('list.rename'),
            onDoubleClick: () => controller.startRename(s.id),
            onClick: () => controller.activate(s.id),
            children: jsx('span', { className: 'hsp-name', children: s.name })
          },
          key
        )

  const snippetItem = (s: Snippet) =>
    jsxs(
      'div',
      {
        className: 'hsp-side-row',
        children: [
          jsx(
            'button',
            {
              className: 'hsp-side-item',
              type: 'button',
              onClick: () => controller.openSnippet(s.id),
              children: jsx('span', { className: 'hsp-name', children: s.title })
            },
            'open'
          ),
          jsx('button', {
            className: 'hsp-iconbtn',
            type: 'button',
            title: t('snippets.edit'),
            onClick: () => controller.editSnippet(s.id),
            children: '✎'
          })
        ]
      },
      s.id
    )

  const searchBox = jsxs('div', {
    className: 'hsp-side-search',
    children: [
      jsx('input', {
        ref: searchRef,
        className: 'hsp-search-input',
        type: 'text',
        placeholder: t('list.search'),
        title: t('command.find'),
        value: query,
        onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Escape') {
            setQuery('')
            searchRef.current?.blur()
          }
        }
      }),
      searching
        ? jsx('button', {
            className: 'hsp-search-clear',
            type: 'button',
            title: t('list.clearSearch'),
            onClick: () => setQuery(''),
            children: '✕'
          })
        : null
    ]
  })

  const scratchSection = jsxs('div', {
    className: 'hsp-side-section',
    children: [
      jsxs('div', {
        className: 'hsp-side-title',
        children: [
          t('list.scratchpads'),
          jsx('button', { className: 'hsp-iconbtn', type: 'button', title: t('list.new'), onClick: () => controller.newScratch(), children: '+' })
        ]
      }),
      searchBox,
      searching
        ? [
            scratchMatches.map(s => scratchItem(s, openTabs.includes(s.id), s.id)),
            scratchMatches.length || matchedSnippets.length || fileMatches.length
              ? null
              : jsx('div', { className: 'hsp-noresults', children: t('list.noResults') }, 'noresults')
          ]
        : [
            openTabs.filter(id => id.startsWith('scratch-')).map(id =>
              docs[id] ? scratchItem(docs[id], true, id) : null
            ),
            closedScratches.map(s => scratchItem(s, false, s.id))
          ]
    ]
  }, 'scratches')

  const snippetMatchesSection = searching && matchedSnippets.length
    ? jsxs('div', {
        className: 'hsp-side-section',
        children: [
          jsx('div', { className: 'hsp-side-title', children: t('list.snippets') }),
          matchedSnippets.map(s => snippetItem(s))
        ]
      }, 'snippet-matches')
    : null

  const fileMatchesSection = searching && fileMatches.length
    ? jsxs('div', {
        className: 'hsp-side-section',
        children: [
          jsx('div', { className: 'hsp-side-title', children: t('list.files') }),
          fileMatches.map(e =>
            jsx(
              'button',
              {
                className: 'hsp-side-item',
                type: 'button',
                title: e.path,
                onClick: () => controller.openRecent(e.path),
                children: jsx('span', { className: 'hsp-name', children: e.name })
              },
              e.path
            )
          )
        ]
      }, 'file-matches')
    : null

  return jsx('div', {
    className: `hsp-sidebar${open ? '' : ' hsp-sidebar-collapsed'}`,
    children: open
      ? [
          scratchSection,
          snippetMatchesSection,
          fileMatchesSection,
          recent.length
            ? jsxs('div', {
                className: 'hsp-side-section',
                children: [
                  jsx('div', { className: 'hsp-side-title', children: t('list.recent') }),
                  recent.slice(0, 8).map(path =>
                    jsx(
                      'button',
                      {
                        className: 'hsp-side-item',
                        type: 'button',
                        onClick: () => controller.openRecent(path),
                        children: jsx('span', { className: 'hsp-name', children: path.split('/').pop() || path })
                      },
                      path
                    )
                  )
                ]
              }, 'recent')
            : null,
          favorites.length
            ? jsxs('div', {
                className: 'hsp-side-section',
                children: [
                  jsx('div', { className: 'hsp-side-title', children: t('list.favorites') }),
                  favorites.map(s => snippetItem(s))
                ]
              }, 'favorites')
            : null
        ]
      : null
  })
}

function StatusBar(): any {
  const t = useT()
  const settings = useValue($settings)
  const status = useValue(controller.$status)
  const aiBusy = useValue(controller.$aiBusy)
  const activeId = useValue($activeId)
  const docs = useValue($docs)
  const dirtyMap = useValue($dirty)
  const langSetting = useValue($langSetting)
  const doc = activeId ? docs[activeId] : null
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const langLabel = langSetting === 'system' ? t('settings.language.system') : langSetting === 'de' ? 'Deutsch' : 'English'

  return jsxs('div', {
    className: 'hsp-statusbar',
    children: [
      jsx('select', {
        value: doc?.language ?? 'plain',
        title: t('command.language'),
        onChange: (event: ChangeEvent<HTMLInputElement>) => controller.setDocLanguage(event.target.value as LanguageId),
        children: LANGUAGE_IDS.map(id =>
          jsx('option', { value: id, children: t(`lang.${id}`) }, id)
        )
      }),
      jsx('span', { children: t('status.lines', status.lines) }),
      status.selected ? jsx('span', { children: t('status.selected', status.selected) }) : null,
      doc?.kind === 'file' ? jsx('span', { children: dirtyMap[doc.id] ? t('status.unsaved') : t('status.saved') }) : null,
      jsx('span', { className: 'hsp-grow' }),
      aiBusy ? jsxs('span', { children: [jsx('span', { className: 'hsp-spin' }), ' ', t('status.aiRunning')] }, 'busy') : null,
      jsx(
        'button',
        {
          className: 'hsp-iconbtn',
          type: 'button',
          onClick: () => controller.toggleWrap(),
          title: t('settings.wordWrap'),
          children: settings.wordWrap ? t('status.wrapOn') : t('status.wrapOff')
        },
        'wrap'
      ),
      jsx(
        'button',
        {
          className: 'hsp-iconbtn',
          type: 'button',
          onClick: () => setLangMenuOpen((v: boolean) => !v),
          title: t('settings.language'),
          children: `${t('settings.language')}: ${langLabel}`
        },
        'lang'
      ),
      langMenuOpen
        ? jsxs('div', {
            style: { position: 'absolute', bottom: '26px', right: '8px', zIndex: 50, background: 'var(--ui-surface, inherit)', border: '1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35))', borderRadius: '8px', padding: '4px', display: 'flex', flexDirection: 'column' },
            children: [
              jsx('button', { className: 'hsp-ai-action', type: 'button', onClick: () => { controller.setLanguageSetting('system'); setLangMenuOpen(false) }, children: t('settings.language.system') }),
              jsx('button', { className: 'hsp-ai-action', type: 'button', onClick: () => { controller.setLanguageSetting('de'); setLangMenuOpen(false) }, children: 'Deutsch' }),
              jsx('button', { className: 'hsp-ai-action', type: 'button', onClick: () => { controller.setLanguageSetting('en'); setLangMenuOpen(false) }, children: 'English' })
            ]
          }, 'langmenu')
        : null
    ]
  })
}

function AIPopup(): any {
  const t = useT()
  const open = useValue(controller.$aiPopupOpen)
  const busy = useValue(controller.$aiBusy)
  const [question, setQuestion] = useState('')
  if (!open) return null

  const actions = ['improve', 'shorten', 'structure', 'explain', 'fix', 'refactor', 'generateShell']

  return jsxs('div', {
    className: 'hsp-ai-popup',
    children: [
      jsxs('div', {
        className: 'hsp-ai-title-row',
        children: [
          jsx('span', { className: 'hsp-ai-title', children: t('ai.popup.title') }),
          jsx('button', {
            className: 'hsp-iconbtn',
            type: 'button',
            title: t('ai.settings.title'),
            onClick: () => controller.openAISettings(),
            children: '⚙'
          })
        ]
      }),
      jsxs('div', {
        className: 'hsp-ai-actions',
        children: [
          actions.map(id =>
            jsx(
              'button',
              {
                className: 'hsp-ai-action',
                type: 'button',
                disabled: busy,
                onClick: () => controller.runAIAction(id),
                children: t(`ai.action.${id}`)
              },
              id
            )
          ),
          jsx('button', { className: 'hsp-ai-action', type: 'button', disabled: busy, onClick: () => controller.openKanbanDialog(), children: t('ai.action.createTask') })
        ]
      }),
      jsx('input', {
        className: 'hsp-ai-input',
        placeholder: t('ai.ask.placeholder'),
        value: question,
        onChange: (event: ChangeEvent<HTMLInputElement>) => setQuestion(event.target.value),
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter' && question.trim() && !busy) {
            controller.runAIAction('ask', question.trim())
            setQuestion('')
          }
          if (event.key === 'Escape') controller.closeAIPopup()
        }
      })
    ]
  })
}

function DiffPaneLines({ lines }: { lines: ReturnType<typeof diffLines> }): any {
  return jsx('pre', {
    'data-lines': 'true',
    children: lines.map((line, i) =>
      line.segs
        ? jsxs(
            'span',
            {
              className: 'hsp-diff-line',
              'data-kind': line.kind,
              children: line.segs.map((seg, k) =>
                jsx('span', { className: 'hsp-wseg', 'data-changed': seg.changed ? 'true' : 'false', children: seg.text || ' ' }, k)
              )
            },
            i
          )
        : jsx('span', { className: 'hsp-diff-line', 'data-kind': line.kind, children: line.text || ' ' }, i)
    )
  })
}

function AIPreviewDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'ai-preview' }> }): any {
  const t = useT()
  const diff = diffLines(dialog.original, dialog.result)

  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('ai.preview.title') }),
          jsxs('div', {
            className: 'hsp-preview-grid',
            children: [
              jsxs('div', { className: 'hsp-preview-pane', children: [jsx('div', { className: 'hsp-pane-label', children: t('ai.preview.original') }), jsx(DiffPaneLines, { lines: originalLines(diff) })] }, 'orig'),
              jsxs('div', { className: 'hsp-preview-pane', children: [jsx('div', { className: 'hsp-pane-label', children: t('ai.preview.result') }), jsx(DiffPaneLines, { lines: resultLines(diff) })] }, 'res')
            ]
          }),
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              dialog.isAnswer
                ? [
                    jsx('button', { className: 'hsp-btn', type: 'button', key: 'ins', onClick: () => controller.applyAIResult('insertBelow'), children: t('ai.preview.insertBelow') }),
                    jsx('button', { className: 'hsp-btn', type: 'button', key: 'copy', onClick: () => controller.copyResult(dialog.result), children: t('ai.preview.copy') })
                  ]
                : dialog.scope === 'selection'
                  ? [
                      jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', key: 'repl', onClick: () => controller.applyAIResult('replaceSelection'), children: t('ai.preview.replaceSelection') }),
                      jsx('button', { className: 'hsp-btn', type: 'button', key: 'ins', onClick: () => controller.applyAIResult('insertBelow'), children: t('ai.preview.insertBelow') }),
                      jsx('button', { className: 'hsp-btn', type: 'button', key: 'doc', onClick: () => controller.applyAIResult('replaceDocument'), children: t('ai.preview.replaceDocument') }),
                      jsx('button', { className: 'hsp-btn', type: 'button', key: 'copy', onClick: () => controller.copyResult(dialog.result), children: t('ai.preview.copy') })
                    ]
                  : [
                      jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', key: 'doc', onClick: () => controller.applyAIResult('replaceDocument'), children: t('ai.preview.replaceDocument') }),
                      jsx('button', { className: 'hsp-btn', type: 'button', key: 'copy', onClick: () => controller.copyResult(dialog.result), children: t('ai.preview.copy') })
                    ],
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.dismissDialog(), children: t('ai.preview.cancel') })
            ]
          })
        ]
      })
    ]
  })
}

function KanbanDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'kanban' }> }): any {
  const t = useT()
  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('kanban.dialog.title') }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsxs('label', {
                children: [
                  t('kanban.dialog.titleField'),
                  ' ',
                  jsx('button', { className: 'hsp-iconbtn', type: 'button', disabled: dialog.suggesting, title: t('kanban.dialog.suggestTitle'), onClick: () => controller.suggestKanbanTitle(), children: dialog.suggesting ? '…' : '✨' })
                ]
              }),
              jsx('input', { value: dialog.title, onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateKanbanDialog({ title: event.target.value }), autoFocus: true })
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('kanban.dialog.description') }),
              jsx('textarea', { value: dialog.description, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => controller.updateKanbanDialog({ description: event.target.value }) })
            ]
          }),
          dialog.boards
            ? jsxs('div', {
                className: 'hsp-formrow',
                children: [
                  jsx('label', { children: t('kanban.dialog.board') }),
                  jsx(
                    'select',
                    {
                      value: dialog.board ?? '',
                      onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateKanbanDialog({ board: event.target.value || null }),
                      children: dialog.boards.map(b => jsx('option', { value: b.slug, children: b.name }, b.slug))
                    }
                  )
                ]
              }, 'boardrow')
            : null,
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('kanban.dialog.priority') }),
              jsxs(
                'select',
                {
                  value: String(dialog.priority),
                  onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateKanbanDialog({ priority: Number(event.target.value) }),
                  children: [
                    jsx('option', { value: '2', children: t('kanban.priority.high') }, '2'),
                    jsx('option', { value: '0', children: t('kanban.priority.normal') }, '0'),
                    jsx('option', { value: '-1', children: t('kanban.priority.low') }, '-1')
                  ]
                }
              )
            ]
          }),
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', disabled: !dialog.title.trim() || dialog.creating, onClick: () => void controller.submitKanbanTask(), children: dialog.creating ? '…' : t('kanban.dialog.create') }),
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.dismissDialog(), children: t('kanban.dialog.cancel') })
            ]
          })
        ]
      })
    ]
  })
}

function SnippetDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'snippet' }> }): any {
  const t = useT()
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [favorite, setFavorite] = useState(false)
  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('snippets.saveDialog') }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('snippets.name') }),
              jsx('input', { value: title, onChange: (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value), autoFocus: true })
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('snippets.tags') }),
              jsx('input', { value: tags, placeholder: t('snippets.tagsPlaceholder'), onChange: (event: ChangeEvent<HTMLInputElement>) => setTags(event.target.value) })
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: `${t('snippets.favorite')}:` }),
              jsx('input', { type: 'checkbox', checked: favorite, onChange: (event: ChangeEvent<HTMLInputElement>) => setFavorite(event.target.checked) })
            ]
          }),
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', disabled: !title.trim(), onClick: () => controller.saveSnippet(title, favorite, tags), children: t('snippets.save') }),
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.dismissDialog(), children: t('ai.preview.cancel') })
            ]
          })
        ]
      })
    ]
  })
}

function SnippetEditDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'snippet-edit' }> }): any {
  const t = useT()
  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('snippets.editDialog') }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('snippets.name') }),
              jsx('input', { value: dialog.title, autoFocus: true, onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateSnippetEdit({ title: event.target.value }) })
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('snippets.tags') }),
              jsx('input', { value: dialog.tags, placeholder: t('snippets.tagsPlaceholder'), onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateSnippetEdit({ tags: event.target.value }) })
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: `${t('snippets.favorite')}:` }),
              jsx('input', { type: 'checkbox', checked: dialog.favorite, onChange: (event: ChangeEvent<HTMLInputElement>) => controller.updateSnippetEdit({ favorite: event.target.checked }) })
            ]
          }),
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', disabled: !dialog.title.trim(), onClick: () => controller.commitSnippetEdit(), children: t('snippets.save') }),
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.deleteSnippetFromEdit(), children: dialog.confirming ? t('snippets.deleteConfirm') : t('snippets.delete') }),
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.dismissDialog(), children: t('ai.preview.cancel') })
            ]
          })
        ]
      })
    ]
  })
}

function AISettingsDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'ai-settings' }> }): any {
  const t = useT()
  const cfg = dialog.config
  const setBase = (patch: Partial<typeof cfg>) => controller.updateAISettings({ config: { ...cfg, ...patch } })
  const setHermes = (patch: Partial<typeof cfg.hermes>) => setBase({ hermes: { ...cfg.hermes, ...patch } })
  const setOllama = (patch: Partial<typeof cfg.ollama>) => setBase({ ollama: { ...cfg.ollama, ...patch } })
  const setOpenAI = (patch: Partial<typeof cfg.openai>) => setBase({ openai: { ...cfg.openai, ...patch } })
  const setActionProvider = (id: string, v: string) =>
    setBase({ actionProviders: { ...cfg.actionProviders, [id]: (v || '') as typeof cfg.provider } })
  const setTemplate = (id: string, v: string) => setBase({ templates: { ...cfg.templates, [id]: v } })
  const resetAction = (id: string) => {
    const providers = { ...cfg.actionProviders }
    const templates = { ...cfg.templates }
    delete providers[id]
    delete templates[id]
    setBase({ actionProviders: providers, templates })
  }

  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('ai.settings.title') }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('ai.settings.provider') }),
              jsx(
                'select',
                {
                  value: cfg.provider,
                  onChange: (event: ChangeEvent<HTMLInputElement>) => setBase({ provider: event.target.value as typeof cfg.provider }),
                  children: [
                    jsx('option', { value: 'hermes', children: t('ai.settings.provider.hermes') }, 'hermes'),
                    jsx('option', { value: 'ollama', children: t('ai.settings.provider.ollama') }, 'ollama'),
                    jsx('option', { value: 'openai', children: t('ai.settings.provider.openai') }, 'openai')
                  ]
                }
              )
            ]
          }),
          jsxs('div', {
            className: 'hsp-formrow',
            children: [
              jsx('label', { children: t('ai.settings.persona') }),
              jsx('textarea', { value: cfg.persona, placeholder: t('ai.settings.personaPlaceholder'), rows: 3, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setBase({ persona: event.target.value }) })
            ]
          }),
          cfg.provider === 'hermes'
            ? [
                jsxs('div', { className: 'hsp-formrow', key: 'hp', children: [
                  jsx('label', { title: t('ai.settings.hermes.profileHint'), children: t('ai.settings.hermes.profile') }),
                  jsx('input', { value: cfg.hermes.profile, list: 'hsp-profile-list', title: t('ai.settings.hermes.profileHint'), onChange: (event: ChangeEvent<HTMLInputElement>) => setHermes({ profile: event.target.value }) }),
                  dialog.profiles && dialog.profiles.length
                    ? jsx('datalist', { id: 'hsp-profile-list', children: dialog.profiles.map(p => jsx('option', { value: p }, p)) })
                    : null
                ] }),
                jsxs('div', { className: 'hsp-formrow', key: 'hm', children: [
                  jsx('label', { children: t('ai.settings.hermes.model') }),
                  jsx('input', { value: cfg.hermes.model, onChange: (event: ChangeEvent<HTMLInputElement>) => setHermes({ model: event.target.value }) })
                ] })
              ]
            : null,
          cfg.provider === 'ollama'
            ? [
                jsxs('div', { className: 'hsp-formrow', key: 'ou', children: [
                  jsx('label', { children: t('ai.settings.ollama.url') }),
                  jsx('input', { value: cfg.ollama.url, onChange: (event: ChangeEvent<HTMLInputElement>) => setOllama({ url: event.target.value }) })
                ] }),
                jsxs('div', { className: 'hsp-formrow', key: 'om', children: [
                  jsx('label', { children: t('ai.settings.ollama.model') }),
                  jsx('input', { value: cfg.ollama.model, onChange: (event: ChangeEvent<HTMLInputElement>) => setOllama({ model: event.target.value }) })
                ] })
              ]
            : null,
          cfg.provider === 'openai'
            ? [
                jsxs('div', { className: 'hsp-formrow', key: 'ob', children: [
                  jsx('label', { children: t('ai.settings.openai.baseUrl') }),
                  jsx('input', { value: cfg.openai.baseUrl, onChange: (event: ChangeEvent<HTMLInputElement>) => setOpenAI({ baseUrl: event.target.value }) })
                ] }),
                jsxs('div', { className: 'hsp-formrow', key: 'ok', children: [
                  jsx('label', { children: t('ai.settings.openai.apiKey') }),
                  jsx('input', { type: 'password', value: cfg.openai.apiKey, onChange: (event: ChangeEvent<HTMLInputElement>) => setOpenAI({ apiKey: event.target.value }) })
                ] }),
                jsxs('div', { className: 'hsp-formrow', key: 'om2', children: [
                  jsx('label', { children: t('ai.settings.openai.model') }),
                  jsx('input', { value: cfg.openai.model, onChange: (event: ChangeEvent<HTMLInputElement>) => setOpenAI({ model: event.target.value }) })
                ] })
              ]
            : null,
          jsx('div', { className: 'hsp-side-title', children: t('ai.settings.actions') }),
          AI_ACTIONS.map(action =>
            jsxs('div', {
              className: 'hsp-formrow hsp-action-row',
              children: [
                jsxs('div', {
                  className: 'hsp-action-head',
                  children: [
                    jsx('span', { className: 'hsp-action-name', children: t(`ai.action.${action.id}`) }),
                    jsx(
                      'select',
                      {
                        className: 'hsp-action-provider',
                        title: t('ai.settings.actionProvider'),
                        value: cfg.actionProviders[action.id] ?? '',
                        onChange: (event: ChangeEvent<HTMLSelectElement>) => setActionProvider(action.id, event.target.value),
                        children: [
                          jsx('option', { value: '', children: t('ai.settings.actionDefault') }, 'default'),
                          jsx('option', { value: 'hermes', children: t('ai.settings.provider.hermes') }, 'hermes'),
                          jsx('option', { value: 'ollama', children: t('ai.settings.provider.ollama') }, 'ollama'),
                          jsx('option', { value: 'openai', children: t('ai.settings.provider.openai') }, 'openai')
                        ]
                      }
                    ),
                    jsx('button', {
                      className: 'hsp-iconbtn',
                      type: 'button',
                      title: t('ai.settings.actionReset'),
                      onClick: () => resetAction(action.id),
                      children: '↺'
                    })
                  ]
                }),
                jsx('textarea', {
                  className: 'hsp-action-template',
                  rows: 2,
                  title: t('ai.settings.template'),
                  placeholder: t('ai.settings.templatePlaceholder'),
                  value: cfg.templates[action.id] ?? '',
                  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setTemplate(action.id, event.target.value)
                })
              ]
            }, action.id)
          ),
          dialog.test
            ? jsx(
                'div',
                { className: 'hsp-ai-test', 'data-ok': dialog.test === 'ok' ? 'true' : 'false', children: dialog.test === 'ok' ? t('ai.settings.testOk') : t('ai.settings.testFail') },
                'testresult'
              )
            : null,
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              jsx('button', { className: 'hsp-btn', type: 'button', disabled: dialog.testing, onClick: () => controller.testAIConnection(), children: dialog.testing ? t('ai.settings.testing') : t('ai.settings.test') }),
              jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', onClick: () => controller.saveAISettings(), children: t('ai.settings.save') }),
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.dismissDialog(), children: t('ai.preview.cancel') })
            ]
          })
        ]
      })
    ]
  })
}

function ConfirmCloseDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'confirm-close' }> }): any {
  const t = useT()
  return jsxs('div', {
    className: 'hsp-dialog-scrim',
    children: [
      jsxs('div', {
        className: 'hsp-dialog',
        children: [
          jsx('h3', { children: t('confirm.closeDirty') }),
          jsxs('div', {
            className: 'hsp-actions',
            children: [
              jsx('button', { className: 'hsp-btn', type: 'button', onClick: () => controller.doClose(dialog.docId), children: t('confirm.closeDirty.close') }),
              jsx('button', { className: 'hsp-btn', 'data-primary': 'true', type: 'button', onClick: () => controller.dismissDialog(), children: t('confirm.closeDirty.keep') })
            ]
          })
        ]
      })
    ]
  })
}

function Dialogs(): any {
  const dialog = useValue(controller.$dialog)
  switch (dialog.kind) {
    case 'ai-preview':
      return jsx(AIPreviewDialog, { dialog })
    case 'kanban':
      return jsx(KanbanDialog, { dialog })
    case 'snippet':
      return jsx(SnippetDialog, { dialog })
    case 'snippet-edit':
      return jsx(SnippetEditDialog, { dialog })
    case 'ai-settings':
      return jsx(AISettingsDialog, { dialog })
    case 'confirm-close':
      return jsx(ConfirmCloseDialog, { dialog })
    default:
      return null
  }
}

function Toast(): any {
  const toast = useValue(controller.$toast)
  if (!toast) return null
  return jsx('div', {
    style: {
      position: 'absolute',
      bottom: '34px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 60,
      background: 'var(--ui-surface, inherit)',
      border: '1px solid var(--ui-stroke-secondary, rgba(127,127,127,.35))',
      borderRadius: '8px',
      padding: '6px 14px',
      fontSize: '12px',
      color: toast.kind === 'error' ? 'var(--ui-danger, #e55)' : 'inherit',
      whiteSpace: 'pre-line'
    },
    children: toast.text
  })
}

export function ScratchpadPage(): any {
  const t = useT()
  const tabs = useValue($openTabs)
  // The editor mounts when the host div first exists (the empty state renders
  // in its place while no tab is open, so the effect must key on the node).
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hostEl) return
    const detach = controller.attachEditor(hostEl)
    return detach
  }, [hostEl])

  return jsxs('div', {
    className: 'hsp-root',
    'data-testid': 'hsp-page',
    children: [
      jsx(Sidebar, {}),
      jsxs('div', {
        className: 'hsp-main',
        children: [
          jsx(TabBar, {}),
          jsxs('div', {
            className: 'hsp-editor-host',
            children: [
              tabs.length
                ? jsx('div', { ref: setHostEl, style: { position: 'absolute', inset: 0 } })
                : jsx('div', { className: 'hsp-empty', children: t('empty.tabs') }),
              jsx(AIPopup, {})
            ]
          }),
          jsx(StatusBar, {}),
          jsx(Dialogs, {}),
          jsx(Toast, {})
        ]
      })
    ]
  })
}
