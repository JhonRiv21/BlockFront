import { describe, expect, it } from 'vitest'
import { sweepAabb, type Aabb } from './sweep.ts'

// Written from the spec: a box swept through a voxel grid stops flush against solid voxels,
// slides along them, and never tunnels through a wall no matter how large the step is.

type Solid = (x: number, y: number, z: number) => boolean

const floor: Solid = (_x, y) => y < 0
const wallAtX10: Solid = (x, y) => y < 0 || x === 10
const nothing: Solid = () => false

function box(x: number, y: number, z: number, w = 0.6, h = 1.8): Aabb {
  return { min: [x - w / 2, y, z - w / 2], max: [x + w / 2, y + h, z + w / 2] }
}

describe('sweepAabb', () => {
  it('moves freely when nothing is in the way', () => {
    const b = box(0.5, 0, 0.5)
    const hit = sweepAabb(nothing, b, [3, 1, -2])
    expect(hit).toEqual({ x: 0, y: 0, z: 0 })
    expect(b.min[0]).toBeCloseTo(3.2, 9)
    expect(b.min[1]).toBeCloseTo(1, 9)
    expect(b.min[2]).toBeCloseTo(-1.8, 9)
  })

  it('lands on the floor and reports the collision on -Y', () => {
    const b = box(0.5, 2, 0.5)
    const hit = sweepAabb(floor, b, [0, -5, 0])
    expect(hit).toEqual({ x: 0, y: -1, z: 0 })
    expect(b.min[1]).toBe(0)
  })

  it('stops flush against a wall on +X', () => {
    const b = box(5, 0, 0.5)
    const hit = sweepAabb(wallAtX10, b, [8, 0, 0])
    expect(hit.x).toBe(1)
    expect(b.max[0]).toBe(10)
  })

  it('stops flush against a wall on -X', () => {
    const b = box(14, 0, 0.5)
    const hit = sweepAabb(wallAtX10, b, [-8, 0, 0])
    expect(hit.x).toBe(-1)
    expect(b.min[0]).toBe(11)
  })

  it('does not tunnel through a one-block wall at high speed', () => {
    const b = box(2, 0, 0.5)
    sweepAabb(wallAtX10, b, [500, 0, 0])
    expect(b.max[0]).toBe(10)
    const c = box(2, 0, 0.5)
    sweepAabb(wallAtX10, c, [500, 0.3, 500])
    expect(c.max[0]).toBe(10)
  })

  it('slides along the wall when moving diagonally into it', () => {
    const b = box(9, 0, 0.5)
    const hit = sweepAabb(wallAtX10, b, [2, 0, 4])
    expect(hit).toEqual({ x: 1, y: 0, z: 0 })
    expect(b.max[0]).toBe(10)
    expect(b.min[2]).toBeCloseTo(4.2, 9)
  })

  it('is stopped by a ceiling', () => {
    const ceiling: Solid = (_x, y) => y < 0 || y >= 3
    const b = box(0.5, 0, 0.5)
    const hit = sweepAabb(ceiling, b, [0, 5, 0])
    expect(hit.y).toBe(1)
    expect(b.max[1]).toBe(3)
  })

  it('cannot pass a gap narrower than the box', () => {
    const pillars: Solid = (x, y, z) => y < 0 || (x === 3 && (z === 0 || z === 2))
    // Centered on z = 1.5 the box spans 1.2..1.8 and fits between the pillars at z 0 and z 2.
    const fits = box(2, 0, 1.5)
    sweepAabb(pillars, fits, [3, 0, 0])
    expect(fits.min[0]).toBeCloseTo(4.7, 9)
    // Centered on z = 2.2 it overlaps the pillar at z 2.
    const blocked = box(2, 0, 2.2)
    sweepAabb(pillars, blocked, [3, 0, 0])
    expect(blocked.max[0]).toBe(3)
  })

  it('is blocked by a single block clipped on the corner of its path', () => {
    const corner: Solid = (x, y, z) => y < 0 || (x === 4 && z === 4)
    // The box reaches z = 4 while its x span already overlaps column 4: it must stop on z.
    const b = box(3.5, 0, 3.5)
    const hit = sweepAabb(corner, b, [2, 0, 1.5])
    expect(hit).toEqual({ x: 0, y: 0, z: 1 })
    expect(b.max[2]).toBe(4)
    expect(b.max[0]).toBeCloseTo(5.8, 9)
  })

  it('does not step up a one-block ledge by itself', () => {
    const ledge: Solid = (x, y) => y < 0 || (x >= 6 && y < 1)
    const b = box(4, 0, 0.5)
    sweepAabb(ledge, b, [4, 0, 0])
    expect(b.max[0]).toBe(6)
    expect(b.min[1]).toBe(0)
  })

  it('treats a box already resting on a surface as colliding when pushed into it', () => {
    const b = box(0.5, 0, 0.5)
    const hit = sweepAabb(floor, b, [0, -0.01, 0])
    expect(hit.y).toBe(-1)
    expect(b.min[1]).toBe(0)
  })
})
