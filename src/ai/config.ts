/**
 * AI provider configuration — which backend answers the ⌘K actions, plus an
 * optional persona preamble. Persisted inside PersistedState.settings.ai;
 * the UI only talks to the controller, never to the providers directly.
 */
import { atom } from 'nanostores'

export type AIProviderId = 'hermes' | 'ollama' | 'openai'

export interface AIConfig {
  provider: AIProviderId
  /** Optional instruction prepended to every AI request (persona). */
  persona: string
  /** Hermes gateway session tuning; '' = app defaults. */
  hermes: { profile: string; model: string }
  ollama: { url: string; model: string }
  /** Any OpenAI-compatible HTTP API (OpenAI, LM Studio, vLLM, …). */
  openai: { baseUrl: string; apiKey: string; model: string }
  /** Per-action provider override (key = AIAction id); '' = global provider. */
  actionProviders: Record<string, AIProviderId | ''>
  /** Per-action custom prompt template; ''/missing = built-in prompt.
   *  Placeholders: {{text}}, {{language}}, {{question}}. */
  templates: Record<string, string>
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'hermes',
  persona: '',
  hermes: { profile: '', model: '' },
  ollama: { url: 'http://127.0.0.1:11434', model: 'llama3.2' },
  openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
  actionProviders: {},
  templates: {}
}

export const $aiConfig = atom<AIConfig>(DEFAULT_AI_CONFIG)

/** Merge a (possibly older/partial) persisted config over the defaults. */
export function mergeAIConfig(partial: Partial<AIConfig> | null | undefined): AIConfig {
  return {
    provider: partial?.provider ?? DEFAULT_AI_CONFIG.provider,
    persona: partial?.persona ?? DEFAULT_AI_CONFIG.persona,
    hermes: { ...DEFAULT_AI_CONFIG.hermes, ...(partial?.hermes ?? {}) },
    ollama: { ...DEFAULT_AI_CONFIG.ollama, ...(partial?.ollama ?? {}) },
    openai: { ...DEFAULT_AI_CONFIG.openai, ...(partial?.openai ?? {}) },
    actionProviders: { ...(partial?.actionProviders ?? {}) },
    templates: { ...(partial?.templates ?? {}) }
  }
}

export function setAIConfig(config: AIConfig): void {
  $aiConfig.set(config)
}
