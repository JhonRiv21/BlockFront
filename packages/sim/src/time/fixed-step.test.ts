import { describe, expect, it } from 'vitest'
import { FixedStep } from './fixed-step.ts'

const STEP = 1 / 30

describe('FixedStep', () => {
  it('runs no step until a full step has elapsed', () => {
    const clock = new FixedStep(STEP, 5)
    expect(clock.advance(STEP * 0.5).steps).toBe(0)
    expect(clock.advance(STEP * 0.5).steps).toBe(1)
  })

  it('carries the remainder between frames', () => {
    const clock = new FixedStep(STEP, 5)
    const total = [0.4, 0.4, 0.4, 0.4, 0.4].reduce(
      (sum, f) => sum + clock.advance(STEP * f).steps,
      0,
    )
    expect(total).toBe(2)
  })

  it('reports alpha as the fraction of the next step, in [0, 1)', () => {
    const clock = new FixedStep(STEP, 5)
    const { steps, alpha } = clock.advance(STEP * 2.25)
    expect(steps).toBe(2)
    expect(alpha).toBeCloseTo(0.25, 6)
  })

  it('caps steps per frame and drops the backlog after a long stall', () => {
    const clock = new FixedStep(STEP, 5)
    expect(clock.advance(10).steps).toBe(5)
    expect(clock.advance(STEP * 0.5).steps).toBe(0)
  })

  it('ignores negative and non-finite elapsed time', () => {
    const clock = new FixedStep(STEP, 5)
    expect(clock.advance(-1).steps).toBe(0)
    expect(clock.advance(Number.NaN).steps).toBe(0)
    expect(clock.advance(Number.POSITIVE_INFINITY).steps).toBe(0)
    expect(clock.advance(STEP).steps).toBe(1)
  })
})
