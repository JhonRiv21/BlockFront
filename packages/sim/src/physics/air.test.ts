import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { AIR, createAir, stepAir } from './air.ts'

// Written from docs/f2-5-polish.md §3.2: 10 bubbles = 15 s, one lost every 1.5 s, 1 s of grace
// at zero, then 10 HP/s; out of the water the air refills in about 2 s.

function ticks(seconds: number): number {
  return Math.round(seconds / TICK_SECONDS)
}

describe('stepAir', () => {
  it('starts full with 10 bubbles', () => {
    const air = createAir()
    expect(AIR.bubbles).toBe(10)
    expect(air.seconds).toBe(AIR.maxSeconds)
    expect(Math.ceil(air.seconds / AIR.secondsPerBubble)).toBe(10)
  })

  it('loses one bubble every 1.5 s under water', () => {
    const air = createAir()
    for (let i = 0; i < ticks(1.5) + 1; i++) stepAir(air, true, TICK_SECONDS)
    expect(Math.ceil(air.seconds / AIR.secondsPerBubble)).toBe(9)
    for (let i = 0; i < ticks(1.5 * 8); i++) stepAir(air, true, TICK_SECONDS)
    expect(Math.ceil(air.seconds / AIR.secondsPerBubble)).toBeLessThanOrEqual(1)
  })

  it('deals no damage for one second after the air runs out, then 10 HP per second', () => {
    const air = createAir()
    let damage = 0
    for (let i = 0; i < ticks(15); i++) damage += stepAir(air, true, TICK_SECONDS)
    expect(damage).toBe(0)
    for (let i = 0; i < ticks(1) - 1; i++) damage += stepAir(air, true, TICK_SECONDS)
    expect(damage).toBe(0)
    for (let i = 0; i < ticks(3) + 1; i++) damage += stepAir(air, true, TICK_SECONDS)
    expect(damage).toBeGreaterThanOrEqual(29)
    expect(damage).toBeLessThanOrEqual(31)
  })

  it('refills in about two seconds out of the water', () => {
    const air = createAir()
    for (let i = 0; i < ticks(15); i++) stepAir(air, true, TICK_SECONDS)
    expect(air.seconds).toBeCloseTo(0, 6)
    for (let i = 0; i < ticks(2.2); i++) stepAir(air, false, TICK_SECONDS)
    expect(air.seconds).toBe(AIR.maxSeconds)
  })
})
