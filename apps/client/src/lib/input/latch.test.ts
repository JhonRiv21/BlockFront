import { describe, expect, it } from 'vitest'
import { Latch } from './latch.ts'

// Spec (docs/audit-2026-10-14.md §3.1): a tap shorter than a tick is not lost. The falling edge
// is latched until the next tick ends; a key still down keeps counting as held.
describe('Latch', () => {
  it('a press and release inside one tick still reads as held for that tick', () => {
    const latch = new Latch()
    latch.press('Space')
    latch.release('Space')
    expect(latch.isHeld('Space')).toBe(true)
    latch.endTick()
    expect(latch.isHeld('Space')).toBe(false)
  })

  it('a key kept down stays held across ticks', () => {
    const latch = new Latch()
    latch.press('KeyW')
    latch.endTick()
    latch.endTick()
    expect(latch.isHeld('KeyW')).toBe(true)
    latch.release('KeyW')
    latch.endTick()
    expect(latch.isHeld('KeyW')).toBe(false)
  })

  it('takePressed fires once per physical press, not on auto-repeat', () => {
    const latch = new Latch()
    latch.press('Digit1')
    latch.press('Digit1')
    expect(latch.takePressed('Digit1')).toBe(true)
    expect(latch.takePressed('Digit1')).toBe(false)
    latch.release('Digit1')
    latch.press('Digit1')
    expect(latch.takePressed('Digit1')).toBe(true)
  })

  it('two taps in one tick count once, and a tap after endTick counts again', () => {
    const latch = new Latch()
    latch.press('mouse:0')
    latch.release('mouse:0')
    latch.press('mouse:0')
    latch.release('mouse:0')
    expect(latch.isHeld('mouse:0')).toBe(true)
    latch.endTick()
    expect(latch.isHeld('mouse:0')).toBe(false)
    latch.press('mouse:0')
    latch.release('mouse:0')
    expect(latch.isHeld('mouse:0')).toBe(true)
  })

  it('clear forgets everything', () => {
    const latch = new Latch()
    latch.press('KeyA')
    latch.clear()
    expect(latch.isHeld('KeyA')).toBe(false)
    expect(latch.takePressed('KeyA')).toBe(false)
  })
})
