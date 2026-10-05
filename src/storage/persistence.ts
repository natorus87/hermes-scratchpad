/**
 * Persistence layer over ctx.storage with debounced writes for frequently
 * changing state (scratchpad content). Everything the plugin persists lives
 * under one snapshot key set; secrets are never stored here.
 */
import type { PluginContext } from '@hermes/plugin-sdk'
import type { PersistedState } from '../documents/store'
import { DEFAULT_STATE } from '../documents/store'

const STATE_KEY = 'state'

let ctxRef: PluginContext | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedState | null = null

const FLUSH_MS = 500

export function initStorage(ctx: PluginContext): PersistedState {
  ctxRef = ctx
  const saved = ctx.storage.get<PersistedState | null>(STATE_KEY, null)
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_STATE }
  return {
    ...DEFAULT_STATE,
    ...saved,
    // Pre-v0.2 snapshots have no fileLanguages — never leak undefined in.
    fileLanguages: saved.fileLanguages ?? {},
    settings: { ...DEFAULT_STATE.settings, ...(saved.settings ?? {}) }
  }
}

/** Schedule a debounced persist of the full snapshot. */
export function persistSoon(state: PersistedState): void {
  pending = state
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_MS)
}

/** Immediate persist (used for settings and on pagehide). */
export function persistNow(state: PersistedState): void {
  pending = state
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flush()
}

function flush(): void {
  if (!ctxRef || !pending) return
  try {
    ctxRef.storage.set(STATE_KEY, pending)
  } catch {
    // Persistence must never take the editor down; the in-memory state stays.
  }
  pending = null
}
