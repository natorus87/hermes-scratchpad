/**
 * Sidebar search: pure, UI-independent filtering so the behavior is unit
 * testable. Matching is case-insensitive substring — name OR content for
 * scratchpads, title/tags/content for snippets.
 */
import type { ScratchDoc, Snippet } from './store'

function normalize(text: string): string {
  return text.toLowerCase()
}

export function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = normalize(query.trim())
  if (!q) return true
  return fields.some(field => normalize(field).includes(q))
}

export interface ScratchSearchEntry {
  id: string
  name: string
  content: string
}

/** Filter scratchpad entries (any doc shape with id/name + a content field). */
export function filterScratches<T extends ScratchSearchEntry>(
  entries: T[],
  query: string
): T[] {
  return entries.filter(entry => matchesQuery(query, entry.name, entry.content))
}

/** Filter snippets by title, tags and content. */
export function filterSnippets(snippets: readonly Snippet[], query: string): Snippet[] {
  return snippets.filter(s => matchesQuery(query, s.title, ...s.tags, s.content))
}

export function scratchEntry(doc: ScratchDoc, content: string): ScratchSearchEntry {
  return { id: doc.id, name: doc.name, content }
}

/** Parse a user-typed tag string ("a, b;;c" → ['a', 'b', 'c']) — dedupes,
 *  trims, drops empties. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,;]+/)) {
    const tag = part.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/** File paths to consider during search: open file docs first, then recents
 *  (deduped, order preserved). */
export function candidateFilePaths(
  openFilePaths: readonly string[],
  recentPaths: readonly string[]
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of [...openFilePaths, ...recentPaths]) {
    if (!seen.has(path)) {
      seen.add(path)
      out.push(path)
    }
  }
  return out
}
