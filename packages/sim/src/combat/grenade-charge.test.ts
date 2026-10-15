import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { GRENADE } from './weapons.ts'
import {
  chargePower,
  predictArc,
  stepGrenade,
  throwSpeed,
  throwVelocity,
  type GrenadeEntity,
} from './grenade.ts'

// Written from docs/f2-6-feel.md §4: one key, charge then cook; Minecraft bow curve for the
// power; +8° up and the player's speed on release; the predicted arc is the sim's own step.

describe('charge', () => {
  it('follows f = min(1, t / 0.8), p = (f² + 2f) / 3 and v = lerp(9, 24, p)', () => {
    expect(chargePower(0)).toBe(0)
    expect(throwSpeed(0)).toBeCloseTo(9, 9)
    const f = 0.5
    expect(chargePower(0.4)).toBeCloseTo((f * f + 2 * f) / 3, 9)
    expect(throwSpeed(0.4)).toBeCloseTo(9 + 15 * ((f * f + 2 * f) / 3), 9)
    expect(chargePower(0.8)).toBe(1)
    expect(throwSpeed(0.8)).toBeCloseTo(24, 9)
    expect(throwSpeed(2.5)).toBeCloseTo(24, 9)
    expect(GRENADE.fuse).toBe(3)
  })

  it('adds the player velocity and tilts the throw 8° up', () => {
    const v = throwVelocity(0, 0, 24, [2, 0, 0], false)
    // Facing -Z from yaw 0: the horizontal part points down -Z and the pitch is +8°.
    expect(v[0]).toBeCloseTo(2, 6)
    expect(v[2]).toBeCloseTo(-24 * Math.cos((8 * Math.PI) / 180), 6)
    expect(v[1]).toBeCloseTo(24 * Math.sin((8 * Math.PI) / 180), 6)
  })

  it('underhand throws go out at 7 m/s', () => {
    const v = throwVelocity(0, 0, 24, [0, 0, 0], true)
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(7, 6)
  })
})

describe('predictArc', () => {
  it('reproduces the simulated trajectory step by step', () => {
    const floor = (_x: number, y: number) => y < 0
    const grenade: GrenadeEntity = {
      id: 1,
      owner: 1,
      pos: [0.5, 5, 0.5],
      vel: [6, 8, -10],
      fuse: 2.5,
    }
    const arc = predictArc(grenade, floor, 180)
    const twin: GrenadeEntity = { ...grenade, pos: [...grenade.pos], vel: [...grenade.vel] }
    for (const point of arc.points) {
      stepGrenade(twin, floor, TICK_SECONDS)
      expect(point).toEqual(twin.pos)
    }
    expect(arc.points.length).toBeGreaterThan(10)
    expect(arc.points.length).toBeLessThanOrEqual(180)
  })

  it('says whether the fuse runs out in the air or on the ground', () => {
    const floor = (_x: number, y: number) => y < 0
    const air = predictArc(
      { id: 1, owner: 1, pos: [0.5, 30, 0.5], vel: [0, 12, 0], fuse: 0.5 },
      floor,
      180,
    )
    expect(air.inAir).toBe(true)
    const ground = predictArc(
      { id: 1, owner: 1, pos: [0.5, 2, 0.5], vel: [3, 0, 0], fuse: 2.9 },
      floor,
      180,
    )
    expect(ground.inAir).toBe(false)
  })
})
