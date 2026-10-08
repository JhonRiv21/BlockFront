import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE } from '../config.ts'
import { raycastVoxels } from './dda.ts'

// Written from the spec: Amanatides–Woo traversal that returns the first solid voxel and the
// face it was entered through (as an outward normal), including across chunk borders.

type Solid = (x: number, y: number, z: number) => boolean
const S = CHUNK_SIZE
const single =
  (bx: number, by: number, bz: number): Solid =>
  (x, y, z) =>
    x === bx && y === by && z === bz

describe('raycastVoxels', () => {
  it('returns null when nothing is hit within range', () => {
    expect(raycastVoxels(() => false, [0.5, 0.5, 0.5], [1, 0, 0], 10)).toBeNull()
    expect(raycastVoxels(single(20, 0, 0), [0.5, 0.5, 0.5], [1, 0, 0], 10)).toBeNull()
  })

  it('hits the top face when looking down', () => {
    const hit = raycastVoxels(single(3, 1, 3), [3.5, 5, 3.5], [0, -1, 0], 10)
    expect(hit).toEqual({ x: 3, y: 1, z: 3, normal: [0, 1, 0], distance: 3 })
  })

  it('hits each side face with the matching outward normal', () => {
    expect(raycastVoxels(single(5, 5, 5), [0.5, 5.5, 5.5], [1, 0, 0], 10)?.normal).toEqual([
      -1, 0, 0,
    ])
    expect(raycastVoxels(single(5, 5, 5), [9.5, 5.5, 5.5], [-1, 0, 0], 10)?.normal).toEqual([
      1, 0, 0,
    ])
    expect(raycastVoxels(single(5, 5, 5), [5.5, 5.5, 0.5], [0, 0, 1], 10)?.normal).toEqual([
      0, 0, -1,
    ])
    expect(raycastVoxels(single(5, 5, 5), [5.5, 5.5, 9.5], [0, 0, -1], 10)?.normal).toEqual([
      0, 0, 1,
    ])
    expect(raycastVoxels(single(5, 5, 5), [5.5, 0.5, 5.5], [0, 1, 0], 10)?.normal).toEqual([
      0, -1, 0,
    ])
  })

  it('reports the face actually entered on a diagonal ray', () => {
    // z lags x by 0.3, so the ray is already in column x = 4 when it crosses into z = 4.
    const lagZ = raycastVoxels(single(4, 0, 4), [1.5, 0.5, 1.2], [1, 0, 1], 10)
    expect(lagZ?.normal).toEqual([0, 0, -1])
    const lagX = raycastVoxels(single(4, 0, 4), [1.2, 0.5, 1.5], [1, 0, 1], 10)
    expect(lagX?.normal).toEqual([-1, 0, 0])
  })

  it('crosses a chunk border and hits the first block of the next chunk', () => {
    const hit = raycastVoxels(single(S, 2, 2), [S - 4.5, 2.5, 2.5], [1, 0, 0], 10)
    expect(hit).toMatchObject({ x: S, y: 2, z: 2, normal: [-1, 0, 0] })
    expect(hit!.distance).toBeCloseTo(4.5, 9)
  })

  it('hits the last block of a chunk coming back from the next one', () => {
    const hit = raycastVoxels(single(S - 1, 2, 2), [S + 3.5, 2.5, 2.5], [-1, 0, 0], 10)
    expect(hit).toMatchObject({ x: S - 1, y: 2, z: 2, normal: [1, 0, 0] })
  })

  it('works when the origin sits exactly on a voxel boundary', () => {
    const hit = raycastVoxels(single(6, 0, 0), [3, 0.5, 0.5], [1, 0, 0], 10)
    expect(hit).toMatchObject({ x: 6, y: 0, z: 0, normal: [-1, 0, 0], distance: 3 })
  })

  it('respects the range with unnormalised directions', () => {
    expect(raycastVoxels(single(8, 0, 0), [0.5, 0.5, 0.5], [10, 0, 0], 5)).toBeNull()
    expect(raycastVoxels(single(4, 0, 0), [0.5, 0.5, 0.5], [10, 0, 0], 5)?.distance).toBeCloseTo(
      3.5,
      9,
    )
  })

  it('returns the starting voxel with no face when the origin is inside a solid block', () => {
    const hit = raycastVoxels(single(2, 2, 2), [2.5, 2.5, 2.5], [1, 0, 0], 10)
    expect(hit).toEqual({ x: 2, y: 2, z: 2, normal: [0, 0, 0], distance: 0 })
  })
})
