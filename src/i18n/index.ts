/**
 * LocalizationService — bundles + shared lookup.
 *
 * - Bundles for `en` and `de` ship with the plugin (en.ts / de.ts).
 * - Setting `system` follows the app's active locale through `ctx.i18n`.
 * - An explicit override (`de` / `en`) wins over the app locale.
 * - Adding a language later = add a bundle file + one entry here; no UI change.
 */
import { en } from './en'
import { de } from './de'

export type LanguageSetting = 'system' | 'en' | 'de'

export const BUNDLES: Record<string, typeof en> = { en, de }

/** Bundles handed to ctx.i18n.register — includes the `__locale` probe key the
 *  useT hook reads to detect the app's active locale. */
export function hostBundleRegistration(): Record<string, Record<string, unknown>> {
  return {
    en: { ...en, __locale: 'en' },
    de: { ...de, __locale: 'de' }
  }
}

export { en, de }
