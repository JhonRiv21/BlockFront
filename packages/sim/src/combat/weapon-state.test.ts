import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { WEAPONS } from './weapons.ts'
import { createWeaponState, reloadRemaining, stepWeapon, type WeaponInput } from './weapon-state.ts'

// Written from PLAN.md §3: fire interval, magazine / reserve and reload per weapon; the shotgun
// reloads one shell at a time and firing interrupts that reload.

const idle: WeaponInput = { fire: false, firePressed: false, reload: false }
const tap: WeaponInput = { fire: true, firePressed: true, reload: false }
const hold: WeaponInput = { fire: true, firePressed: false, reload: false }

function ticks(seconds: number): number {
  return Math.round(seconds / TICK_SECONDS)
}

describe('magazine and reserve from the table', () => {
  it.each([
    ['rifle', 8, 48],
    ['smg', 30, 120],
    ['shotgun', 6, 36],
    ['sniper', 5, 25],
  ] as const)('%s starts with %i / %i', (weapon, mag, reserve) => {
    const state = createWeaponState(weapon)
    expect(state.mag).toBe(mag)
    expect(state.reserve).toBe(reserve)
  })
})

describe('fire interval', () => {
  it('rifle: a second shot needs 0.5 s', () => {
    const state = createWeaponState('rifle')
    expect(stepWeapon(state, TICK_SECONDS, tap)).toBe('fired')
    let fired = 0
    for (let i = 0; i < ticks(0.4); i++)
      if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
    expect(fired).toBe(0)
    for (let i = 0; i < ticks(0.2); i++)
      if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
    expect(fired).toBe(1)
  })

  it('rifle is semi-automatic: holding the trigger does not fire again', () => {
    const state = createWeaponState('rifle')
    stepWeapon(state, TICK_SECONDS, tap)
    let fired = 0
    for (let i = 0; i < ticks(2); i++)
      if (stepWeapon(state, TICK_SECONDS, hold) === 'fired') fired++
    expect(fired).toBe(0)
  })

  it('smg is automatic: holding fires every 0.1 s', () => {
    const state = createWeaponState('smg')
    let fired = 0
    for (let i = 0; i < ticks(1); i++)
      if (stepWeapon(state, TICK_SECONDS, hold) === 'fired') fired++
    expect(fired).toBeGreaterThanOrEqual(9)
    expect(fired).toBeLessThanOrEqual(10)
  })

  it('shotgun and sniper wait 0.9 s and 1.3 s between shots', () => {
    for (const [weapon, interval] of [
      ['shotgun', 0.9],
      ['sniper', 1.3],
    ] as const) {
      const state = createWeaponState(weapon)
      stepWeapon(state, TICK_SECONDS, tap)
      let fired = 0
      for (let i = 0; i < ticks(interval) - 2; i++)
        if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
      expect(fired).toBe(0)
      for (let i = 0; i < 4; i++) if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
      expect(fired).toBe(1)
    }
  })
})

describe('ammo', () => {
  it('each shot takes one round and an empty magazine reloads by itself', () => {
    const state = createWeaponState('rifle')
    let fired = 0
    for (let i = 0; i < ticks(4); i++) if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
    expect(fired).toBe(8)
    expect(state.mag).toBe(0)
    expect(state.reserve).toBe(48)
    expect(state.reloading).toBe(true)
    for (let t = 0; t < ticks(WEAPONS.rifle.reloadSeconds) + 1; t++)
      stepWeapon(state, TICK_SECONDS, idle)
    expect(state.mag).toBe(8)
    expect(state.reserve).toBe(40)
  })

  it('reload moves rounds from the reserve into the magazine', () => {
    const state = createWeaponState('rifle')
    for (let i = 0; i < 3; i++) {
      stepWeapon(state, TICK_SECONDS, tap)
      for (let t = 0; t < ticks(0.5); t++) stepWeapon(state, TICK_SECONDS, idle)
    }
    expect(state.mag).toBe(5)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    expect(state.reloading).toBe(true)
    for (let t = 0; t < ticks(WEAPONS.rifle.reloadSeconds) + 1; t++)
      stepWeapon(state, TICK_SECONDS, idle)
    expect(state.reloading).toBe(false)
    expect(state.mag).toBe(8)
    expect(state.reserve).toBe(45)
  })

  it('the total number of shots is magazine plus reserve', () => {
    const state = createWeaponState('sniper')
    let fired = 0
    for (let i = 0; i < ticks(120); i++)
      if (stepWeapon(state, TICK_SECONDS, tap) === 'fired') fired++
    expect(fired).toBe(30)
    expect(state.reserve).toBe(0)
    expect(state.mag).toBe(0)
    expect(state.reloading).toBe(false)
  })

  it('does not reload a full magazine or without reserve', () => {
    const full = createWeaponState('smg')
    stepWeapon(full, TICK_SECONDS, { ...idle, reload: true })
    expect(full.reloading).toBe(false)
    const dry = createWeaponState('rifle')
    dry.mag = 0
    dry.reserve = 0
    stepWeapon(dry, TICK_SECONDS, { ...idle, reload: true })
    expect(dry.reloading).toBe(false)
  })
})

