/**
 * AI provider registry — the controller asks for a provider by config, never
 * by concrete class. Hermes stays the default; Ollama and OpenAI-compatible
 * implementations satisfy the same AIProvider interface.
 */
import { $aiConfig, type AIConfig } from './config'
import type { AIProvider } from './provider'
import { HermesAIProvider } from './providers/hermes'
import { createOllamaProvider } from './providers/ollama'
import { createOpenAIProvider } from './providers/openai'

export function providerFor(config: AIConfig): AIProvider {
  switch (config.provider) {
    case 'ollama':
      return createOllamaProvider(config.ollama)
    case 'openai':
      return createOpenAIProvider(config.openai)
    default:
      return HermesAIProvider
  }
}

/** Provider for one AI action: the per-action override wins over the global
 *  provider ('' / missing = no override). */
export function providerForAction(config: AIConfig, actionId: string): AIProvider {
  const override = config.actionProviders?.[actionId]
  return override ? providerFor({ ...config, provider: override }) : providerFor(config)
}

export function getAIProvider(): AIProvider {
  return providerFor($aiConfig.get())
}
