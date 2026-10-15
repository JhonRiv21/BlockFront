import { describe, expect, it } from 'vitest'
import { detectLocale, en, es } from './strings.ts'

// Spec: one language at a time, taken from the browser's preference list; English when none
// of the preferred languages has a dictionary.
describe('detectLocale', () => {
  it('picks Spanish for any Spanish region', () => {
    expect(detectLocale(['es-CO', 'en-US'])).toBe('es')
    expect(detectLocale(['ES'])).toBe('es')
  })

  it('falls back to English when nothing matches or the list is empty', () => {
    expect(detectLocale(['fr-FR', 'de'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('respects the order of preference', () => {
    expect(detectLocale(['en-GB', 'es-ES'])).toBe('en')
  })

  it('every key has a Spanish translation', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })
})
