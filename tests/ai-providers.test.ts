import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_AI_CONFIG, mergeAIConfig, setAIConfig, $aiConfig, type AIConfig } from '../src/ai/config'
import { initAIProxy, proxyFetch } from '../src/ai/proxyFetch'
import { providerFor, providerForAction } from '../src/ai/registry'
import { composePrompt } from '../src/ai/providers/hermes'
import { buildActionPrompt } from '../src/ai/actions'
import { hydrate } from '../src/documents/store'
import type { AIActionContext } from '../src/ai/actions'
import type { PluginContext } from '@hermes/plugin-sdk'

interface CapturedRequest {
  path: string
  opts: { method?: string; body?: unknown }
}

function fakeCtx(handler: (path: string, opts: CapturedRequest['opts']) => unknown): { ctx: PluginContext; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = []
  const ctx = {
    rest: async (path: string, opts: CapturedRequest['opts'] = {}) => {
      calls.push({ path, opts })
      return handler(path, opts)
    }
  } as unknown as PluginContext
  return { ctx, calls }
}

const cfg = (over: Partial<AIConfig>): AIConfig => mergeAIConfig(over)

describe('mergeAIConfig', () => {
  it('returns defaults for empty input', () => {
    expect(mergeAIConfig(null)).toEqual(DEFAULT_AI_CONFIG)
    expect(mergeAIConfig(undefined)).toEqual(DEFAULT_AI_CONFIG)
  })

  it('merges partial sub-objects over defaults', () => {
    const merged = mergeAIConfig({ provider: 'ollama', ollama: { url: 'http://x:1', model: 'm' } })
    expect(merged.provider).toBe('ollama')
    expect(merged.ollama.url).toBe('http://x:1')
    expect(merged.ollama.model).toBe('m')
    expect(merged.openai).toEqual(DEFAULT_AI_CONFIG.openai)
  })
})

describe('registry', () => {
  it('selects the provider by config', () => {
    expect(providerFor(cfg({ provider: 'hermes' })).name).toBe('hermes')
    expect(providerFor(cfg({ provider: 'ollama' })).name).toBe('ollama')
    expect(providerFor(cfg({ provider: 'openai' })).name).toBe('openai')
  })

  it('per-action override wins over the global provider', () => {
    const config = cfg({ provider: 'hermes', actionProviders: { improve: 'openai' } })
    expect(providerForAction(config, 'improve').name).toBe('openai')
    expect(providerForAction(config, 'shorten').name).toBe('hermes')
    // '' counts as "no override".
    expect(providerForAction(cfg({ provider: 'hermes', actionProviders: { improve: '' } }), 'improve').name).toBe('hermes')
  })
})

describe('buildActionPrompt templates', () => {
  const action = { id: 'improve', labelKey: 'x', kind: 'transform' as const, buildPrompt: (ctx: AIActionContext) => `DEFAULT ${ctx.documentText}` }
  const ctx: AIActionContext = { scope: 'document', selectedText: '', documentText: 'BODY', language: 'markdown', question: undefined }

  it('falls back to the built-in prompt without/with blank template', () => {
    expect(buildActionPrompt(action, ctx)).toBe('DEFAULT BODY')
    expect(buildActionPrompt(action, ctx, '   ')).toBe('DEFAULT BODY')
  })

  it('substitutes text, language and question placeholders', () => {
    const out = buildActionPrompt(action, ctx, 'Lang={{language}} Q={{question}} Text={{text}}')
    expect(out).toBe('Lang=markdown Q= Text=BODY')
    const askCtx = { ...ctx, question: 'Warum?' }
    expect(buildActionPrompt(action, askCtx, '{{question}}: {{text}}')).toBe('Warum?: BODY')
  })

  it('replaces every occurrence', () => {
    expect(buildActionPrompt(action, ctx, '{{text}} / {{text}}')).toBe('BODY / BODY')
  })
})

describe('proxyFetch', () => {
  beforeEach(() => {
    setAIConfig(DEFAULT_AI_CONFIG)
  })

  it('posts to the backend route and returns status/text', async () => {
    const { ctx, calls } = fakeCtx(() => ({ ok: true, status: 200, body: 'hello' }))
    initAIProxy(ctx)
    const res = await proxyFetch('http://x/api', { method: 'POST', body: '{"a":1}', headers: { Authorization: 'Bearer k' } })
    expect(res).toEqual({ status: 200, text: 'hello' })
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/ai/proxy')
    const body = calls[0].opts.body as Record<string, unknown>
    expect(body.url).toBe('http://x/api')
    expect(body.headers).toEqual({ Authorization: 'Bearer k' })
  })

  it('throws when the route reports a failure', async () => {
    const { ctx } = fakeCtx(() => ({ ok: false, error: 'request failed' }))
    initAIProxy(ctx)
    await expect(proxyFetch('http://x/api')).rejects.toThrow('request failed')
  })
})

