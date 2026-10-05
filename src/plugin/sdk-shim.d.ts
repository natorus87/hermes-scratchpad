/**
 * Local type declarations for `@hermes/plugin-sdk`, matching the surface of the
 * INSTALLED Hermes Desktop build (inspected from apps/desktop/src/sdk/index.ts and
 * apps/desktop/src/contrib/plugin.ts, see SDK-NOTES.md). The module itself is
 * resolved by the app at load time; it is not an npm dependency.
 */
declare module '@hermes/plugin-sdk' {
  import type { Atom, WritableAtom } from 'nanostores'
  import type { ReactNode } from 'react'

  export type Locale = string

  // --- contribution areas ---
  export const PANES_AREA: string
  export const ROUTES_AREA: string
  export const SIDEBAR_NAV_AREA: string
  export const SIDEBAR_NAV_PREFS_AREA: string
  export const STATUSBAR_AREAS: { left: string; right: string }
  export const TITLEBAR_AREAS: { left: string; center: string; right: string }
  export const WORKSPACE_PAGE_HEADER_AREA: string
  export const PALETTE_AREA: string
  export const KEYBINDS_AREA: string
  export const THEMES_AREA: string
  export const TRANSCRIPT_DIRECTIVE_AREA: string
  export const APPEARANCE_AREAS: { extra: string }

  export interface PaletteContribution {
    id: string
    label: string
    keywords?: string[]
    action?: string
    run: () => void
  }
  export interface KeybindContribution {
    id: string
    label: string
    category?: string
    defaults: string[]
    run: () => void
  }
  export interface SidebarNavContribution {
    path: string
    label: string
    codicon: string
  }

  export interface Contribution {
    id: string
    area: string
    title?: string
    order?: number
    when?: () => boolean
    enabled?: boolean
    render?: () => ReactNode
    data?: unknown
  }

  export interface PluginFileDialogOptions {
    defaultPath?: string
    filters?: Array<{ extensions: string[]; name: string }>
    title?: string
  }
  export interface PluginNativeNotificationInput {
    title: string
    body?: string
    icon?: string
    activate?: string | { path: string }
    onActivate?: () => void
    actions?: Array<{ id: string; label: string; activate?: string; onAction?: () => void }>
  }
  export interface PluginOs {
    notify: (input: PluginNativeNotificationInput) => void
    openExternal: (url: string) => Promise<boolean>
    revealPath: (path: string) => Promise<boolean>
    pickSavePath: (options?: PluginFileDialogOptions) => Promise<null | string>
    pickOpenPath: (options?: PluginFileDialogOptions) => Promise<null | string>
    writeClipboard: (text: string) => Promise<boolean>
  }

  export interface PluginRestOptions {
    method?: string
    body?: unknown
    upload?: { filename: string; contentType?: string; bytes: ArrayBuffer }
    timeoutMs?: number
  }

  export interface PluginStorage {
    get<T>(key: string, fallback: T): T
    set(key: string, value: unknown): void
    remove(key: string): void
  }

  export type PluginTranslate = (key: string, ...args: unknown[]) => string
  export interface PluginI18n {
    register: (bundles: Record<string, Record<string, unknown>>) => () => void
    t: PluginTranslate
    onLocaleChange: (listener: () => void) => () => void
  }

  export interface GatewayEvent {
    type: string
    session_id?: string
    payload?: unknown
    [key: string]: unknown
  }

  export interface PluginContext {
    readonly source: string
    register: (c: Contribution) => () => void
    registerMany: (cs: Contribution[]) => () => void
    onDispose: (fn: () => void) => void
    onEvent: (type: string, listener: (event: GatewayEvent) => void) => () => void
    setTimeout: (fn: () => void, ms: number) => () => void
    setInterval: (fn: () => void, ms: number) => () => void
    addEventListener: (
      target: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean
    ) => () => void
    rest: <T>(path: string, opts?: PluginRestOptions) => Promise<T>
    socket: (path: string, onMessage: (data: unknown) => void) => () => void
    os: PluginOs
    storage: PluginStorage
    i18n: PluginI18n
  }

  export interface HermesPlugin {
    id: string
    name?: string
    description?: string
    defaultEnabled?: boolean
    register: (ctx: PluginContext) => void
  }

