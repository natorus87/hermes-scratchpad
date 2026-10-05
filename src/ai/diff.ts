/** Minimal line-based diff (LCS) for the AI preview pane. */
export type DiffKind = 'same' | 'add' | 'del'
export interface DiffSeg {
  text: string
  changed: boolean
}
export interface DiffLine {
  kind: DiffKind
  text: string
  /** Word-level segments — only set on adjacent del/add line pairs. */
  segs?: DiffSeg[]
}

export function diffLines(original: string, result: string): DiffLine[] {
  const a = original.split('\n')
  const b = result.split('\n')
  const n = a.length
  const m = b.length

  // LCS table (capped so huge documents cannot blow memory — beyond the cap
  // the panes simply render without per-line marks).
  if (n * m > 4_000_000) {
    return [
      ...a.map(text => ({ kind: 'same' as DiffKind, text })),
      ...b.map(text => ({ kind: 'add' as DiffKind, text }))
    ]
  }

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'del', text: a[i] })
      i++
    } else {
      out.push({ kind: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] })
  while (j < m) out.push({ kind: 'add', text: b[j++] })

  // Word-level polish: pair up adjacent del/add lines and mark the surviving
  // words inside them, so small edits don't read as whole-line rewrites.
  for (let k = 0; k < out.length - 1; k++) {
    if (out[k].kind === 'del' && out[k + 1].kind === 'add') {
      const segs = wordSegs(out[k].text, out[k + 1].text)
      if (segs) {
        out[k].segs = segs.del
        out[k + 1].segs = segs.add
      }
    }
  }
  return out
}

/** Split into tokens, keeping whitespace tokens so segments rejoin losslessly. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(part => part !== '')
}

/** Word-level LCS between one del line and one add line. Returns null when
 *  either side is empty or the token matrix would be too large. */
function wordSegs(
  a: string,
  b: string
): { del: DiffSeg[]; add: DiffSeg[] } | null {
  if (!a.trim() || !b.trim()) return null
  const x = tokenize(a)
  const y = tokenize(b)
  if (x.length * y.length > 250_000) return null

  const lcs: number[][] = Array.from({ length: x.length + 1 }, () =>
    new Array<number>(y.length + 1).fill(0)
  )
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const changedSeg = (tokens: string[], start: number, end: number): DiffSeg => ({
    text: tokens.slice(start, end).join(''),
    changed: true
  })

  const delSegs: DiffSeg[] = []
  const addSegs: DiffSeg[] = []
  let p = 0
  let q = 0
  let runX = -1
  let runY = -1
  const flushX = () => {
    if (runX >= 0) {
      delSegs.push(changedSeg(x, runX, p))
      runX = -1
    }
  }
  const flushY = () => {
    if (runY >= 0) {
      addSegs.push(changedSeg(y, runY, q))
      runY = -1
    }
  }
  while (p < x.length && q < y.length) {
    if (x[p] === y[q] && lcs[p][q] === lcs[p + 1][q + 1] + 1) {
      flushX()
      flushY()
      delSegs.push({ text: x[p], changed: false })
      addSegs.push({ text: y[q], changed: false })
      p++
      q++
    } else if (lcs[p + 1][q] >= lcs[p][q + 1]) {
      if (runX < 0) runX = p
      p++
    } else {
      if (runY < 0) runY = q
      q++
    }
  }
  flushX()
  flushY()
  while (p < x.length) {
    if (runX < 0) runX = p
    p++
    flushX()
  }
  while (q < y.length) {
    if (runY < 0) runY = q
    q++
    flushY()
  }
  return { del: delSegs, add: addSegs }
}

/** Original side: only same + del lines (what will be removed). */
export function originalLines(diff: DiffLine[]): DiffLine[] {
  return diff.filter(l => l.kind !== 'add')
}

/** Result side: same + add lines (what will be inserted). */
export function resultLines(diff: DiffLine[]): DiffLine[] {
  return diff.filter(l => l.kind !== 'del')
}
