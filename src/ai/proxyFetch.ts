/**
 * proxyFetch — outbound HTTP for alternate AI providers. The desktop page
 * runs on an opaque origin (sandboxed iframe), so Ollama / OpenAI-compatible
 * endpoints cannot be fetched from the renderer directly (CORS). Requests go
 * through the plugin's own backend route (/ai/proxy), which is size- and
 * timeout-capped. Unit tests inject a fake PluginContext via initAIProxy.
 */
import type { PluginContext } from '@hermes/plugin-sdk'

let ctxRef: PluginContext | null = null

export function initAIProxy(ctx: PluginContext): void {
  ctxRef = ctx
}

export interface ProxyFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface ProxyResponse {
  status: number
  text: string
}

interface ProxyRouteResult {
  ok: boolean
  status?: number
  body?: string
  error?: string
}

export async function proxyFetch(url: string, opts: ProxyFetchOptions = {}): Promise<ProxyResponse> {
  if (!ctxRef) throw new Error('AIProxy not initialized')
  const timeoutMs = opts.timeoutMs ?? 120_000
  const res = await ctxRef.rest<ProxyRouteResult>('/ai/proxy', {
    method: 'POST',
    body: {
      url,
      method: opts.method ?? 'GET',
      headers: opts.headers ?? {},
      body: opts.body ?? null,
      timeout_ms: timeoutMs
    },
    // The route itself answers (never hangs), but leave headroom over the
    // upstream timeout so the route's own error, not a rest timeout, wins.
    timeoutMs: timeoutMs + 15_000
  })
  if (!res.ok) throw new Error(res.error || 'proxy request failed')
  return { status: res.status ?? 0, text: res.body ?? '' }
}
