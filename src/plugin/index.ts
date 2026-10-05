/**
 * Hermes Scratchpad — plugin entry.
 *
 * Registers: the workspace page, sidebar nav, palette commands, keybinds,
 * status-bar chip, locale bundles and the plugin stylesheet. Command ids are
 * stable English slugs; every visible label is localized.
 */
import {
  KEYBINDS_AREA,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  host,
  type HermesPlugin,
  type PluginContext
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Codicon, Tip, cn, haptic } from '@hermes/plugin-sdk'

import { controller } from './controller'
import { ScratchpadPage } from '../ui/page'
import { hostBundleRegistration } from '../i18n'
import { PLUGIN_ID, $langSetting, resolveLocale, translateIn } from '../ui/i18n'
import { PLUGIN_CSS } from '../ui/styles'
import { $activeId } from '../documents/store'

export const PAGE_PATH = '/scratchpad'

const PALETTE_KEYWORDS: Record<string, string[]> = {
  'scratchpad.new': ['scratchpad', 'new', 'note'],
  'scratchpad.open': ['scratchpad', 'open', 'file'],
  'scratchpad.save': ['scratchpad', 'save'],
  'scratchpad.saveAs': ['scratchpad', 'save', 'as'],
  'scratchpad.closeTab': ['scratchpad', 'close', 'tab'],
  'scratchpad.rename': ['scratchpad', 'rename', 'umbenennen'],
  'scratchpad.find': ['scratchpad', 'find', 'search', 'suchen'],
  'scratchpad.ai.improve': ['scratchpad', 'ai', 'improve'],
  'scratchpad.ai.ask': ['scratchpad', 'ai', 'ask', 'hermes'],
  'scratchpad.ai.explain': ['scratchpad', 'ai', 'explain'],
  'scratchpad.ai.fix': ['scratchpad', 'ai', 'fix', 'code'],
  'scratchpad.ai.generateCode': ['scratchpad', 'ai', 'generate', 'code'],
  'scratchpad.ai.generateShell': ['scratchpad', 'ai', 'shell', 'command'],
  'scratchpad.ai.settings': ['scratchpad', 'ai', 'settings', 'provider', 'persona', 'ollama', 'openai'],
  'scratchpad.kanban.createTask': ['scratchpad', 'kanban', 'task', 'hermes'],
  'scratchpad.toggleWrap': ['scratchpad', 'wrap'],
  'scratchpad.saveSnippet': ['scratchpad', 'snippet', 'save']
}

function injectStyles(ctx: PluginContext): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(`${PLUGIN_ID}-styles`)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.id = `${PLUGIN_ID}-styles`
  style.textContent = PLUGIN_CSS
  document.head.appendChild(style)
  ctx.onDispose(() => style.remove())
}

function currentLocale(ctx: PluginContext): string {
  const setting = $langSetting.get()
  if (setting !== 'system') return setting
  const probe = ctx.i18n.t('__locale')
  return resolveLocale('system', probe === 'de' ? 'de' : 'en')
}

