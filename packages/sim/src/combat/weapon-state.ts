import { computeSpread, maxBloom, SPREAD, type SpreadContext } from './spread.ts'
import { WEAPONS, type WeaponId } from './weapons.ts'

export interface WeaponState {
  weapon: WeaponId
  mag: number
  reserve: number
  cooldown: number
  reloading: boolean
  reloadLeft: number
  // Seconds the whole reload takes, fixed when it starts; the HUD ring fills against it.
  reloadTotal: number
  // Consecutive-fire bloom in shots; decays linearly and widens the spread.
  bloom: number
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
    reloadTotal: 0,
    bloom: 0,
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
  // The remainder of a cooldown that ends mid-tick carries into the next shot so the average
  // rate is exact; from idle there is nothing to carry.
  const wasCooling = state.cooldown > 0
  state.cooldown -= dt
  const spread = SPREAD[state.weapon]
  const recoverShots = spread.hip.perShot > 0 ? spread.recoveryPerSecond / spread.hip.perShot : 0
  state.bloom = Math.max(0, state.bloom - recoverShots * dt)

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
    state.cooldown = (wasCooling ? state.cooldown : 0) + spec.fireInterval
    state.bloom = Math.min(state.bloom + 1, maxBloom(state.weapon))
    fired = 'fired'
  }

  // An empty magazine reloads by itself as soon as the reserve allows it.
  const wantsReload = input.reload || state.mag === 0
  if (wantsReload && !state.reloading && state.mag < spec.magazine && state.reserve > 0) {
    state.reloading = true
    state.reloadLeft = spec.reloadSeconds
    state.reloadTotal = reloadRemaining(state)
  }
  return fired
}

// Seconds until the reload in progress fully ends; a shell-by-shell reload counts every shell
// that still fits. 0 when not reloading.
export function reloadRemaining(state: WeaponState): number {
  if (!state.reloading) return 0
  const spec = WEAPONS[state.weapon]
  if (!spec.reloadPerShell) return Math.max(0, state.reloadLeft)
  const shellsAfter = Math.max(0, Math.min(spec.magazine - state.mag, state.reserve) - 1)
  return Math.max(0, state.reloadLeft) + shellsAfter * spec.reloadSeconds
}

// Current cone half-angle in radians for a standing, grounded shooter.
export function currentSpread(state: WeaponState, crouching: boolean, aiming: boolean): number {
  const ctx: SpreadContext = {
    ads: aiming ? 1 : 0,
    bloom: state.bloom,
    moving: false,
    airborne: false,
    crouching,
  }
  return computeSpread(state.weapon, ctx)
}
