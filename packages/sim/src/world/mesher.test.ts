import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE } from '../config.ts'
import { meshChunk, paddedIndex, PADDED_SIZE } from './mesher.ts'

// Written from the spec: greedy meshing with per-vertex AO over a chunk padded with one voxel
// from each neighbour. Faces only merge when color and AO pattern match.

const S = CHUNK_SIZE

function emptyPadded(): Uint8Array {
  return new Uint8Array(PADDED_SIZE * PADDED_SIZE * PADDED_SIZE)
}

function fillBox(
  voxels: Uint8Array,
  [x0, y0, z0]: [number, number, number],
  [x1, y1, z1]: [number, number, number],
  id: number,
): void {
  for (let z = z0; z < z1; z++)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) voxels[paddedIndex(x, y, z)] = id
}

describe('paddedIndex', () => {
  it('covers -1..S on every axis', () => {
    expect(paddedIndex(-1, -1, -1)).toBe(0)
    expect(paddedIndex(S, S, S)).toBe(PADDED_SIZE ** 3 - 1)
    expect(paddedIndex(0, 0, 0)).toBe(1 + PADDED_SIZE + PADDED_SIZE * PADDED_SIZE)
  })
})

describe('meshChunk', () => {
  it('returns nothing for an empty chunk', () => {
    const mesh = meshChunk(emptyPadded())
    expect(mesh.quadCount).toBe(0)
    expect(mesh.indices.length).toBe(0)
    expect(mesh.positions.length).toBe(0)
  })

  it('meshes a single cube as 6 quads', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [4, 4, 4], [5, 5, 5], 2)
    const mesh = meshChunk(voxels)
    expect(mesh.quadCount).toBe(6)
    expect(mesh.positions.length).toBe(6 * 4 * 3)
    expect(mesh.indices.length).toBe(6 * 6)
    expect(mesh.normals.length).toBe(6 * 4 * 3)
    expect(mesh.blockIds.length).toBe(6 * 4)
    expect(mesh.ao.length).toBe(6 * 4)
    expect(Array.from(mesh.blockIds).every((id) => id === 2)).toBe(true)
    // Nothing around the cube: every vertex is fully lit.
    expect(Array.from(mesh.ao).every((ao) => ao === 3)).toBe(true)
  })

  it('merges a flat slab into 6 quads', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [0, 0, 0], [S, 1, S], 4)
    const mesh = meshChunk(voxels)
    expect(mesh.quadCount).toBe(6)
  })

  it('does not merge faces of different colors', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [0, 0, 0], [S / 2, 1, S], 4)
    fillBox(voxels, [S / 2, 0, 0], [S, 1, S], 5)
    const mesh = meshChunk(voxels)
    // Top and bottom split in two, the two long sides split in two, the two short ends stay whole.
    expect(mesh.quadCount).toBe(10)
  })

  it('leaves no internal faces between two touching full chunks', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [0, 0, 0], [S, S, S], 2)
    expect(meshChunk(voxels).quadCount).toBe(6)
    // Neighbour on +X is solid: that side is hidden.
    fillBox(voxels, [S, 0, 0], [S + 1, S, S], 2)
    const mesh = meshChunk(voxels)
    expect(mesh.quadCount).toBe(5)
    for (let v = 0; v < mesh.normals.length; v += 3) expect(mesh.normals[v]).not.toBe(1)
  })

  it('hides the bottom when the neighbour below is solid', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [0, 0, 0], [S, 1, S], 4)
    fillBox(voxels, [-1, -1, -1], [S + 1, 0, S + 1], 1)
    expect(meshChunk(voxels).quadCount).toBe(5)
  })

  it('darkens vertices next to a neighbouring block and splits the merge there', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [0, 0, 0], [S, 1, S], 4)
    fillBox(voxels, [10, 1, 10], [11, 2, 11], 2)
    const mesh = meshChunk(voxels)
    const aoValues = new Set(Array.from(mesh.ao))
    expect(aoValues.has(3)).toBe(true)
    expect(Math.min(...aoValues)).toBeLessThan(3)
    expect(mesh.quadCount).toBeGreaterThan(12)
    for (const ao of mesh.ao) expect(ao >= 0 && ao <= 3).toBe(true)
  })

  it('winds every face so the triangle normal matches the stored normal', () => {
    const voxels = emptyPadded()
    fillBox(voxels, [4, 4, 4], [6, 5, 7], 2)
    const { positions, normals, indices } = meshChunk(voxels)
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!]
      const p = (i: number, k: number) => positions[i * 3 + k]!
      const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)]
      const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)]
      const cross = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ]
      const dot =
        cross[0]! * normals[a * 3]! +
        cross[1]! * normals[a * 3 + 1]! +
        cross[2]! * normals[a * 3 + 2]!
      expect(dot).toBeGreaterThan(0)
    }
  })
})
