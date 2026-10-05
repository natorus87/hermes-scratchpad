/**
 * OpenAICompatAIProvider — any OpenAI-compatible HTTP API (OpenAI itself, LM
 * Studio, vLLM, LiteLLM proxies, …) through the backend proxy. Non-streaming
 * /chat/completions; the persona rides as the system message.
 */
import type { AIProvider, AIRequest, AIResult } from '../provider'
import { proxyFetch } from '../proxyFetch'

export interface OpenAIConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export function createOpenAIProvider(cfg: OpenAIConfig): AIProvider {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

  return {
    name: 'openai',

    async isAvailable(): Promise<boolean> {
      try {
        const res = await proxyFetch(`${base}/models`, { method: 'GET', headers, timeoutMs: 8000 })
        return res.status === 200
      } catch {
        return false
      }
    },

    async complete(request: AIRequest): Promise<AIResult> {
      const messages: Array<{ role: string; content: string }> = []
      if (request.instruction) messages.push({ role: 'system', content: request.instruction })
      messages.push({ role: 'user', content: request.prompt })
      const res = await proxyFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: cfg.model, messages, stream: false }),
        timeoutMs: request.timeoutMs
      })
      if (res.status !== 200) throw new Error(`openai-compatible HTTP ${res.status}`)
      let data: { choices?: Array<{ message?: { content?: unknown } }> }
      try {
        data = JSON.parse(res.text)
      } catch {
        throw new Error('openai-compatible: invalid JSON response')
      }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('openai-compatible: unexpected response shape')
      return { text: content }
    }
  }
}
