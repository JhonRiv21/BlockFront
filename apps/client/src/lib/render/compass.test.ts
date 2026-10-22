import { describe, expect, it } from 'vitest'
import { compassOffset } from './compass.ts'

// Spec: the strip spans ±90° of the view; dead ahead is the centre, right is right, behind is
// pinned to the nearer edge.
describe('compassOffset', () => {
  it('a point straight ahead sits in the centre', () => {
    // yaw 0 looks toward -Z.
    expect(compassOffset(0, [0, 0, 0], [0, 0, -10])).toBeCloseTo(0, 6)
    // yaw PI looks toward +Z.
    expect(compassOffset(Math.PI, [0, 0, 0], [0, 0, 10])).toBeCloseTo(0, 6)
  })

  it('a point to the right lands on the right half', () => {
    // Looking toward -Z, +X is the right-hand side.
    expect(compassOffset(0, [0, 0, 0], [10, 0, -10])).toBeCloseTo(0.5, 6)
    expect(compassOffset(0, [0, 0, 0], [-10, 0, -10])).toBeCloseTo(-0.5, 6)
  })

  it('points beyond 90° pin to the edge', () => {
    expect(compassOffset(0, [0, 0, 0], [1, 0, 10])).toBe(1)
    expect(compassOffset(0, [0, 0, 0], [-1, 0, 10])).toBe(-1)
  })
})
