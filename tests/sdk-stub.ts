// Minimal stand-in for @hermes/plugin-sdk in unit tests.
export const host = {
  state: new Proxy({}, { get: () => ({ get: () => undefined }) }),
  notify: () => undefined,
  navigate: () => undefined,
  request: async () => ({}),
  onEvent: () => () => undefined
}
export const usePluginI18n = () => (key: string) => key
export const useValue = <T,>(a: { get(): T }): T => a.get()
export const atom = <T,>(initial: T) => {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      listeners.forEach(l => l())
    },
    listen: (fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}
export const haptic = () => undefined
export const cn = (...parts: Array<null | undefined | false | string>) => parts.filter(Boolean).join(' ')
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const STATUSBAR_AREAS = { left: 'statusbar.left', right: 'statusbar.right' }
export const Codicon = () => null
export const Tip = () => null