describe('shotgun reloads shell by shell', () => {
  it('adds one shell per reload interval until full', () => {
    const state = createWeaponState('shotgun')
    for (let i = 0; i < 3; i++) {
      stepWeapon(state, TICK_SECONDS, tap)
      for (let t = 0; t < ticks(0.9); t++) stepWeapon(state, TICK_SECONDS, idle)
    }
    expect(state.mag).toBe(3)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    for (let t = 0; t < ticks(WEAPONS.shotgun.reloadSeconds); t++)
      stepWeapon(state, TICK_SECONDS, idle)
    expect(state.mag).toBe(4)
    expect(state.reserve).toBe(35)
    expect(state.reloading).toBe(true)
    for (let t = 0; t < ticks(WEAPONS.shotgun.reloadSeconds * 2) + 2; t++)
      stepWeapon(state, TICK_SECONDS, idle)
    expect(state.mag).toBe(6)
    expect(state.reserve).toBe(33)
    expect(state.reloading).toBe(false)
  })

  it('firing interrupts the shell reload and keeps the shells already loaded', () => {
    const state = createWeaponState('shotgun')
    for (let i = 0; i < 4; i++) {
      stepWeapon(state, TICK_SECONDS, tap)
      for (let t = 0; t < ticks(0.9); t++) stepWeapon(state, TICK_SECONDS, idle)
    }
    expect(state.mag).toBe(2)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    for (let t = 0; t < ticks(WEAPONS.shotgun.reloadSeconds) + 1; t++)
      stepWeapon(state, TICK_SECONDS, idle)
    expect(state.mag).toBe(3)
    expect(stepWeapon(state, TICK_SECONDS, tap)).toBe('fired')
    expect(state.reloading).toBe(false)
    expect(state.mag).toBe(2)
  })

  it('a rifle cannot fire in the middle of its reload', () => {
    const state = createWeaponState('rifle')
    stepWeapon(state, TICK_SECONDS, tap)
    for (let t = 0; t < ticks(0.5); t++) stepWeapon(state, TICK_SECONDS, idle)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    for (let t = 0; t < 5; t++) stepWeapon(state, TICK_SECONDS, idle)
    expect(stepWeapon(state, TICK_SECONDS, tap)).toBeNull()
    expect(state.reloading).toBe(true)
  })
})

// docs/f2-5-polish.md §4.4: the pistol is always present as the secondary.
describe('pistol', () => {
  it('starts with 12 / 48, fires at most every 0.18 s and reloads in 1.4 s', () => {
    const state = createWeaponState('pistol')
    expect(state.mag).toBe(12)
    expect(state.reserve).toBe(48)
    expect(WEAPONS.pistol.fireInterval).toBeCloseTo(0.18, 9)
    expect(WEAPONS.pistol.reloadSeconds).toBeCloseTo(1.4, 9)
    expect(WEAPONS.pistol.automatic).toBe(false)
  })
})

// docs/f2-5-polish.md §4.4: the automatic carbine.
describe('carbine', () => {
  it('30 / 90, 0.12 s automatic, reload 2.2 s', () => {
    const state = createWeaponState('carbine')
    expect(state.mag).toBe(30)
    expect(state.reserve).toBe(90)
    expect(WEAPONS.carbine.fireInterval).toBeCloseTo(0.12, 9)
    expect(WEAPONS.carbine.reloadSeconds).toBeCloseTo(2.2, 9)
    expect(WEAPONS.carbine.automatic).toBe(true)
    let fired = 0
    for (let i = 0; i <= ticks(0.36); i++)
      if (stepWeapon(state, TICK_SECONDS, hold) === 'fired') fired++
    expect(fired).toBe(4)
  })
})

// Spec for the reload ring in the HUD: the sim reports how many seconds the reload in progress
// still needs and how long it took in total, so progress = 1 - remaining / total. A shotgun
// reload counts every shell that still fits. The implementation was in context when these
// were written; the expectations come from the weapon table, not from the code.
describe('reload remaining and total', () => {
  it('rifle: 1.8 s at the start, counting down to 0 when the magazine is full again', () => {
    const state = createWeaponState('rifle')
    stepWeapon(state, TICK_SECONDS, tap)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    // The reload begins at the end of the tick that asked for it.
    expect(reloadRemaining(state)).toBeCloseTo(1.8, 5)
    expect(state.reloadTotal).toBeCloseTo(1.8, 5)
    for (let i = 0; i < ticks(1.0); i++) stepWeapon(state, TICK_SECONDS, idle)
    expect(reloadRemaining(state)).toBeCloseTo(0.8, 5)
    for (let i = 0; i < ticks(0.9); i++) stepWeapon(state, TICK_SECONDS, idle)
    expect(state.reloading).toBe(false)
    expect(reloadRemaining(state)).toBe(0)
    expect(state.mag).toBe(WEAPONS.rifle.magazine)
  })

  it('shotgun with two shells missing: the total is two shells, 1.0 s', () => {
    const state = createWeaponState('shotgun')
    stepWeapon(state, TICK_SECONDS, tap)
    for (let i = 0; i < ticks(1.2); i++) stepWeapon(state, TICK_SECONDS, idle)
    stepWeapon(state, TICK_SECONDS, tap)
    stepWeapon(state, TICK_SECONDS, { ...idle, reload: true })
    expect(state.reloadTotal).toBeCloseTo(1.0, 5)
    expect(reloadRemaining(state)).toBeCloseTo(1.0, 5)
    // After the first shell goes in, only the second one is left.
    for (let i = 0; i < ticks(0.5); i++) stepWeapon(state, TICK_SECONDS, idle)
    expect(state.mag).toBe(WEAPONS.shotgun.magazine - 1)
    expect(reloadRemaining(state)).toBeLessThanOrEqual(0.5)
    expect(reloadRemaining(state)).toBeGreaterThan(0.4)
  })

  it('shotgun total is capped by the reserve', () => {
    const state = createWeaponState('shotgun')
    state.mag = 0
    state.reserve = 2
    stepWeapon(state, TICK_SECONDS, idle)
    expect(state.reloadTotal).toBeCloseTo(1.0, 5)
  })

  it('not reloading reports 0', () => {
    expect(reloadRemaining(createWeaponState('smg'))).toBe(0)
  })
})
