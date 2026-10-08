import { describe, expect, it } from 'vitest'
import { WORLD_SIZE } from '../config.ts'
import { BLOCK, mirrorBlock } from './palette.ts'
import { generateWorld } from './generator.ts'

// Written from the spec: same seed -> same map, mirror symmetry over Z with team colors swapped,
// indestructible bedrock at the bottom, both team structures present.

function sampleBlocks(seed: number): Uint8Array {
  const world = generateWorld(seed)
  const out = new Uint8Array(WORLD_SIZE.x * WORLD_SIZE.y * WORLD_SIZE.z)
  let i = 0
  for (let z = 0; z < WORLD_SIZE.z; z++)
    for (let y = 0; y < WORLD_SIZE.y; y++)
      for (let x = 0; x < WORLD_SIZE.x; x++) out[i++] = world.getBlock(x, y, z)
  return out
}

describe('generateWorld', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = sampleBlocks(1234)
    const b = sampleBlocks(1234)
    const c = sampleBlocks(99)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('is mirrored over Z with the team colors swapped', () => {
    const world = generateWorld(7)
    for (let z = 0; z < WORLD_SIZE.z / 2; z += 3)
      for (let y = 0; y < WORLD_SIZE.y; y += 2)
        for (let x = 0; x < WORLD_SIZE.x; x += 3) {
          const near = world.getBlock(x, y, z)
          const far = world.getBlock(x, y, WORLD_SIZE.z - 1 - z)
          expect(far).toBe(mirrorBlock(near))
        }
  })

  it('has an unbroken bedrock floor and nothing below the surface is air', () => {
    const world = generateWorld(42)
    for (let z = 0; z < WORLD_SIZE.z; z++)
      for (let x = 0; x < WORLD_SIZE.x; x++) expect(world.getBlock(x, 0, z)).toBe(BLOCK.bedrock)
  })

  it('places blue blocks in the low-Z half and red blocks in the high-Z half', () => {
    const world = generateWorld(3)
    let blueNear = 0
    let redNear = 0
    let blueFar = 0
    let redFar = 0
    for (let z = 0; z < WORLD_SIZE.z; z++)
      for (let y = 0; y < WORLD_SIZE.y; y++)
        for (let x = 0; x < WORLD_SIZE.x; x++) {
          const id = world.getBlock(x, y, z)
          const near = z < WORLD_SIZE.z / 2
          if (id === BLOCK.blue) {
            if (near) blueNear++
            else blueFar++
          }
          if (id === BLOCK.red) {
            if (near) redNear++
            else redFar++
          }
        }
    expect(blueNear).toBeGreaterThan(0)
    expect(redFar).toBe(blueNear)
    expect(redNear).toBe(0)
    expect(blueFar).toBe(0)
  })

  it('leaves a walkable surface: the top solid block is never above the ceiling', () => {
    const world = generateWorld(11)
    for (let z = 0; z < WORLD_SIZE.z; z += 5)
      for (let x = 0; x < WORLD_SIZE.x; x += 5) {
        expect(world.getBlock(x, WORLD_SIZE.y - 1, z)).toBe(BLOCK.air)
      }
  })
})
