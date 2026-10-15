import { describe, expect, it } from 'vitest'
import { WORLD_SIZE } from '../config.ts'
import { BLOCK, mirrorBlock } from './blocks.ts'
import { generateWorld, TERRAIN } from './generator.ts'
import type { World } from './world.ts'

// Written from docs/f2-5-polish.md §1.3: trees on a jittered grid driven by integer hashes,
// never inside the bases or the flag corridor, mirrored over Z; trunks of 4–6 logs with a
// canopy; tall grass and flowers as cross blocks on grass, at most one block tall.

function trunks(world: World): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let z = 0; z < WORLD_SIZE.z; z++)
    for (let x = 0; x < WORLD_SIZE.x; x++)
      for (let y = 1; y < WORLD_SIZE.y; y++) {
        if (world.getBlock(x, y, z) === BLOCK.log && world.getBlock(x, y - 1, z) !== BLOCK.log) {
          out.push([x, y, z])
          break
        }
      }
  return out
}

describe('trees', () => {
  it('exist and are the same for the same seed', () => {
    const a = trunks(generateWorld(5))
    const b = trunks(generateWorld(5))
    expect(a.length).toBeGreaterThan(10)
    expect(a).toEqual(b)
    expect(trunks(generateWorld(6))).not.toEqual(a)
  })

  it('have trunks of 4 to 6 logs on a solid block with leaves above', () => {
    const world = generateWorld(5)
    for (const [x, y, z] of trunks(world)) {
      let height = 0
      while (world.getBlock(x, y + height, z) === BLOCK.log) height++
      expect(height).toBeGreaterThanOrEqual(4)
      expect(height).toBeLessThanOrEqual(6)
      expect(world.getBlock(x, y - 1, z)).not.toBe(BLOCK.air)
      expect(world.getBlock(x, y + height, z)).toBe(BLOCK.leaves)
      expect(world.getBlock(x + 1, y + height - 1, z)).toBe(BLOCK.leaves)
    }
  })

  it('are mirrored over Z like everything else', () => {
    const world = generateWorld(5)
    for (const [x, y, z] of trunks(world)) {
      expect(world.getBlock(x, y, WORLD_SIZE.z - 1 - z)).toBe(mirrorBlock(BLOCK.log))
    }
  })

  it('never grow inside a base or in the corridor between the flags', () => {
    const world = generateWorld(5)
    const midX = WORLD_SIZE.x / 2
    for (const [x, , z] of trunks(world)) {
      const zNear = Math.min(z, WORLD_SIZE.z - 1 - z)
      const dz = zNear - TERRAIN.baseCenterZ
      const dx = x - midX
      expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(TERRAIN.baseRadius)
      expect(Math.abs(x + 0.5 - midX)).toBeGreaterThan(4)
    }
  })

  it('keep a few blocks between neighbouring trunks', () => {
    const list = trunks(generateWorld(5))
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [ax, , az] = list[i]!
        const [bx, , bz] = list[j]!
        expect(Math.max(Math.abs(ax - bx), Math.abs(az - bz))).toBeGreaterThanOrEqual(3)
      }
  })
})

describe('tall grass and flowers', () => {
  it('stand on grass, one block tall, with air above', () => {
    const world = generateWorld(5)
    let count = 0
    for (let z = 0; z < WORLD_SIZE.z; z++)
      for (let x = 0; x < WORLD_SIZE.x; x++)
        for (let y = 1; y < WORLD_SIZE.y - 1; y++) {
          const id = world.getBlock(x, y, z)
          if (id !== BLOCK.tallGrass && id !== BLOCK.flower && id !== BLOCK.flowerYellow) continue
          count++
          expect(world.getBlock(x, y - 1, z)).toBe(BLOCK.grass)
          expect(world.getBlock(x, y + 1, z)).toBe(BLOCK.air)
        }
    expect(count).toBeGreaterThan(50)
  })
})