describe('ollama provider', () => {
  beforeEach(() => {
    setAIConfig(DEFAULT_AI_CONFIG)
  })

  it('completes via /api/chat with a system message for the instruction', async () => {
    const { ctx, calls } = fakeCtx(() => ({ ok: true, status: 200, body: JSON.stringify({ message: { content: 'antwort' } }) }))
    initAIProxy(ctx)
    const provider = providerFor(cfg({ provider: 'ollama', ollama: { url: 'http://127.0.0.1:11434/', model: 'llama3.2' } }))
    const res = await provider.complete({ prompt: 'do it', instruction: 'Be terse.' })
    expect(res.text).toBe('antwort')
    const body = calls[0].opts.body as Record<string, unknown>
    expect(calls[0].path).toBe('/ai/proxy')
    expect(body.url).toBe('http://127.0.0.1:11434/api/chat')
    const payload = JSON.parse(body.body as string)
    expect(payload.model).toBe('llama3.2')
    expect(payload.stream).toBe(false)
    expect(payload.messages).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'do it' }
    ])
  })

  it('throws on HTTP error statuses', async () => {
    const { ctx } = fakeCtx(() => ({ ok: true, status: 500, body: 'boom' }))
    initAIProxy(ctx)
    const provider = providerFor(cfg({ provider: 'ollama' }))
    await expect(provider.complete({ prompt: 'x' })).rejects.toThrow('ollama HTTP 500')
  })

  it('probes availability via /api/tags', async () => {
    const up = fakeCtx(() => ({ ok: true, status: 200, body: '[]' }))
    initAIProxy(up.ctx)
    await expect(providerFor(cfg({ provider: 'ollama' })).isAvailable()).resolves.toBe(true)

    const down = fakeCtx(() => ({ ok: true, status: 404, body: '' }))
    initAIProxy(down.ctx)
    await expect(providerFor(cfg({ provider: 'ollama' })).isAvailable()).resolves.toBe(false)
  })
})

describe('openai-compatible provider', () => {
  beforeEach(() => {
    setAIConfig(DEFAULT_AI_CONFIG)
  })

  it('completes via /chat/completions with bearer auth', async () => {
    const { ctx, calls } = fakeCtx(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: 'ergebnis' } }] })
    }))
    initAIProxy(ctx)
    const provider = providerFor(cfg({ provider: 'openai', openai: { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'm1' } }))
    const res = await provider.complete({ prompt: 'do it', instruction: 'Be terse.' })
    expect(res.text).toBe('ergebnis')
    const body = calls[0].opts.body as Record<string, unknown>
    expect(body.url).toBe('https://api.example.com/v1/chat/completions')
    expect((body.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const payload = JSON.parse(body.body as string)
    expect(payload.model).toBe('m1')
    expect(payload.messages).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'do it' }
    ])
  })

  it('omits the Authorization header without an API key', async () => {
    const { ctx, calls } = fakeCtx(() => ({ ok: true, status: 200, body: '{"choices":[{"message":{"content":"x"}}]}' }))
    initAIProxy(ctx)
    const provider = providerFor(cfg({ provider: 'openai', openai: { baseUrl: 'https://api.example.com/v1', apiKey: '', model: 'm1' } }))
    await provider.complete({ prompt: 'x' })
    const body = calls[0].opts.body as Record<string, unknown>
    expect((body.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('throws on HTTP error statuses', async () => {
    const { ctx } = fakeCtx(() => ({ ok: true, status: 401, body: 'unauthorized' }))
    initAIProxy(ctx)
    const provider = providerFor(cfg({ provider: 'openai' }))
    await expect(provider.complete({ prompt: 'x' })).rejects.toThrow('openai-compatible HTTP 401')
  })
})

describe('hermes persona composition', () => {
  it('prepends the persona instruction to the prompt', () => {
    expect(composePrompt(undefined, 'p')).toBe('p')
    expect(composePrompt('  ', 'p')).toBe('p')
    expect(composePrompt('Be terse.', 'p')).toBe('Be terse.\n\np')
  })
})

describe('store hydrate applies persisted AI config', () => {
  it('restores provider + persona and merges over defaults', () => {
    hydrate({
      ...{ scratches: [], contents: {}, openTabs: [], activeId: null, cursorLines: {}, recentFiles: [] },
      settings: {
        language: 'system',
        wordWrap: false,
        ai: { provider: 'openai', persona: 'Ton: sachlich.', openai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' } }
      }
    } as never)
    const ai = $aiConfig.get()
    expect(ai.provider).toBe('openai')
    expect(ai.persona).toBe('Ton: sachlich.')
    expect(ai.openai.model).toBe('m')
    expect(ai.ollama.url).toBe(DEFAULT_AI_CONFIG.ollama.url)
    setAIConfig(DEFAULT_AI_CONFIG)
  })
})
