/**
 * HermesAIProvider — talks to the Hermes gateway through supported SDK doors
 * only: `host.request('session.create' | 'prompt.submit')` and
 * `host.onEvent('message.delta' | 'message.complete')`. One hidden,
 * plugin-owned session is created lazily and reused for every action so the
 * user's own chats are never touched and the session history stays inspectable.
 * The session is tagged with `source: 'hermes-scratchpad'` and can target a
 * dedicated agent profile / model (AI settings); a persona preamble is
 * prepended to every prompt.
 */
import { host, type GatewayEvent } from '@hermes/plugin-sdk'
import { $aiConfig } from '../config'
import type { AIProvider, AIRequest, AIResult } from '../provider'

const SESSION_TITLE = 'Hermes Scratchpad'
const DEFAULT_TIMEOUT_MS = 180_000

interface SessionCreateResult {
  session_id: string
  stored_session_id: string
}

interface HermesMessageEvent {
  type: string
  session_id?: string
  payload?: {
    text?: string | unknown
    status?: string | null | undefined
    error?: string | null | undefined
    [key: string]: unknown
  }
}

let cachedRuntimeId: string | null = null
let creating: Promise<string> | null = null

/** Drop the cached hidden session — called when the AI session config
 *  (profile/model) changes, so the next request recreates it. */
export function resetHermesSession(): void {
  cachedRuntimeId = null
  creating = null
}

/** Prompt composition — exported for unit tests. */
export function composePrompt(instruction: string | undefined, prompt: string): string {
  const preamble = instruction?.trim()
  return preamble ? `${preamble}\n\n${prompt}` : prompt
}

async function ensureSession(): Promise<string> {
  if (cachedRuntimeId) return cachedRuntimeId
  if (creating) return creating

  creating = (async () => {
    const ai = $aiConfig.get()
    const params: Record<string, unknown> = {
      title: SESSION_TITLE,
      hidden: true,
      source: 'hermes-scratchpad',
      idempotency_key: `hermes-scratchpad-${Date.now()}`
    }
    const profile = ai.hermes.profile.trim()
    const model = ai.hermes.model.trim()
    if (profile) params.profile = profile
    if (model) params.model = model
    const res = await host.request<SessionCreateResult>('session.create', params)
    cachedRuntimeId = res.session_id
    return res.session_id
  })()

  try {
    return await creating
  } finally {
    creating = null
  }
}

export const HermesAIProvider: AIProvider = {
  name: 'hermes',

  async isAvailable(): Promise<boolean> {
    return host.state.gateway.get() === 'open'
  },

  async complete(request: AIRequest): Promise<AIResult> {
    const sessionId = await ensureSession()
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise<AIResult>((resolve, reject) => {
      let text = ''
      let settled = false

      const finish = (error: Error | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        offDelta()
        offComplete()
        if (error) reject(error)
        else resolve({ text })
      }

      const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs)

      const matches = (event: HermesMessageEvent) => event.session_id === sessionId

      const offDelta = host.onEvent('message.delta', (event: GatewayEvent) => {
        if (!matches(event as HermesMessageEvent)) return
        const t = (event.payload as HermesMessageEvent['payload'])?.text
        if (typeof t === 'string') text += t
      })

      const offComplete = host.onEvent('message.complete', (event: GatewayEvent) => {
        if (!matches(event as HermesMessageEvent)) return
        const payload = (event.payload as HermesMessageEvent['payload']) ?? {}
        // message.complete carries the full turn text; prefer it over the
        // accumulated deltas (a resumed/steered turn may have missed deltas).
        if (typeof payload.text === 'string' && payload.text.length >= text.length) {
          text = payload.text
        }
        if (payload.status === 'error') {
          finish(new Error(payload.error || 'turn failed'))
          return
        }
        finish(null)
      })

      host
        .request<{ status?: string }>('prompt.submit', {
          session_id: sessionId,
          text: composePrompt(request.instruction, request.prompt)
        })
        .catch(error => finish(error instanceof Error ? error : new Error(String(error))))
    })
  }
}
