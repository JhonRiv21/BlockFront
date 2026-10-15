import { describe, expect, it } from 'vitest'
import { damper, springCritical, springUnderdamped } from './spring.ts'

// Written from docs/f2-5-polish.md §5.1 (Daniel Holden): frame-rate independent damper and
// exact critically damped spring; an underdamped variant for the recoil snap.

describe('damper', () => {
  it('halves the distance to the goal every half-life regardless of the step size', () => {
    let x = 0
    for (let i = 0; i < 10; i++) x = damper(x, 1, 0.1, 0.01)
    expect(x).toBeCloseTo(0.5, 3)
    expect(damper(0, 1, 0.1, 0.1)).toBeCloseTo(0.5, 3)
    expect(damper(0, 1, 0.1, 0.2)).toBeCloseTo(0.75, 3)
  })
})

describe('springCritical', () => {
  it('reaches the goal without overshoot and is independent of the step size', () => {
    const a = { x: 0, v: 0 }
    const b = { x: 0, v: 0 }
    let maxA = 0
    for (let i = 0; i < 60; i++) {
      springCritical(a, 1, 0.1, 1 / 60)
      maxA = Math.max(maxA, a.x)
    }
    for (let i = 0; i < 20; i++) springCritical(b, 1, 0.1, 1 / 20)
    expect(a.x).toBeGreaterThan(0.99)
    expect(maxA).toBeLessThanOrEqual(1.0001)
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.02)
  })

  it('keeps an impulse: a velocity kick moves away and settles back', () => {
    const s = { x: 0, v: 5 }
    let peak = 0
    for (let i = 0; i < 120; i++) {
      springCritical(s, 0, 0.08, 1 / 60)
      peak = Math.max(peak, s.x)
    }
    expect(peak).toBeGreaterThan(0.05)
    expect(Math.abs(s.x)).toBeLessThan(0.001)
  })
})

describe('springUnderdamped', () => {
  it('overshoots once with zeta 0.5 and omega 25, then settles', () => {
    const s = { x: 0, v: 4 }
    let min = 0
    let max = 0
    for (let i = 0; i < 180; i++) {
      springUnderdamped(s, 0, 0.5, 25, 1 / 60)
      min = Math.min(min, s.x)
      max = Math.max(max, s.x)
    }
    expect(max).toBeGreaterThan(0.05)
    expect(min).toBeLessThan(-0.005)
    expect(Math.abs(s.x)).toBeLessThan(0.001)
  })
})
