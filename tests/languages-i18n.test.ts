import { describe, expect, it } from 'vitest'
import { languageForFilename, LANGUAGE_IDS } from '../src/editor/languages'
import { BUNDLES, hostBundleRegistration } from '../src/i18n'
import { resolveLocale } from '../src/ui/i18n'

describe('languageForFilename', () => {
  it('maps common extensions', () => {
    expect(languageForFilename('notes.md')).toBe('markdown')
    expect(languageForFilename('deploy.sh')).toBe('shell')
    expect(languageForFilename('main.py')).toBe('python')
    expect(languageForFilename('app.tsx')).toBe('typescript')
    expect(languageForFilename('config.yaml')).toBe('yaml')
    expect(languageForFilename('pyproject.toml')).toBe('toml')
    expect(languageForFilename('data.json')).toBe('json')
    expect(languageForFilename('query.sql')).toBe('sql')
  })

  it('falls back to plain text', () => {
    expect(languageForFilename('README')).toBe('plain')
    expect(languageForFilename('file.unknownext')).toBe('plain')
  })

  it('covers every id in the registry', () => {
    for (const id of LANGUAGE_IDS) expect(BUNDLES.en[`lang.${id}`]).toBeTruthy()
  })
})

describe('i18n', () => {
  it('ships matching en/de key sets', () => {
    const enKeys = Object.keys(BUNDLES.en).sort()
    const deKeys = Object.keys(BUNDLES.de).sort()
    expect(deKeys).toEqual(enKeys)
  })

  it('registers the __locale probe for both bundles', () => {
    const reg = hostBundleRegistration()
    expect(reg.en.__locale).toBe('en')
    expect(reg.de.__locale).toBe('de')
  })

  it('resolves locale by setting and app locale', () => {
    expect(resolveLocale('system', 'de')).toBe('de')
    expect(resolveLocale('system', 'en')).toBe('en')
    expect(resolveLocale('system', 'ja')).toBe('en') // unsupported → en
    expect(resolveLocale('de', 'en')).toBe('de') // override wins
    expect(resolveLocale('en', 'de')).toBe('en')
  })
})
