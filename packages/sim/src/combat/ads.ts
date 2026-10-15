import { SPREAD } from './spread.ts'
import type { WeaponId } from './weapons.ts'

export interface AdsSpec {
  seconds: number
  zoom: number
  scope: boolean
  // Movement multiplier at full ADS.
  move: number
}

// docs/f2-6-feel.md §2 (replaces the F2.5 table).
export const ADS: Record<WeaponId, AdsSpec> = Object.fromEntries(
  (Object.keys(SPREAD) as WeaponId[]).map((weapon) => [
    weapon,
    {
      seconds: SPREAD[weapon].adsSeconds,
      zoom: SPREAD[weapon].zoom,
      scope: weapon === 'sniper',
      move: SPREAD[weapon].move,
    },
  ]),
) as Record<WeaponId, AdsSpec>

export const ADS_AIMED_THRESHOLD = 0.9
const HELD_MOVE: Partial<Record<WeaponId, number>> = { carbine: 0.95 }

// Linear transition in and out, clamped.
export function adsProgress(t: number, weapon: WeaponId, aiming: boolean, dt: number): number {
  const step = dt / ADS[weapon].seconds
  return Math.max(0, Math.min(1, t + (aiming ? step : -step)))
}

// The spread only reaches its ADS minimum once the transition is nearly done: no quickscope.
export function aimedEnough(t: number): boolean {
  return t >= ADS_AIMED_THRESHOLD
}

// Movement speed multiplier for the weapon in hand at a given ADS progress.
export function moveMultiplier(weapon: WeaponId, t: number): number {
  const held = HELD_MOVE[weapon] ?? 1
  return held * (1 + (ADS[weapon].move - 1) * t)
}
