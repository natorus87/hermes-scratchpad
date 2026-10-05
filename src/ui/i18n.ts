/**
 * React-side localization hook.
 * - `system` follows the app's active locale (detected via the `__locale`
 *   probe key resolved through usePluginI18n — re-renders on locale switch).
 * - an explicit override wins and also triggers re-render via its atom.
 */
import { usePluginI18n, useValue } from '@hermes/plugin-sdk'
import { atom } from 'nanostores'
import { BUNDLES, type LanguageSetting } from '../i18n'

export type { LanguageSetting } from '../i18n'

export const PLUGIN_ID = 'hermes-scratchpad'

export const $langSetting = atom<LanguageSetting>('system')
export const $labelsVersion = atom(0)

function interpolate(template: string, args: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (m, i) => {
    const v = args[Number(i)]
    return v === undefined ? m : String(v)
  })
}

export function translateIn(locale: string, key: string, ...args: unknown[]): string {
  const bundle = BUNDLES[locale] ?? BUNDLES.en
  const value = bundle[key as keyof typeof bundle]
  return typeof value === 'string' ? interpolate(value, args) : key
}

export function resolveLocale(setting: LanguageSetting, appLocale: string): string {
  if (setting !== 'system') return setting
  return BUNDLES[appLocale] ? appLocale : 'en'
}

export interface T {
  (key: string, ...args: unknown[]): string
  locale: string
}

export function useT(): T {
  const hostT = usePluginI18n(PLUGIN_ID)
  const setting = useValue($langSetting)
  useValue($labelsVersion)
  const appLocale = hostT('__locale') === 'de' ? 'de' : 'en'
  const locale = resolveLocale(setting, appLocale)
  const fn = ((key: string, ...args: unknown[]) => translateIn(locale, key, ...args)) as T
  fn.locale = locale
  return fn
}
