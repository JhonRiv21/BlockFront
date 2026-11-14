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

describe('sweepAabb at exact corners', () => {
  it('cannot slip diagonally through the corner of a block', () => {
    // Both the x and z boundaries are reached at the same time; the box must stop, not tunnel.
    const corner: Solid = (x, y, z) => y < 0 || (x === 4 && z === 4)
    const b = box(3.5, 0, 3.5)
    sweepAabb(corner, b, [2, 0, 2])
    expect(b.max[0] <= 4 || b.max[2] <= 4).toBe(true)
    // Whatever it did, it never overlaps the block.
    expect(b.max[0] > 4 && b.max[2] > 4 && b.min[0] < 5 && b.min[2] < 5).toBe(false)
  })

  it('cannot jump into a block edge-on: the vertical and horizontal crossings coincide', () => {
    const ledge: Solid = (x, y) => y < 0 || (x >= 6 && y < 2)
    // Rising past y = 2 at the exact moment its right side reaches x = 6.
    const b = box(5.5, 1.8, 0.5)
    sweepAabb(ledge, b, [0.2, 0.2, 0])
    const inside = b.max[0] > 6 && b.min[1] < 2
    expect(inside).toBe(false)
  })
})

// Written from the expected behaviour, before reading the fix: a box on the floor that slid
// along a wall and past its end walks round the corner, or back, without jumping. Each
// scenario is built on a local (u, v) plane, u toward the wall and v along it, then mapped
// onto X or Z with either sign.
describe('sweepAabb on the floor after sliding along a wall', () => {
  type Frame = { axis: 'x' | 'z'; sign: 1 | -1 }
  const frames: Frame[] = [
    { axis: 'x', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'z', sign: 1 },
    { axis: 'z', sign: -1 },
  ]
  const STEP = 0.07
  const GRAVITY_STEP = -0.005

  // The wall: column u = 10, from v = 0 to v = 4, three blocks high.
  function world(f: Frame): Solid {
    return (x, y, z) => {
      if (y < 0) return true
      const wu = f.axis === 'x' ? x : z
      const v = f.axis === 'x' ? z : x
      const u = f.sign > 0 ? wu : -wu - 1
      return u === 10 && v >= 0 && v <= 4 && y < 3
    }
  }

  function localBox(f: Frame, u: number, v: number): Aabb {
    const wu = f.sign * u
    return f.axis === 'x' ? box(wu, 0, v) : box(v, 0, wu)
  }

  function center(f: Frame, b: Aabb): { u: number; v: number } {
    const cx = (b.min[0] + b.max[0]) / 2
    const cz = (b.min[2] + b.max[2]) / 2
    return f.axis === 'x' ? { u: f.sign * cx, v: cz } : { u: f.sign * cz, v: cx }
  }

  function walk(f: Frame, b: Aabb, du: number, dv: number, ticks: number) {
    const wu = f.sign * du * STEP
    const dv2 = dv * STEP
    const delta: [number, number, number] =
      f.axis === 'x' ? [wu, GRAVITY_STEP, dv2] : [dv2, GRAVITY_STEP, wu]
    for (let i = 0; i < ticks; i++) {
      sweepAabb(world(f), b, [delta[0], delta[1], delta[2]])
      expect(b.min[1]).toBe(0)
    }
  }

  for (const f of frames) {
    const name = `${f.sign > 0 ? '+' : '-'}${f.axis.toUpperCase()}`

    it(`rounds the corner pushing diagonally along the wall on ${name}`, () => {
      const b = localBox(f, 8, 0.5)
      walk(f, b, 1, 1, 30)
      expect(center(f, b).u).toBeCloseTo(9.7, 9)
      walk(f, b, 1, 1, 80)
      const end = center(f, b)
      expect(end.v).toBeGreaterThan(5.3)
      expect(end.u).toBeGreaterThan(10.5)
    })

    it(`turns into the corner after sliding past the end of the wall on ${name}`, () => {
      const b = localBox(f, 8, 0.5)
      walk(f, b, 1, 0, 40)
      walk(f, b, 0, 1, 80)
      expect(center(f, b).u).toBeCloseTo(9.7, 9)
      walk(f, b, 1, 0, 20)
      expect(center(f, b).u).toBeGreaterThan(10.5)
    })

    it(`walks back away from the wall after hitting it on ${name}`, () => {
      const b = localBox(f, 8, 0.5)
      walk(f, b, 1, 1, 30)
      const slid = center(f, b).v
      walk(f, b, -1, 0, 20)
      expect(center(f, b).u).toBeLessThan(9.7 - 1)
      walk(f, b, 0, -1, 20)
      expect(center(f, b).v).toBeLessThan(slid - 1)
    })

    it(`crosses the boundary it was snapped to by a wall in the other direction on ${name}`, () => {
      // Snapped flush against the far side of the wall (min u = 11), then the wall is gone
      // beyond v = 4: walking back across u = 11 there must not catch on the floor.
      const b = localBox(f, 13, 3.5)
      walk(f, b, -1, 0, 40)
      expect(center(f, b).u).toBeCloseTo(11.3, 9)
      walk(f, b, -1, 1, 40)
      expect(center(f, b).u).toBeLessThan(11 - 0.5)
    })
  }
})
