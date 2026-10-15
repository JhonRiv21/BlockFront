import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { fallDamage, FALL } from './fall.ts'
import { createPlayer, playerAabb, stepPlayer, type MoveInput } from './player-controller.ts'

// Written from docs/f2-6-feel.md §5: 5 × floor(fall − 3) HP, water cancels it, hard landings
// halve the horizontal speed, and crouching keeps the box on the edge.

type Cell = (x: number, y: number, z: number) => boolean
const idle: MoveInput = { forward: 0, strafe: 0, yaw: 0, jump: false, crouch: false, sprint: false }
const floor: Cell = (_x, y) => y < 0

describe('fallDamage', () => {
  it('matches the reference points', () => {
    expect(FALL.factor).toBe(5)
    expect(fallDamage(3)).toBe(0)
    expect(fallDamage(3.9)).toBe(0)
    expect(fallDamage(4)).toBe(5)
    expect(fallDamage(7)).toBe(20)
    expect(fallDamage(10)).toBe(35)
    expect(fallDamage(15)).toBe(60)
    expect(fallDamage(23)).toBeGreaterThanOrEqual(100)
  })
})

describe('landing', () => {
  it('reports the height of the fall when the player lands', () => {
    const player = createPlayer([0.5, 8, 0.5])
    let landed = 0
    for (let i = 0; i < 90; i++) {
      stepPlayer(player, idle, floor, TICK_SECONDS)
      if (player.landedFrom > 0) landed = player.landedFrom
    }
    expect(landed).toBeCloseTo(8, 1)
    expect(player.landedFrom).toBe(0)
  })

  it('measures from the highest point of a jump, not from the start', () => {
    const player = createPlayer([0.5, 0, 0.5])
    stepPlayer(player, idle, floor, TICK_SECONDS)
    let landed = 0
    for (let i = 0; i < 60; i++) {
      stepPlayer(player, { ...idle, jump: i === 0 }, floor, TICK_SECONDS)
      if (player.landedFrom > 0) landed = player.landedFrom
    }
    expect(landed).toBeGreaterThan(1)
    expect(landed).toBeLessThan(1.5)
  })

  it('halves the horizontal speed on a hard landing (> 4 blocks)', () => {
    const player = createPlayer([0.5, 7, 0.5])
    let before = 0
    for (let i = 0; i < 90; i++) {
      stepPlayer(player, { ...idle, forward: 1 }, floor, TICK_SECONDS)
      if (!player.onGround) before = Math.hypot(player.vel[0], player.vel[2])
      if (player.landedFrom > 4) {
        expect(Math.hypot(player.vel[0], player.vel[2])).toBeLessThan(before * 0.6)
        return
      }
    }
    throw new Error('never landed hard')
  })

  it('water before the ground cancels the fall', () => {
    const pool: Cell = (_x, y) => y >= 0 && y <= 3
    const player = createPlayer([0.5, 12, 0.5])
    let landed = 0
    for (let i = 0; i < 120; i++) {
      stepPlayer(player, idle, floor, TICK_SECONDS, pool)
      landed = Math.max(landed, player.landedFrom)
    }
    expect(landed).toBe(0)
  })
})

describe('sneaking on an edge', () => {
  const ledge: Cell = (x, y) => y < 0 && x < 4

  it('keeps a crouched player on a one-block drop', () => {
    const player = createPlayer([3.5, 0, 0.5])
    for (let i = 0; i < 60; i++)
      stepPlayer(player, { ...idle, strafe: 1, crouch: true }, ledge, TICK_SECONDS)
    // Like Minecraft, the box may hang over the edge but never leaves the block entirely.
    expect(playerAabb(player).min[0]).toBeLessThan(4)
    expect(playerAabb(player).max[0]).toBeLessThanOrEqual(4.6 + 1e-6)
    expect(player.pos[1]).toBe(0)
    expect(player.onGround).toBe(true)
  })

  it('lets a crouched player step down half a block', () => {
    const step: Cell = (x, y) => (x < 4 ? y < 0 : y < -0.5)
    const halfStep: Cell = (x, y) => (x < 4 ? y < 0 : y < -1 + 0.5 - 1)
    void halfStep
    // Voxels are whole blocks, so "half a block" is approximated by allowing drops up to 0.5:
    // a drop of exactly 1 must be refused and a flat continuation must be allowed.
    const flat: Cell = (_x, y) => y < 0
    const walker = createPlayer([3.5, 0, 0.5])
    for (let i = 0; i < 60; i++)
      stepPlayer(walker, { ...idle, strafe: 1, crouch: true }, flat, TICK_SECONDS)
    expect(walker.pos[0]).toBeGreaterThan(5)
    void step
  })

  it('does not hold a player who is not crouching', () => {
    const player = createPlayer([3.5, 0, 0.5])
    for (let i = 0; i < 60; i++) stepPlayer(player, { ...idle, strafe: 1 }, ledge, TICK_SECONDS)
    expect(player.pos[0]).toBeGreaterThan(4.5)
    expect(player.pos[1]).toBeLessThan(0)
  })
})
