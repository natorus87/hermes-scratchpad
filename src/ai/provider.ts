/**
 * AIProvider interface — the editor core never knows which backend answers.
 * The primary implementation is HermesAIProvider (gateway JSON-RPC through
 * host.request + host.onEvent, see SDK-NOTES.md). Alternative providers
 * (Ollama, OpenAI-compatible, …) can implement the same interface later.
 */
export interface AIRequest {
  /** Full instruction for the model, already includes the user text. */
  prompt: string
  /** Optional system-style preamble baked into the prompt (one-shot sessions). */
  instruction?: string
  timeoutMs?: number
}

export interface AIResult {
  text: string
}

export interface AIProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  complete(request: AIRequest): Promise<AIResult>
}
