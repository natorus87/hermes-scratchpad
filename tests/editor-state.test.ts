// The tab-switch persistence mechanism: serialize a state (selection + undo
// history) via historyField, rebuild it, and confirm undo still works — the
// same roundtrip ScratchpadController.swapDoc performs on every switch.
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { history, historyField, undo } from '@codemirror/commands'

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [history()] })
}

describe('per-doc editor state serialization', () => {
  it('undo history survives a toJSON/fromJSON roundtrip', () => {
    const state = makeState('hello')
    const changes = state.update({ changes: { from: 5, insert: ' world' } }).state
    expect(changes.doc.toString()).toBe('hello world')

    const json = changes.toJSON({ history: historyField })
    const restored = EditorState.fromJSON(json, { extensions: [history()] }, { history: historyField })

    expect(restored.doc.toString()).toBe('hello world')
    let after = ''
    const undone = undo({ state: restored, dispatch: tr => { after = tr.state.doc.toString() } })
    expect(undone).toBe(true)
    expect(after).toBe('hello')
  })

  it('a fresh state without history cannot undo', () => {
    const state = makeState('hello world')
    expect(undo({ state, dispatch: () => undefined })).toBe(false)
  })

  it('selection survives the roundtrip', () => {
    const state = makeState('hello world')
    const moved = state.update({ selection: { anchor: 6, head: 11 } }).state
    const json = moved.toJSON({ history: historyField })
    const restored = EditorState.fromJSON(json, { extensions: [history()] }, { history: historyField })
    expect(restored.selection.main.from).toBe(6)
    expect(restored.selection.main.to).toBe(11)
  })

  it('undo history survives a JSON stringify/parse roundtrip (persistence)', () => {
    const state = makeState('hello')
    const changes = state.update({ changes: { from: 5, insert: ' world' } }).state
    // PersistedState.docStates goes through JSON storage — simulate it.
    const stored = JSON.parse(JSON.stringify(changes.toJSON({ history: historyField })))
    const restored = EditorState.fromJSON(stored, { extensions: [history()] }, { history: historyField })
    let after = ''
    const undone = undo({ state: restored, dispatch: tr => { after = tr.state.doc.toString() } })
    expect(undone).toBe(true)
    expect(after).toBe('hello')
  })

  it('a mismatching doc text is detectable (restore-side validation guard)', () => {
    const state = makeState('hello')
    const changes = state.update({ changes: { from: 5, insert: ' world' } }).state
    const json = changes.toJSON({ history: historyField })
    expect(json.doc).toBe('hello world')
    // restoreStateFor() discards entries whose rebuilt doc differs from the
    // incoming text — this assertion pins the field the check relies on.
    expect(json.doc).not.toBe('stale')
  })
})
