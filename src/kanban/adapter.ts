/**
 * KanbanAdapter — all Hermes Kanban integration lives here. The backend is the
 * plugin's own Python namespace (/api/plugins/hermes-scratchpad), which
 * delegates to hermes_cli.kanban_db — the same library the official Kanban
 * surfaces use. Failures never touch editor content.
 */
import type { PluginContext } from '@hermes/plugin-sdk'

export interface KanbanBoard {
  slug: string
  name: string
  current?: boolean
}

export interface CreateTaskInput {
  title: string
  description?: string
  board?: string | null
  priority?: number
}

export interface CreateTaskResult {
  id?: string
  key?: string
  title?: string
  [k: string]: unknown
}

let ctxRef: PluginContext | null = null

export function initKanban(ctx: PluginContext): void {
  ctxRef = ctx
}

function ctx(): PluginContext {
  if (!ctxRef) throw new Error('KanbanAdapter not initialized')
  return ctxRef
}

export async function listBoards(): Promise<KanbanBoard[]> {
  const res = await ctx().rest<{ ok: boolean; boards?: KanbanBoard[]; error?: string }>(
    '/boards',
    { timeoutMs: 10000 }
  )
  if (!res.ok || !res.boards) throw new Error(res.error || 'boards unavailable')
  return res.boards
}

export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  const res = await ctx().rest<{ ok: boolean; task?: CreateTaskResult; error?: string }>('/tasks', {
    method: 'POST',
    body: {
      title: input.title,
      body: input.description ?? '',
      board: input.board ?? null,
      priority: input.priority ?? 0
    },
    timeoutMs: 20000
  })
  if (!res.ok || !res.task) throw new Error(res.error || 'create failed')
  return res.task
}
