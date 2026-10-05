import { describe, expect, it } from 'vitest'
import { diffLines, originalLines, resultLines } from '../src/ai/diff'

describe('diffLines', () => {
  it('marks identical text as same', () => {
    const diff = diffLines('a\nb\nc', 'a\nb\nc')
    expect(diff.every(l => l.kind === 'same')).toBe(true)
  })

  it('marks replaced lines as del + add', () => {
    const diff = diffLines('hello\nworld', 'hello\nthere')
    const kinds = diff.map(l => l.kind)
    expect(kinds).toEqual(['same', 'del', 'add'])
  })

  it('handles pure insertion', () => {
    const diff = diffLines('a\nc', 'a\nb\nc')
    expect(diff.map(l => l.kind)).toEqual(['same', 'add', 'same'])
  })

  it('handles pure deletion', () => {
    const diff = diffLines('a\nb\nc', 'a\nc')
    expect(diff.map(l => l.kind)).toEqual(['same', 'del', 'same'])
  })

  it('panes exclude each other kinds', () => {
    const diff = diffLines('a\nb', 'a\nc')
    expect(originalLines(diff).map(l => l.text)).toEqual(['a', 'b'])
    expect(resultLines(diff).map(l => l.text)).toEqual(['a', 'c'])
  })
})

describe('word-level segments', () => {
  it('marks only the changed word inside a del/add pair', () => {
    const diff = diffLines('deploy to staging', 'deploy to production')
    const del = diff.find(l => l.kind === 'del')
    const add = diff.find(l => l.kind === 'add')
    expect(del?.segs).toEqual([
      { text: 'deploy', changed: false },
      { text: ' ', changed: false },
      { text: 'to', changed: false },
      { text: ' ', changed: false },
      { text: 'staging', changed: true }
    ])
    expect(add?.segs?.filter(s => s.changed).map(s => s.text)).toEqual(['production'])
  })

  it('segments rejoin to the original line text', () => {
    const original = 'const value = compute(alpha, 42)'
    const result = 'const value = compute(beta, 42)'
    const diff = diffLines(original, result)
    const del = diff.find(l => l.kind === 'del')
    const add = diff.find(l => l.kind === 'add')
    expect(del?.segs?.map(s => s.text).join('')).toBe(original)
    expect(add?.segs?.map(s => s.text).join('')).toBe(result)
  })

  it('leaves unpaired lines without segments', () => {
    const diff = diffLines('alpha', 'beta')
    // one del/add pair → segments exist; a pure insertion line has none
    const ins = diffLines('a', 'a\nb').find(l => l.kind === 'add')
    expect(ins?.segs).toBeUndefined()
  })

  it('skips segments when one side is empty', () => {
    const diff = diffLines('', 'text')
    expect(diff.every(l => l.segs === undefined)).toBe(true)
  })
})
