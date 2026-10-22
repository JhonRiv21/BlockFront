import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import {
  createPlayer,
  PLAYER,
  playerAabb,
  stepPlayer,
  type MoveInput,
} from './player-controller.ts'
import { submergedRatio } from './water.ts'

// Written from docs/f2-5-polish.md §2.4: Minecraft-style swimming converted to our tick.

type Cell = (x: number, y: number, z: number) => boolean
const idle: MoveInput = { forward: 0, strafe: 0, yaw: 0, jump: false, crouch: false, sprint: false }
// Pool: floor at y < 0, water from y = 0 to 4 (surface at 4.889), walls far away.
const floor: Cell = (_x, y) => y < 0
const pool: Cell = (_x, y) => y >= 0 && y <= 4

function run(
  solid: Cell,
  liquid: Cell,
  input: MoveInput,
  ticks: number,
  start: [number, number, number],
) {
  const player = createPlayer(start)
  for (let i = 0; i < ticks; i++) stepPlayer(player, input, solid, TICK_SECONDS, liquid)
  return player
}

describe('submergedRatio', () => {
  it('is 0 out of water, 1 fully under and in between at the surface', () => {
    const dry = createPlayer([0.5, 10, 0.5])
    expect(submergedRatio(playerAabb(dry), pool)).toBe(0)
    const under = createPlayer([0.5, 0.5, 0.5])
    expect(submergedRatio(playerAabb(under), pool)).toBeCloseTo(1, 6)
    // Feet at 4: only the bottom 0.889 of the 1.8 box is wet.
    const surface = createPlayer([0.5, 4, 0.5])
    expect(submergedRatio(playerAabb(surface), pool)).toBeCloseTo(0.889 / PLAYER.height, 2)
  })

  it('reads the right column on both sides of a chunk border', () => {
    const halfPool: Cell = (x, y) => x >= 32 && y >= 0 && y <= 4
    expect(submergedRatio(playerAabb(createPlayer([31.5, 1, 0.5])), halfPool)).toBe(0)
    expect(submergedRatio(playerAabb(createPlayer([32.5, 1, 0.5])), halfPool)).toBeCloseTo(1, 6)
  })
})

describe('swimming', () => {
  it('sinks slowly without input and does not fall like on land', () => {
    const player = run(floor, pool, idle, 60, [0.5, 4, 0.5])
    expect(player.pos[1]).toBeLessThan(4)
    expect(player.pos[1]).toBeGreaterThan(1.5)
    expect(player.inWater).toBe(true)
  })

  it('rises while holding jump and stays at the surface instead of flying out', () => {
    const player = run(floor, pool, { ...idle, jump: true }, 150, [0.5, 0, 0.5])
    expect(player.pos[1]).toBeGreaterThan(3)
    expect(player.pos[1]).toBeLessThan(5.2)
    expect(player.eyeInWater).toBe(false)
  })

  it('wades at about 2.2 blocks/s without sprint', () => {
    const swim = run(floor, pool, { ...idle, forward: 1 }, 60, [0.5, 1, 0.5])
    expect(0.5 - swim.pos[2]).toBeLessThan(2.4 * 2)
    expect(0.5 - swim.pos[2]).toBeGreaterThan(1.6 * 2)
  })

  // Minecraft 1.13 sprint-swimming: sprint + forward glides at ~5.6 blocks/s along the gaze.
  it('sprint-swims at about 5.6 blocks/s and holds the surface with a level gaze', () => {
    const swim = run(floor, pool, { ...idle, forward: 1, sprint: true }, 60, [0.5, 3.6, 0.5])
    expect(0.5 - swim.pos[2]).toBeGreaterThan(4.6 * 2)
    expect(0.5 - swim.pos[2]).toBeLessThan(6 * 2)
    expect(swim.pos[1]).toBeGreaterThan(3.3)
    expect(swim.inWater).toBe(true)
  })

  it('looking down while sprint-swimming dives, looking up surfaces', () => {
    const dive = run(
      floor,
      pool,
      { ...idle, forward: 1, sprint: true, pitch: -0.8 },
      30,
      [0.5, 3.6, 0.5],
    )
    expect(dive.pos[1]).toBeLessThan(2)
    const up = run(
      floor,
      pool,
      { ...idle, forward: 1, sprint: true, pitch: 0.8 },
      40,
      [0.5, 0.5, 0.5],
    )
    expect(up.pos[1]).toBeGreaterThan(3)
  })

  it('sprint alone (no forward) does not swim faster', () => {
    const still = run(floor, pool, { ...idle, sprint: true }, 60, [0.5, 2, 0.5])
    expect(Math.abs(still.pos[2] - 0.5)).toBeLessThan(0.01)
  })

  it('climbs out over a one-block edge when pushing against it', () => {
    const bank: Cell = (_x, y, z) => y < 0 || (z <= -3 && y < 5)
    const player = createPlayer([0.5, 4, -1.5])
    for (let i = 0; i < 90; i++)
      stepPlayer(player, { ...idle, forward: 1, jump: true }, bank, TICK_SECONDS, pool)
    expect(player.pos[1]).toBeGreaterThanOrEqual(5)
    expect(player.pos[2]).toBeLessThan(-3)
  })

  it('crouching sinks faster', () => {
    const plain = run(floor, pool, idle, 40, [0.5, 4, 0.5])
    const crouched = run(floor, pool, { ...idle, crouch: true }, 40, [0.5, 4, 0.5])
    expect(crouched.pos[1]).toBeLessThan(plain.pos[1])
  })

  it('reports the eye under water by the eye voxel, below the 8/9 surface', () => {
    const under = run(floor, pool, idle, 1, [0.5, 1, 0.5])
    expect(under.eyeInWater).toBe(true)
    const surfaceEye = createPlayer([0.5, 3.4, 0.5])
    stepPlayer(surfaceEye, idle, floor, TICK_SECONDS, pool)
    // Eye at 3.4 + 1.62 = 5.02 > 4.889: out of the water.
    expect(surfaceEye.eyeInWater).toBe(false)
  })
})
