/**
 * OllamaAIProvider — talks to a local Ollama daemon (default
 * http://127.0.0.1:11434) through the backend proxy. Non-streaming /api/chat;
 * the persona rides as the system message.
 */
import type { AIProvider, AIRequest, AIResult } from '../provider'
import { proxyFetch } from '../proxyFetch'

export interface OllamaConfig {
  url: string
  model: string
}

export function createOllamaProvider(cfg: OllamaConfig): AIProvider {
  const base = cfg.url.replace(/\/+$/, '')
  return {
    name: 'ollama',

    async isAvailable(): Promise<boolean> {
      try {
        const res = await proxyFetch(`${base}/api/tags`, { method: 'GET', timeoutMs: 5000 })
        return res.status === 200
      } catch {
        return false
      }
    },

    async complete(request: AIRequest): Promise<AIResult> {
      const messages: Array<{ role: string; content: string }> = []
      if (request.instruction) messages.push({ role: 'system', content: request.instruction })
      messages.push({ role: 'user', content: request.prompt })
      const res = await proxyFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages, stream: false }),
        timeoutMs: request.timeoutMs
      })
      if (res.status !== 200) throw new Error(`ollama HTTP ${res.status}`)
      let data: { message?: { content?: unknown } }
      try {
        data = JSON.parse(res.text)
      } catch {
        throw new Error('ollama: invalid JSON response')
      }
      const content = data.message?.content
      if (typeof content !== 'string') throw new Error('ollama: unexpected response shape')
      return { text: content }
    }
  }
}
