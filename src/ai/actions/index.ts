/**
 * AIActionRegistry — the editor-native AI actions (⌘K popup). Each action is
 * a pure prompt builder over the selection/document; applying the result is
 * ALWAYS a user decision in the preview dialog (safe editing, §16).
 */
import type { AIProvider } from '../provider'

export type AIScope = 'selection' | 'document'

export interface AIActionContext {
  scope: AIScope
  selectedText: string
  documentText: string
  language: string
  /** Free-text question for the Ask Hermes action. */
  question?: string
}

export interface AIAction {
  id: string
  labelKey: string
  /** Actions that produce a replacement candidate get a preview. */
  kind: 'transform' | 'answer'
  buildPrompt(ctx: AIActionContext): string
}

function fenced(text: string, language: string): string {
  const lang = language && language !== 'plain' ? language : ''
  return `\`\`\`${lang}\n${text}\n\`\`\``
}

const CODE_ACTIONS = ['explain', 'fix', 'refactor', 'generateCode', 'generateShell']

function wantsCodeFence(actionId: string): boolean {
  return CODE_ACTIONS.includes(actionId)
}

function body(ctx: AIActionContext, actionId: string): string {
  const text = ctx.scope === 'selection' ? ctx.selectedText : ctx.documentText
  return wantsCodeFence(actionId) ? fenced(text, ctx.language) : text
}

export const AI_ACTIONS: AIAction[] = [
  {
    id: 'improve',
    labelKey: 'ai.action.improve',
    kind: 'transform',
    buildPrompt: ctx =>
      `Improve the following note. Fix wording, grammar and structure. Never invent facts, never add commentary — reply with ONLY the improved note.\n\n${body(ctx, 'improve')}`
  },
  {
    id: 'shorten',
    labelKey: 'ai.action.shorten',
    kind: 'transform',
    buildPrompt: ctx =>
      `Shorten the following text. Keep every fact, remove redundancy. Reply with ONLY the shortened text.\n\n${body(ctx, 'shorten')}`
  },
  {
    id: 'structure',
    labelKey: 'ai.action.structure',
    kind: 'transform',
    buildPrompt: ctx =>
      `Give the following text a clear structure using Markdown headings and bullet points where appropriate. Never invent facts. Reply with ONLY the structured text.\n\n${body(ctx, 'structure')}`
  },
  {
    id: 'explain',
    labelKey: 'ai.action.explain',
    kind: 'answer',
    buildPrompt: ctx =>
      `Explain the following ${ctx.language === 'plain' ? 'text' : ctx.language + ' code'} concisely:\n\n${body(ctx, 'explain')}`
  },
  {
    id: 'fix',
    labelKey: 'ai.action.fix',
    kind: 'transform',
    buildPrompt: ctx =>
      `Find and fix bugs in the following code. Reply with ONLY the corrected code, no commentary.\n\n${body(ctx, 'fix')}`
  },
  {
    id: 'refactor',
    labelKey: 'ai.action.refactor',
    kind: 'transform',
    buildPrompt: ctx =>
      `Refactor the following code for clarity and maintainability without changing behavior. Reply with ONLY the refactored code.\n\n${body(ctx, 'refactor')}`
  },
  {
    id: 'generateCode',
    labelKey: 'ai.action.generateCode',
    kind: 'transform',
    buildPrompt: ctx =>
      `Generate code for the following request in ${ctx.language === 'plain' ? 'an appropriate language' : ctx.language}. Reply with ONLY the code.\n\nRequest:\n${ctx.scope === 'selection' ? ctx.selectedText : ctx.documentText}`
  },
  {
    id: 'generateShell',
    labelKey: 'ai.action.generateShell',
    kind: 'transform',
    buildPrompt: ctx =>
      `Write a single shell command (bash) for the following task. Reply with ONLY the command, no commentary.\n\nTask:\n${ctx.scope === 'selection' ? ctx.selectedText : ctx.documentText}`
  },
  {
    id: 'generateScript',
    labelKey: 'ai.action.generateScript',
    kind: 'transform',
    buildPrompt: ctx =>
      `Write a complete, runnable script for the following task (bash unless the request clearly implies another language). Reply with ONLY the script.\n\nTask:\n${ctx.scope === 'selection' ? ctx.selectedText : ctx.documentText}`
  },
  {
    id: 'ask',
    labelKey: 'ai.action.ask',
    kind: 'answer',
    buildPrompt: ctx =>
      `Question: ${ctx.question ?? ''}\n\nContext (current ${ctx.scope === 'selection' ? 'selection' : 'document'}):\n${body(ctx, 'ask')}`
  }
]

/** Build the prompt for an action: the built-in prompt, or — when the user
 *  configured a custom template — the template with placeholders substituted.
 *  {{text}} = selection or document body (raw, no code fence), {{language}} =
 *  editor language id ('plain' if unset), {{question}} = ask question or ''. */
export function buildActionPrompt(action: AIAction, ctx: AIActionContext, template?: string): string {
  const t = template?.trim()
  if (!t) return action.buildPrompt(ctx)
  const text = ctx.scope === 'selection' ? ctx.selectedText : ctx.documentText
  return t
    .replaceAll('{{text}}', text)
    .replaceAll('{{language}}', ctx.language || 'plain')
    .replaceAll('{{question}}', ctx.question ?? '')
}

/** Suggested Kanban task title from a note — one clear sentence. */
export function buildTaskTitlePrompt(text: string): string {
  return `Derive a concise task title (max 8 words, no quotes, no punctuation at the end) for a Kanban task based on this note. Reply with ONLY the title.\n\nNote:\n${text}`
}

export interface AIRunner {
  run(action: AIAction, ctx: AIActionContext): Promise<string>
}

export function createRunner(provider: AIProvider): AIRunner {
  return {
    async run(action, ctx) {
      const result = await provider.complete({ prompt: action.buildPrompt(ctx) })
      return result.text
    }
  }
}
