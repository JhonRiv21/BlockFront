import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE, WORLD_SIZE } from '../config.ts'
import { World } from './world.ts'

// Written from the spec: global get/set, air outside the world, dirty chunk marks,
// and padded chunk copies that include the neighbours' borders.

describe('World', () => {
  it('has one chunk per 32^3 cell of the world', () => {
    const world = new World()
    expect(world.chunksX).toBe(WORLD_SIZE.x / CHUNK_SIZE)
    expect(world.chunksY).toBe(WORLD_SIZE.y / CHUNK_SIZE)
    expect(world.chunksZ).toBe(WORLD_SIZE.z / CHUNK_SIZE)
  })

  it('reads and writes with global coordinates across chunk borders', () => {
    const world = new World()
    world.setBlock(CHUNK_SIZE, 3, 2 * CHUNK_SIZE + 1, 7)
    expect(world.getBlock(CHUNK_SIZE, 3, 2 * CHUNK_SIZE + 1)).toBe(7)
    expect(world.getBlock(CHUNK_SIZE - 1, 3, 2 * CHUNK_SIZE + 1)).toBe(0)
    expect(world.getChunk(1, 0, 2).get(0, 3, 1)).toBe(7)
  })

  it('treats everything outside the world as air and ignores writes there', () => {
    const world = new World()
    expect(world.getBlock(-1, 0, 0)).toBe(0)
    expect(world.getBlock(WORLD_SIZE.x, 0, 0)).toBe(0)
    expect(world.getBlock(0, WORLD_SIZE.y, 0)).toBe(0)
    expect(world.getBlock(0, 0, -1)).toBe(0)
    world.setBlock(-1, 0, 0, 5)
    world.setBlock(0, -1, 0, 5)
    expect(world.getBlock(0, 0, 0)).toBe(0)
  })

  it('marks only the touched chunk dirty for an interior write', () => {
    const world = new World()
    world.setBlock(5, 5, 5, 1)
    expect(world.takeDirtyChunks()).toEqual([{ cx: 0, cy: 0, cz: 0 }])
    expect(world.takeDirtyChunks()).toEqual([])
  })

  it('marks the neighbours too when writing on a chunk border', () => {
    const world = new World()
    world.setBlock(CHUNK_SIZE, 0, 10, 1)
    const dirty = world.takeDirtyChunks().map(({ cx, cy, cz }) => `${cx},${cy},${cz}`)
    expect(dirty.sort()).toEqual(['0,0,0', '1,0,0'].sort())
  })

  it('copies a chunk with a one-voxel border taken from the neighbours', () => {
    const world = new World()
    world.setBlock(CHUNK_SIZE, 10, 10, 3)
    world.setBlock(CHUNK_SIZE - 1, 10, 10, 4)
    const padded = world.copyPaddedChunk(0, 0, 0)
    const P = CHUNK_SIZE + 2
    expect(padded.length).toBe(P * P * P)
    expect(padded[CHUNK_SIZE + 1 + 11 * P + 11 * P * P]).toBe(3)
    expect(padded[CHUNK_SIZE + 11 * P + 11 * P * P]).toBe(4)
  })
})
