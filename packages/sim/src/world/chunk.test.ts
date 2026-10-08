import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE } from '../config.ts'
import { Chunk, CHUNK_VOLUME, chunkIndex } from './chunk.ts'

// Written from the spec: x + y * S + z * S * S, data in a Uint8Array of S^3.

describe('chunkIndex', () => {
  it('uses x + y * S + z * S * S', () => {
    const S = CHUNK_SIZE
    expect(chunkIndex(0, 0, 0)).toBe(0)
    expect(chunkIndex(1, 0, 0)).toBe(1)
    expect(chunkIndex(0, 1, 0)).toBe(S)
    expect(chunkIndex(0, 0, 1)).toBe(S * S)
    expect(chunkIndex(S - 1, S - 1, S - 1)).toBe(S * S * S - 1)
  })

  it('maps every voxel to a unique slot', () => {
    const seen = new Uint8Array(CHUNK_VOLUME)
    for (let z = 0; z < CHUNK_SIZE; z++)
      for (let y = 0; y < CHUNK_SIZE; y++)
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const i = chunkIndex(x, y, z)
          expect(seen[i]).toBe(0)
          seen[i] = 1
        }
  })
})

describe('Chunk', () => {
  it('starts empty and stores bytes', () => {
    const chunk = new Chunk()
    expect(chunk.data).toBeInstanceOf(Uint8Array)
    expect(chunk.data.length).toBe(CHUNK_VOLUME)
    expect(chunk.get(5, 6, 7)).toBe(0)
    chunk.set(5, 6, 7, 42)
    expect(chunk.get(5, 6, 7)).toBe(42)
    expect(chunk.data[chunkIndex(5, 6, 7)]).toBe(42)
  })

  it('keeps the corners apart', () => {
    const chunk = new Chunk()
    const S = CHUNK_SIZE - 1
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [S, 0, 0],
      [0, S, 0],
      [0, 0, S],
      [S, S, 0],
      [S, 0, S],
      [0, S, S],
      [S, S, S],
    ]
    corners.forEach(([x, y, z], i) => chunk.set(x, y, z, i + 1))
    corners.forEach(([x, y, z], i) => expect(chunk.get(x, y, z)).toBe(i + 1))
  })

  it('does not bleed across the x edge into the next row', () => {
    const chunk = new Chunk()
    chunk.set(CHUNK_SIZE - 1, 0, 0, 9)
    expect(chunk.get(0, 1, 0)).toBe(0)
    chunk.set(CHUNK_SIZE - 1, CHUNK_SIZE - 1, 0, 8)
    expect(chunk.get(0, 0, 1)).toBe(0)
  })
})
