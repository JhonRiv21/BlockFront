import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import {
  createPlayer,
  PLAYER,
  playerAabb,
  stepPlayer,
  type MoveInput,
} from './player-controller.ts'

// Written from the spec: gravity, jump, crouch, sprint, and one-block steps only with a jump.

type Solid = (x: number, y: number, z: number) => boolean
const floor: Solid = (_x, y) => y < 0
const idle: MoveInput = { forward: 0, strafe: 0, yaw: 0, jump: false, crouch: false, sprint: false }

function run(solid: Solid, input: MoveInput, ticks: number, start: [number, number, number]) {
  const player = createPlayer(start)
  for (let i = 0; i < ticks; i++) stepPlayer(player, input, solid, TICK_SECONDS)
  return player
}

describe('stepPlayer', () => {
  it('falls under gravity and rests on the floor', () => {
    const player = run(floor, idle, 90, [0.5, 5, 0.5])
    expect(player.pos[1]).toBe(0)
    expect(player.onGround).toBe(true)
    expect(player.vel[1]).toBe(0)
  })

  it('walks toward -Z with yaw 0 at walk speed, faster when sprinting', () => {
    const walk = run(floor, { ...idle, forward: 1 }, 60, [0.5, 0, 0.5])
    const sprint = run(floor, { ...idle, forward: 1, sprint: true }, 60, [0.5, 0, 0.5])
    expect(walk.pos[2]).toBeLessThan(0.5 - PLAYER.walkSpeed * 1.5)
    expect(walk.pos[0]).toBeCloseTo(0.5, 6)
    expect(sprint.pos[2]).toBeLessThan(walk.pos[2])
  })

  it('strafes right along +X with yaw 0', () => {
    const player = run(floor, { ...idle, strafe: 1 }, 30, [0.5, 0, 0.5])
    expect(player.pos[0]).toBeGreaterThan(2)
    expect(player.pos[2]).toBeCloseTo(0.5, 6)
  })

  it('jumps higher than one block but lower than two, then lands', () => {
    const player = createPlayer([0.5, 0, 0.5])
    stepPlayer(player, idle, floor, TICK_SECONDS)
    let peak = 0
    for (let i = 0; i < 60; i++) {
      stepPlayer(player, { ...idle, jump: i === 0 }, floor, TICK_SECONDS)
      peak = Math.max(peak, player.pos[1])
    }
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(2)
    expect(player.pos[1]).toBe(0)
    expect(player.onGround).toBe(true)
  })

  it('cannot jump while airborne', () => {
    const player = createPlayer([0.5, 6, 0.5])
    stepPlayer(player, { ...idle, jump: true }, floor, TICK_SECONDS)
    expect(player.vel[1]).toBeLessThan(0)
  })

  it('is stopped by a one-block step when walking, and clears it when jumping', () => {
    const step: Solid = (_x, y, z) => y < 0 || (z <= -3 && y < 1)
    const walking = run(step, { ...idle, forward: 1 }, 60, [0.5, 0, 0.5])
    expect(playerAabb(walking).min[2]).toBe(-2)
    expect(walking.pos[1]).toBe(0)

    const jumping = run(step, { ...idle, forward: 1, jump: true }, 90, [0.5, 0, 0.5])
    expect(jumping.pos[1]).toBeGreaterThanOrEqual(1)
    expect(jumping.pos[2]).toBeLessThan(-3)
  })

  it('bumps its head on a low ceiling', () => {
    const ceiling: Solid = (_x, y) => y < 0 || y >= 2
    const player = createPlayer([0.5, 0, 0.5])
    stepPlayer(player, idle, ceiling, TICK_SECONDS)
    let peak = 0
    for (let i = 0; i < 30; i++) {
      stepPlayer(player, { ...idle, jump: i === 0 }, ceiling, TICK_SECONDS)
      peak = Math.max(peak, player.pos[1] + PLAYER.height)
    }
    expect(peak).toBe(2)
  })

  it('crouching lowers the eye and the box and slows down', () => {
    const standing = run(floor, { ...idle, forward: 1 }, 30, [0.5, 0, 0.5])
    const crouched = run(floor, { ...idle, forward: 1, crouch: true }, 30, [0.5, 0, 0.5])
    expect(crouched.crouching).toBe(true)
    expect(playerAabb(crouched).max[1]).toBeLessThan(playerAabb(standing).max[1])
    expect(crouched.eyeHeight).toBeLessThan(standing.eyeHeight)
    expect(crouched.pos[2]).toBeGreaterThan(standing.pos[2])
  })

  it('slides along a wall when walking into it diagonally', () => {
    const wall: Solid = (x, y) => y < 0 || x >= 3
    const player = run(wall, { ...idle, forward: 1, strafe: 1 }, 60, [0.5, 0, 0.5])
    expect(playerAabb(player).max[0]).toBe(3)
    expect(player.pos[2]).toBeLessThan(-2)
  })
})
