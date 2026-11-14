import { describe, expect, it } from 'vitest'
import { BOT_NAMES, botName } from './bot-names.ts'

// Spec (docs/final-scope.md §5): 30 or more fun bot names, assigned deterministically by id.
describe('bot names', () => {
  it('has at least 30 distinct names', () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length)
  })

  it('gives the same id the same name every time', () => {
    expect(botName(5)).toBe(botName(5))
    expect(BOT_NAMES).toContain(botName(5))
  })

  it('never repeats a name inside the biggest match (ids 2 to 12)', () => {
    const names = Array.from({ length: 11 }, (_, i) => botName(i + 2))
    expect(new Set(names).size).toBe(names.length)
  })

  it('fits a nameplate', () => {
    for (const name of BOT_NAMES) expect(name.length).toBeLessThanOrEqual(15)
  })
})