/** Palette + keybind + nav labels — rebuilt on every locale/override change. */
function registerLabels(ctx: PluginContext): () => void {
  const locale = currentLocale(ctx)
  controller.setLocale(locale)
  const t = (key: string) => translateIn(locale, key)

  const keybinds: Array<{ id: string; labelKey: string; defaults: string[] }> = [
    { id: 'scratchpad.new', labelKey: 'command.new', defaults: ['mod+alt+d'] },
    { id: 'scratchpad.open', labelKey: 'command.open', defaults: ['mod+alt+o'] },
    { id: 'scratchpad.save', labelKey: 'command.save', defaults: ['mod+alt+s'] },
    { id: 'scratchpad.saveAs', labelKey: 'command.saveAs', defaults: ['mod+alt+shift+s'] },
    { id: 'scratchpad.closeTab', labelKey: 'command.closeTab', defaults: ['mod+alt+w'] },
    { id: 'scratchpad.rename', labelKey: 'command.rename', defaults: ['mod+alt+r'] },
    { id: 'scratchpad.find', labelKey: 'command.find', defaults: ['mod+alt+f'] },
    { id: 'scratchpad.ai.improve', labelKey: 'command.ai.improve', defaults: ['mod+alt+i'] },
    { id: 'scratchpad.ai.ask', labelKey: 'command.ai.ask', defaults: ['mod+alt+k'] },
    { id: 'scratchpad.kanban.createTask', labelKey: 'command.kanban.createTask', defaults: ['mod+alt+a'] }
  ]

  const paletteIds = Object.keys(PALETTE_KEYWORDS)
  // Command ids are stable slugs; visible labels live under `command.*`.
  const labelOf = (commandId: string) => t(commandId.replace(/^scratchpad\./, 'command.'))

  return ctx.registerMany([
    ...paletteIds.map(localId => ({
      id: `palette-${localId}`,
      area: PALETTE_AREA,
      data: {
        id: `${PLUGIN_ID}.${localId.replace(/^scratchpad\./, '')}`,
        label: labelOf(localId),
        keywords: PALETTE_KEYWORDS[localId],
        run: () => controller.dispatch(localId as never)
      }
    })),
    ...keybinds.map(kb => ({
      id: `keybind-${kb.id}`,
      area: KEYBINDS_AREA,
      data: {
        id: kb.id,
        label: t(kb.labelKey),
        category: 'scratchpad',
        defaults: kb.defaults,
        run: () => controller.dispatch(kb.id as never)
      }
    })),
    {
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      data: { path: PAGE_PATH, label: t('nav.label'), codicon: 'notebook' }
    }
  ])
}

function ScratchpadChip(): any {
  const onClick = () => {
    haptic('tap')
    host.navigate(PAGE_PATH)
  }
  return jsx(Tip, {
    label: controller.t('plugin.name'),
    children: jsx('button', {
      className: cn(
        'inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      type: 'button',
      onClick,
      children: jsx(Codicon, { name: 'notebook', size: '0.7rem' })
    })
  })
}

export const plugin: HermesPlugin = {
  id: PLUGIN_ID,
  name: 'Hermes Scratchpad',
  description: 'Fast text, notes and snippet editor — scratchpads, local files, AI actions, Kanban tasks.',
  register(ctx: PluginContext) {
    ctx.i18n.register(hostBundleRegistration())
    injectStyles(ctx)

    controller.init(ctx)

    // Debug/testing handle (renderer-local, documented in the README).
    ;(globalThis as Record<string, unknown>).__hermesScratchpad = controller

    controller.registerCommands([
      ['scratchpad.new', () => controller.newScratch()],
      ['scratchpad.open', () => void controller.openPath()],
      ['scratchpad.save', () => void controller.save()],
      ['scratchpad.saveAs', () => void controller.saveAs()],
      ['scratchpad.closeTab', () => controller.closeActiveTab()],
      ['scratchpad.rename', () => controller.startRename($activeId.get() ?? '')],
      ['scratchpad.find', () => controller.focusSearch()],
      ['scratchpad.ai.improve', () => controller.runAIAction('improve')],
      ['scratchpad.ai.ask', () => controller.toggleAIPopup()],
      ['scratchpad.ai.explain', () => controller.runAIAction('explain')],
      ['scratchpad.ai.fix', () => controller.runAIAction('fix')],
      ['scratchpad.ai.generateCode', () => controller.runAIAction('generateCode')],
      ['scratchpad.ai.generateShell', () => controller.runAIAction('generateShell')],
      ['scratchpad.ai.settings', () => controller.openAISettings()],
      ['scratchpad.kanban.createTask', () => controller.openKanbanDialog()],
      ['scratchpad.toggleWrap', () => controller.toggleWrap()],
      ['scratchpad.saveSnippet', () => controller.openSnippetDialog()]
    ])

    // Page + status bar chip.
    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: PAGE_PATH },
        render: () => jsx(ScratchpadPage, {})
      },
      {
        id: 'chip',
        area: STATUSBAR_AREAS.right,
        order: 120,
        render: () => jsx(ScratchpadChip, {})
      }
    ])

    // Localized labels — rebuilt on app-locale change and on manual override.
    let disposeLabels = registerLabels(ctx)
    ctx.i18n.onLocaleChange(() => {
      disposeLabels()
      disposeLabels = registerLabels(ctx)
    })
    ctx.onDispose(
      $langSetting.listen(() => {
        disposeLabels()
        disposeLabels = registerLabels(ctx)
      })
    )
  }
}

export default plugin