  // --- host ---
  export interface UsageStats {
    context_used?: number
    context_max?: number
    context_percent?: number
    [key: string]: unknown
  }
  export interface ProfileRoute {
    profile: string
    targetProfile: string
    connectionId: string
    mode: string
  }
  export const host: {
    state: {
      activeSessionId: Atom<null | string>
      awaitingResponse: Atom<boolean>
      busy: Atom<boolean>
      busyBySession: Atom<Record<string, boolean>>
      connectionId: Atom<null | string>
      cwd: Atom<string>
      focusedSessionId: Atom<null | string>
      focusedSessionOwner: Atom<null | { connectionId: string; profile: string }>
      focusedSessionProfile: Atom<string>
      focusedStoredSessionId: Atom<null | string>
      focusedUsage: Atom<UsageStats | null>
      gateway: Atom<string>
      model: Atom<string>
      profile: Atom<string>
      viewport: Atom<{ width: number; height: number; narrow: boolean }>
    }
    notify(input: { kind: string; message: string; title?: string; detail?: string }): unknown
    notifyError(error: unknown, fallbackMessage?: string): unknown
    navigate(path: string): void
    openSession(id: string, opts?: { profile?: string; intent?: 'in-place' | 'stack' | 'tab' | 'window' }): void
    newChat(profile?: string): void
    openWorkspace(
      id: string,
      opts: { render: () => ReactNode; title?: string; minWidth?: number; onClose?: () => void }
    ): () => void
    onEvent(type: string, fn: (event: GatewayEvent) => void): () => void
    logs(...args: unknown[]): Promise<unknown>
    status(): Promise<unknown>
    restartGateway(): Promise<unknown>
    profileRoutes(): Promise<ProfileRoute[]>
    request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
    requestProfile<T = unknown>(...args: unknown[]): Promise<T>
    i18n: {
      registerAppLocale(
        id: string,
        registration: { endonym?: string; rtl?: boolean; translations?: Record<string, unknown> }
      ): () => void
      languageOptions(): Array<{ id: string; endonym: string; rtl?: boolean; source: string }>
    }
  }

  // --- i18n hooks ---
  export function usePluginI18n(pluginId: string): PluginTranslate

  // --- state ---
  export function atom<T>(initial: T): WritableAtom<T>
  export function computed<T>(fn: () => T): Atom<T>
  export function useValue<T>(a: Atom<T>): T

  // --- misc ---
  export function haptic(kind?: string): void
  export function cn(...parts: Array<null | undefined | false | string>): string
  export function requestTheme(name: string): boolean
  export const queryClient: unknown
  export function useQuery(...args: unknown[]): unknown
  export function useMutation(...args: unknown[]): unknown

  // UI kit (verified against sdk/index.ts exports)
  export const Button: any
  export const Input: any
  export const Textarea: any
  export const Select: any
  export const SelectContent: any
  export const SelectItem: any
  export const SelectTrigger: any
  export const SelectValue: any
  export const Switch: any
  export const Checkbox: any
  export const SegmentedControl: any
  export const Tabs: any
  export const TabsList: any
  export const TabsTrigger: any
  export const TabsContent: any
  export const Dialog: any
  export const DialogContent: any
  export const DialogDescription: any
  export const DialogFooter: any
  export const DialogHeader: any
  export const DialogTitle: any
  export const DialogTrigger: any
  export const ConfirmDialog: any
  export const DropdownMenu: any
  export const DropdownMenuContent: any
  export const DropdownMenuItem: any
  export const DropdownMenuSeparator: any
  export const DropdownMenuTrigger: any
  export const Popover: any
  export const PopoverContent: any
  export const PopoverTrigger: any
  export const Tip: any
  export const Tooltip: any
  export const TooltipContent: any
  export const TooltipProvider: any
  export const TooltipTrigger: any
  export const Badge: any
  export const Kbd: any
  export const KbdGroup: any
  export const SearchField: any
  export const ScrollArea: any
  export const Separator: any
  export const Skeleton: any
  export const GlyphSpinner: any
  export const EmptyState: any
  export const ErrorState: any
  export const CopyButton: any
  export const StatusDot: any
  export const LogView: any
  export const Codicon: any
  export const DecodeText: any
  export const icons: Record<string, any>
}
