import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../physics/sweep.ts'
import { canSee, PERCEPTION } from './perception.ts'

// Written from docs/final-scope.md §4 (Percepción): sight is a voxel raycast from the eye to
// the target, inside the field of view and up to 70 blocks.
// Written with the implementation in context (same session); the cases come from the spec.

type Solid = (x: number, y: number, z: number) => boolean
const open: Solid = () => false
const eye: Vec3 = [0.5, 1.6, 0.5]
// yaw 0 looks toward -Z.
const ahead = (distance: number, side = 0): Vec3 => [0.5 + side, 1.6, 0.5 - distance]

describe('bot sight', () => {
  it('sees a target straight ahead in the open', () => {
    expect(canSee(open, eye, 0, 0, 90, ahead(10))).toBe(true)
  })

  it('a single solid voxel on the line of sight hides the target', () => {
    const wall: Solid = (x, y, z) => x === 0 && y === 1 && z === -5
    expect(canSee(wall, eye, 0, 0, 90, ahead(10))).toBe(false)
    // The same voxel off the line does not.
    const aside: Solid = (x, y, z) => x === 3 && y === 1 && z === -5
    expect(canSee(aside, eye, 0, 0, 90, ahead(10))).toBe(true)
  })

  it('a target outside the field of view is not seen, inside it is', () => {
    // 50° off the view direction: outside a 90° field of view, inside a 120° one.
    const off = Math.tan((50 * Math.PI) / 180) * 10
    expect(canSee(open, eye, 0, 0, 90, ahead(10, off))).toBe(false)
    expect(canSee(open, eye, 0, 0, 120, ahead(10, off))).toBe(true)
    // Behind the bot.
    expect(canSee(open, eye, 0, 0, 120, [0.5, 1.6, 10.5])).toBe(false)
    // Turning toward it brings it in.
    expect(canSee(open, eye, Math.PI, 0, 90, [0.5, 1.6, 10.5])).toBe(true)
  })

  it('does not see beyond the vision range', () => {
    expect(canSee(open, eye, 0, 0, 90, ahead(PERCEPTION.visionRange - 1))).toBe(true)
    expect(canSee(open, eye, 0, 0, 90, ahead(PERCEPTION.visionRange + 1))).toBe(false)
  })
})
