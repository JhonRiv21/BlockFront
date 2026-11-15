import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { stepGrenade, type GrenadeEntity } from './grenade.ts'
import { CHARGE } from './grenade.ts'

// Written from Jhon's playtest (2026-11-14): a grenade thrown into a group must stay with the
// group, not bounce and roll far beyond it. Settles within 2 blocks of where it first lands, and
// a wall sends it back only a little.

const floor = (_x: number, y: number) => y < 0

function firstLandingAndRest(grenade: GrenadeEntity, isSolid = floor) {
  let landing: number[] | null = null
  while (grenade.fuse > 0) {
    const vy = grenade.vel[1]
    stepGrenade(grenade, isSolid, TICK_SECONDS)
    if (!landing && vy < 0 && grenade.vel[1] >= 0) landing = [...grenade.pos]
  }
  return { landing: landing!, rest: grenade.pos }
}

const horizontal = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!)

describe('grenade bounce', () => {
  it('a full-power throw settles within 2 blocks of its first landing', () => {
    const speed = CHARGE.maxSpeed
    const grenade: GrenadeEntity = {
      id: 1,
      owner: 1,
      pos: [0.5, 1.6, 0.5],
      vel: [speed * Math.cos(0.3), speed * Math.sin(0.3), 0],
      fuse: 3,
    }
    const { landing, rest } = firstLandingAndRest(grenade)
    expect(horizontal(landing, rest)).toBeLessThanOrEqual(2)
  })

  it('a flat, fast throw along the ground also stops within 2 blocks of where it lands', () => {
    const grenade: GrenadeEntity = {
      id: 1,
      owner: 1,
      pos: [0.5, 1.6, 0.5],
      vel: [CHARGE.maxSpeed, 0, 0],
      fuse: 3,
    }
    const { landing, rest } = firstLandingAndRest(grenade)
    expect(horizontal(landing, rest)).toBeLessThanOrEqual(2)
  })

  it('comes back off a wall by less than 2 blocks', () => {
    // A wall at x >= 5.
    const walled = (x: number, y: number) => y < 0 || x >= 5
    const grenade: GrenadeEntity = {
      id: 1,
      owner: 1,
      pos: [0.5, 1.6, 0.5],
      vel: [CHARGE.maxSpeed, 2, 0],
      fuse: 3,
    }
    while (grenade.fuse > 0) stepGrenade(grenade, walled, TICK_SECONDS)
    expect(grenade.pos[0]).toBeGreaterThan(5 - 2)
  })
})
