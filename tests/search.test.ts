import { describe, expect, it } from 'vitest'
import { candidateFilePaths, filterScratches, filterSnippets, matchesQuery, parseTags, scratchEntry } from '../src/documents/search'
import type { Snippet } from '../src/documents/store'

const snippet = (over: Partial<Snippet>): Snippet => ({
  id: 's1',
  title: 'Docker cleanup',
  language: 'shell',
  content: 'docker system prune -af',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  favorite: false,
  ...over
})

describe('parseTags', () => {
  it('splits on commas and semicolons and trims', () => {
    expect(parseTags('docker, ops;; git ')).toEqual(['docker', 'ops', 'git'])
  })

  it('dedupes case-sensitively but drops empties', () => {
    expect(parseTags('a, a,, b')).toEqual(['a', 'b'])
    expect(parseTags('   ')).toEqual([])
  })
})

describe('candidateFilePaths', () => {
  it('puts open file docs first, then recents, deduped', () => {
    expect(candidateFilePaths(['/b.md', '/a.py'], ['/a.py', '/c.txt'])).toEqual(['/b.md', '/a.py', '/c.txt'])
  })

  it('handles empty inputs', () => {
    expect(candidateFilePaths([], [])).toEqual([])
    expect(candidateFilePaths(['/only.md'], [])).toEqual(['/only.md'])
  })
})

describe('matchesQuery', () => {
  it('matches everything on an empty query', () => {
    expect(matchesQuery('', 'anything')).toBe(true)
    expect(matchesQuery('   ', 'anything')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesQuery('TODO', 'read the ToDO list')).toBe(true)
    expect(matchesQuery('todo', 'NOTE')).toBe(false)
  })

  it('matches if any field matches', () => {
    expect(matchesQuery('ping', 'name only', 'has a ping inside')).toBe(true)
  })
})

describe('filterScratches', () => {
  const entries = [
    scratchEntry(
      { kind: 'scratch', id: 'a', name: 'LiteLLM Notiz', language: 'plain', createdAt: 0, updatedAt: 0 },
      'Gateway HTTP 429 Probleme'
    ),
    scratchEntry(
      { kind: 'scratch', id: 'b', name: 'Unbenannt 2', language: 'plain', createdAt: 0, updatedAt: 0 },
      'docker compose logs -f'
    )
  ]

  it('matches by name', () => {
    expect(filterScratches(entries, 'litellm').map(e => e.id)).toEqual(['a'])
  })

  it('matches by content, not just name', () => {
    expect(filterScratches(entries, '429').map(e => e.id)).toEqual(['a'])
    expect(filterScratches(entries, 'docker').map(e => e.id)).toEqual(['b'])
  })

  it('returns everything unfiltered on an empty query', () => {
    expect(filterScratches(entries, '')).toHaveLength(2)
  })

  it('returns nothing when nothing matches', () => {
    expect(filterScratches(entries, 'zzz')).toEqual([])
  })
})

describe('filterSnippets', () => {
  const snippets = [
    snippet({ id: 'a', title: 'Docker cleanup', tags: ['docker', 'ops'] }),
    snippet({ id: 'b', title: 'git undo', content: 'git reset --soft HEAD~1', tags: [] })
  ]

  it('matches by tag', () => {
    expect(filterSnippets(snippets, 'ops').map(s => s.id)).toEqual(['a'])
  })

  it('matches by content', () => {
    expect(filterSnippets(snippets, 'soft').map(s => s.id)).toEqual(['b'])
  })

  it('matches by title', () => {
    expect(filterSnippets(snippets, 'undo').map(s => s.id)).toEqual(['b'])
  })
})
