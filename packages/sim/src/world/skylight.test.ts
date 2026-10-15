import { describe, expect, it } from 'vitest'
import { WORLD_SIZE } from '../config.ts'
import { BLOCK } from './blocks.ts'
import { computeSkylight, lightIndex, MAX_LIGHT, updateSkylight } from './skylight.ts'
import { World } from './world.ts'

// Written from docs/f2-5-polish.md §1.4 (Seeds of Andromeda): sunlight falls down open columns
// without losing intensity, spreads by BFS losing one per step, and edits re-flood locally.

function flatWorld(groundY = 10): World {
  const world = new World()
  for (let z = 0; z < WORLD_SIZE.z; z++)
    for (let x = 0; x < WORLD_SIZE.x; x++)
      for (let y = 0; y <= groundY; y++)
        world.fillBlock(x, y, z, y === 0 ? BLOCK.bedrock : BLOCK.stone)
  return world
}

const at = (light: Uint8Array, x: number, y: number, z: number) => light[lightIndex(x, y, z)]

// Index of the first differing cell, or -1; toEqual on 1.5 M entries is far too slow.
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i
  return -1
}

describe('computeSkylight', () => {
  it('covers the whole world with values from 0 to 15', () => {
    const light = computeSkylight(flatWorld())
    expect(light.length).toBe(WORLD_SIZE.x * WORLD_SIZE.y * WORLD_SIZE.z)
    expect(MAX_LIGHT).toBe(15)
    let max = 0
    for (const v of light) if (v > max) max = v
    expect(max).toBe(15)
  })

  it('fills open columns with full sunlight all the way down to the ground', () => {
    const light = computeSkylight(flatWorld(10))
    expect(at(light, 20, 63, 20)).toBe(15)
    expect(at(light, 20, 11, 20)).toBe(15)
  })

  it('leaves solid blocks at zero', () => {
    const light = computeSkylight(flatWorld(10))
    expect(at(light, 20, 10, 20)).toBe(0)
    expect(at(light, 20, 0, 20)).toBe(0)
  })

  it('under a roof the light comes from the sides, one less per step', () => {
    const world = flatWorld(10)
    for (let x = 20; x <= 40; x++)
      for (let z = 20; z <= 40; z++) world.fillBlock(x, 14, z, BLOCK.stone)
    const light = computeSkylight(world)
    expect(at(light, 20, 12, 30)).toBe(14)
    expect(at(light, 21, 12, 30)).toBe(13)
    expect(at(light, 30, 12, 30)).toBe(15 - 11)
    expect(at(light, 30, 15, 30)).toBe(15)
  })

  it('a sealed cave is dark', () => {
    const world = flatWorld(20)
    for (let x = 30; x <= 34; x++)
      for (let y = 5; y <= 8; y++)
        for (let z = 30; z <= 34; z++) world.fillBlock(x, y, z, BLOCK.air)
    const light = computeSkylight(world)
    expect(at(light, 32, 6, 32)).toBe(0)
  })

  it('does not let leaves pass light but lets tall grass and water through', () => {
    const world = flatWorld(10)
    world.fillBlock(20, 20, 20, BLOCK.leaves)
    world.fillBlock(30, 20, 30, BLOCK.tallGrass)
    world.fillBlock(40, 20, 40, BLOCK.water)
    const light = computeSkylight(world)
    expect(at(light, 20, 19, 20)).toBeLessThan(15)
    expect(at(light, 30, 19, 30)).toBe(15)
    expect(at(light, 40, 19, 40)).toBe(15)
  })
})

describe('updateSkylight', () => {
  it('darkens the column below a block that was just placed', () => {
    const world = flatWorld(10)
    const light = computeSkylight(world)
    world.fillBlock(50, 30, 50, BLOCK.stone)
    updateSkylight(world, light, 50, 30, 50)
    expect(at(light, 50, 30, 50)).toBe(0)
    expect(at(light, 50, 29, 50)).toBe(14)
    expect(at(light, 50, 31, 50)).toBe(15)
    expect(firstDifference(light, computeSkylight(world))).toBe(-1)
  })

  it('re-lights the column when the block is removed again', () => {
    const world = flatWorld(10)
    world.fillBlock(50, 30, 50, BLOCK.stone)
    const light = computeSkylight(world)
    world.fillBlock(50, 30, 50, BLOCK.air)
    updateSkylight(world, light, 50, 30, 50)
    expect(at(light, 50, 30, 50)).toBe(15)
    expect(at(light, 50, 11, 50)).toBe(15)
    expect(firstDifference(light, computeSkylight(world))).toBe(-1)
  })

  it('opening a hole in a roof lets a sun column into the room below', () => {
    const world = flatWorld(10)
    for (let x = 20; x <= 40; x++)
      for (let z = 20; z <= 40; z++) world.fillBlock(x, 14, z, BLOCK.stone)
    const light = computeSkylight(world)
    expect(at(light, 30, 12, 30)).toBe(4)
    world.fillBlock(30, 14, 30, BLOCK.air)
    updateSkylight(world, light, 30, 14, 30)
    expect(at(light, 30, 12, 30)).toBe(15)
    expect(at(light, 31, 12, 30)).toBe(14)
    expect(firstDifference(light, computeSkylight(world))).toBe(-1)
  })

  it('digging into the ground lights the new hole', () => {
    const world = flatWorld(10)
    const light = computeSkylight(world)
    world.fillBlock(60, 10, 60, BLOCK.air)
    updateSkylight(world, light, 60, 10, 60)
    expect(at(light, 60, 10, 60)).toBe(15)
    world.fillBlock(60, 9, 60, BLOCK.air)
    updateSkylight(world, light, 60, 9, 60)
    expect(at(light, 60, 9, 60)).toBe(15)
    world.fillBlock(61, 9, 60, BLOCK.air)
    updateSkylight(world, light, 61, 9, 60)
    expect(at(light, 61, 9, 60)).toBe(14)
    expect(firstDifference(light, computeSkylight(world))).toBe(-1)
  })
})
