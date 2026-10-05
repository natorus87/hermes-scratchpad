import { beforeEach, describe, expect, it } from 'vitest'
import {
  $activeId,
  $docs,
  $openTabs,
  $snippets,
  DEFAULT_STATE,
  closeTab,
  fileDocId,
  hydrate,
  newScratchId,
  openTab,
  upsertSnippet
} from '../src/documents/store'

function reset(): void {
  hydrate({ ...DEFAULT_STATE, scratches: [], contents: {}, openTabs: [], activeId: null })
}

function scratch(id: string, name: string) {
  return { kind: 'scratch' as const, id, name, language: 'plain' as const, createdAt: 0, updatedAt: 0 }
}

describe('document store', () => {
  beforeEach(reset)

  it('openTab adds and activates', () => {
    openTab('a', scratch('a', 'A'))
    expect($openTabs.get()).toEqual(['a'])
    expect($activeId.get()).toBe('a')
  })

  it('closeTab activates a neighbour', () => {
    openTab('a', scratch('a', 'A'))
    openTab('b', scratch('b', 'B'))
    openTab('c', scratch('c', 'C'))
    $activeId.set('b')
    closeTab('b')
    expect($openTabs.get()).toEqual(['a', 'c'])
    expect(['a', 'c']).toContain($activeId.get())
  })

  it('file doc ids are path-prefixed', () => {
    expect(fileDocId('/tmp/x.md')).toBe('file:/tmp/x.md')
  })

  it('hydrate restores file docs from open tab ids', () => {
    hydrate({ ...DEFAULT_STATE, openTabs: ['file:/tmp/x.md'], activeId: 'file:/tmp/x.md' })
    const doc = $docs.get()['file:/tmp/x.md']
    expect(doc?.name).toBe('x.md')
    expect(doc?.kind).toBe('file')
  })

  it('hydrate prefers the persisted language override for file docs', () => {
    hydrate({
      ...DEFAULT_STATE,
      openTabs: ['file:/tmp/x.md', 'file:/tmp/y.md'],
      fileLanguages: { '/tmp/x.md': 'python' }
    })
    expect($docs.get()['file:/tmp/x.md']?.language).toBe('python')
    // No override → filename-derived language.
    expect($docs.get()['file:/tmp/y.md']?.language).toBe('markdown')
  })

  it('upsertSnippet replaces by id and keeps order', () => {
    upsertSnippet({ id: 's1', title: 'one', language: 'plain', content: '', tags: [], createdAt: 1, updatedAt: 1, favorite: false })
    upsertSnippet({ id: 's2', title: 'two', language: 'plain', content: '', tags: [], createdAt: 2, updatedAt: 2, favorite: false })
    upsertSnippet({ id: 's1', title: 'one-edit', language: 'plain', content: 'x', tags: [], createdAt: 1, updatedAt: 3, favorite: true })
    const all = $snippets.get()
    // newest snippet first; an updated snippet keeps its slot
    expect(all.map(s => s.id)).toEqual(['s2', 's1'])
    expect(all[1].favorite).toBe(true)
  })

  it('newScratchId is unique', () => {
    expect(newScratchId()).not.toBe(newScratchId())
  })
})
