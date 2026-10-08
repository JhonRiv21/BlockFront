import { describe, expect, it } from 'vitest'
import { BLOCK } from '../world/palette.ts'
import { World } from '../world/world.ts'
import { BlockHealth, BLOCK_HP, explodeBlocks } from './blocks.ts'

// Written from PLAN.md §3: blocks have 100 HP tracked only for damaged blocks; a grenade breaks
// a sphere of radius 2; bedrock is indestructible.

function solidWorld(): World {
  const world = new World()
  for (let z = 0; z < 24; z++)
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++) world.fillBlock(x, y, z, y === 0 ? BLOCK.bedrock : BLOCK.stone)
  return world
}

describe('BlockHealth', () => {
  it('starts every block at 100 and only stores damaged ones', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    expect(BLOCK_HP).toBe(100)
    expect(health.get(5, 5, 5)).toBe(100)
    expect(health.size).toBe(0)
    expect(health.damage(5, 5, 5, 55)).toBe(false)
    expect(health.get(5, 5, 5)).toBe(45)
    expect(health.size).toBe(1)
  })

  it('removes the block when its HP reaches zero and forgets it', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    health.damage(5, 5, 5, 55)
    expect(health.damage(5, 5, 5, 55)).toBe(true)
    expect(world.getBlock(5, 5, 5)).toBe(BLOCK.air)
    expect(health.size).toBe(0)
    expect(health.get(5, 5, 5)).toBe(100)
  })

  it('never damages bedrock or air', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    expect(health.damage(5, 0, 5, 1000)).toBe(false)
    expect(world.getBlock(5, 0, 5)).toBe(BLOCK.bedrock)
    world.setBlock(6, 6, 6, BLOCK.air)
    expect(health.damage(6, 6, 6, 50)).toBe(false)
    expect(health.size).toBe(0)
  })

  it('a replaced block starts fresh', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    health.damage(5, 5, 5, 55)
    health.damage(5, 5, 5, 55)
    world.setBlock(5, 5, 5, BLOCK.blue)
    expect(health.get(5, 5, 5)).toBe(100)
  })
})

describe('explodeBlocks', () => {
  it('breaks every block within radius 2 of the center and nothing beyond', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    const center: [number, number, number] = [10.5, 10.5, 10.5]
    const broken = explodeBlocks(world, health, center, 2)
    for (let z = 6; z < 15; z++)
      for (let y = 6; y < 15; y++)
        for (let x = 6; x < 15; x++) {
          const d = Math.hypot(x + 0.5 - center[0], y + 0.5 - center[1], z + 0.5 - center[2])
          expect(world.getBlock(x, y, z) === BLOCK.air).toBe(d <= 2)
        }
    expect(broken.length).toBe(33)
  })

  it('leaves bedrock in place and ignores the world edge', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    explodeBlocks(world, health, [0.5, 1.5, 0.5], 2)
    expect(world.getBlock(0, 0, 0)).toBe(BLOCK.bedrock)
    expect(world.getBlock(0, 1, 0)).toBe(BLOCK.air)
    expect(world.getBlock(0, 3, 0)).toBe(BLOCK.air)
    expect(world.getBlock(0, 4, 0)).toBe(BLOCK.stone)
  })

  it('drops the stored damage of broken blocks', () => {
    const world = solidWorld()
    const health = new BlockHealth(world)
    health.damage(10, 10, 10, 20)
    explodeBlocks(world, health, [10.5, 10.5, 10.5], 2)
    expect(health.size).toBe(0)
  })
})
