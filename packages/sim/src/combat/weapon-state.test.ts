import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { WEAPONS } from './weapons.ts'
import { createWeaponState, stepWeapon, type WeaponInput } from './weapon-state.ts'

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
