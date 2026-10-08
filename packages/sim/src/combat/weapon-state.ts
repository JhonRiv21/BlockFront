import { CROUCH_SPREAD_FACTOR, WEAPONS, type WeaponId } from './weapons.ts'

export interface WeaponState {
  weapon: WeaponId
  mag: number
  reserve: number
  cooldown: number
  reloading: boolean
  reloadLeft: number
  // Consecutive-fire heat in shots; decays over time and widens the spread.
  heat: number
}

export interface WeaponInput {
  fire: boolean
  firePressed: boolean
  reload: boolean
}

const EPSILON = 1e-6

export function createWeaponState(weapon: WeaponId): WeaponState {
  const spec = WEAPONS[weapon]
  return {
    weapon,
    mag: spec.magazine,
    reserve: spec.reserve,
    cooldown: 0,
    reloading: false,
    reloadLeft: 0,
    heat: 0,
  }
}

function loadRounds(state: WeaponState, count: number): void {
  const spec = WEAPONS[state.weapon]
  const loaded = Math.min(count, spec.magazine - state.mag, state.reserve)
  state.mag += loaded
  state.reserve -= loaded
}

// Advances timers and applies the trigger and reload inputs for one tick.
export function stepWeapon(state: WeaponState, dt: number, input: WeaponInput): 'fired' | null {
  const spec = WEAPONS[state.weapon]
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.heat = Math.max(0, state.heat - spec.spread.recoveryPerSecond * dt)

  if (state.reloading) {
    state.reloadLeft -= dt
    if (state.reloadLeft <= EPSILON) {
      if (spec.reloadPerShell) {
        loadRounds(state, 1)
        if (state.mag < spec.magazine && state.reserve > 0) state.reloadLeft = spec.reloadSeconds
        else state.reloading = false
      } else {
        loadRounds(state, spec.magazine)
        state.reloading = false
      }
    }
  }

  const wantsFire = spec.automatic ? input.fire : input.firePressed
  let fired: 'fired' | null = null
  if (wantsFire && state.cooldown <= EPSILON && state.mag > 0) {
    if (state.reloading && !spec.reloadPerShell) return null
    state.reloading = false
    state.mag--
    state.cooldown += spec.fireInterval
    state.heat = Math.min(state.heat + 1, spec.spread.max / Math.max(spec.spread.perShot, EPSILON))
    fired = 'fired'
  }

  // An empty magazine reloads by itself as soon as the reserve allows it.
  const wantsReload = input.reload || state.mag === 0
  if (wantsReload && !state.reloading && state.mag < spec.magazine && state.reserve > 0) {
    state.reloading = true
    state.reloadLeft = spec.reloadSeconds
  }
  return fired
}

// Current cone half-angle in radians.
export function currentSpread(state: WeaponState, crouching: boolean, aiming: boolean): number {
  const { spread } = WEAPONS[state.weapon]
  const degrees = aiming
    ? spread.aimed
    : Math.min(spread.max, spread.base + state.heat * spread.perShot)
  return ((degrees * Math.PI) / 180) * (crouching ? CROUCH_SPREAD_FACTOR : 1)
}
