/**
 * CommandRegistry — internal command ids stay stable English slugs; visible
 * labels are localized at registration time. Palette + keybind contributions
 * are rebuilt on locale change.
 */
export type CommandId =
  | 'scratchpad.new'
  | 'scratchpad.open'
  | 'scratchpad.save'
  | 'scratchpad.saveAs'
  | 'scratchpad.closeTab'
  | 'scratchpad.rename'
  | 'scratchpad.find'
  | 'scratchpad.ai.improve'
  | 'scratchpad.ai.ask'
  | 'scratchpad.ai.explain'
  | 'scratchpad.ai.fix'
  | 'scratchpad.ai.generateCode'
  | 'scratchpad.ai.generateShell'
  | 'scratchpad.ai.settings'
  | 'scratchpad.kanban.createTask'
  | 'scratchpad.toggleWrap'
  | 'scratchpad.saveSnippet'

export type CommandHandler = () => void

const handlers = new Map<CommandId, CommandHandler>()

export function registerCommand(id: CommandId, handler: CommandHandler): void {
  handlers.set(id, handler)
}

export function runCommand(id: CommandId): void {
  handlers.get(id)?.()
}

export function hasCommand(id: CommandId): boolean {
  return handlers.has(id)
}
