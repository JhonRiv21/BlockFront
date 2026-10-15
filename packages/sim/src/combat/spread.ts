import type { WeaponId } from './weapons.ts'

// docs/f2-6-feel.md §2: half-angles in degrees. Hip fire is honestly imprecise; ADS is where
// the shot lands. bloom counts recent shots and decays linearly. The hip columns are about 35 %
// below the document's table: in the 2026-10-09 playtest those felt exaggerated.
export interface Bloom {
  base: number
  max: number
  perShot: number
}

export interface SpreadSpec {
  hip: Bloom
  ads: Bloom
  recoilAds: number
  zoom: number
  adsSeconds: number
  move: number
  recoveryPerSecond: number
}

export const SPREAD: Record<WeaponId, SpreadSpec> = {
  rifle: {
    hip: { base: 1.6, max: 3.0, perShot: 0.5 },
    ads: { base: 0.08, max: 0.5, perShot: 0.15 },
    recoilAds: 0.6,
    zoom: 1.5,
    adsSeconds: 0.22,
    move: 0.7,
    recoveryPerSecond: 8,
  },
  carbine: {
    hip: { base: 1.4, max: 3.2, perShot: 0.3 },
    ads: { base: 0.15, max: 0.9, perShot: 0.08 },
    recoilAds: 0.65,
    zoom: 1.35,
    adsSeconds: 0.2,
    move: 0.72,
    recoveryPerSecond: 8,
  },
  smg: {
    hip: { base: 0.9, max: 2.2, perShot: 0.18 },
    ads: { base: 0.35, max: 1.0, perShot: 0.06 },
    recoilAds: 0.75,
    zoom: 1.2,
    adsSeconds: 0.15,
    move: 0.8,
    recoveryPerSecond: 10,
  },
  shotgun: {
    hip: { base: 4.5, max: 4.5, perShot: 0 },
    ads: { base: 3.5, max: 3.5, perShot: 0 },
    recoilAds: 0.85,
    zoom: 1.15,
    adsSeconds: 0.18,
    move: 0.8,
    recoveryPerSecond: 8,
  },
  pistol: {
    hip: { base: 0.8, max: 2.2, perShot: 0.4 },
    ads: { base: 0.12, max: 0.8, perShot: 0.1 },
    recoilAds: 0.7,
    zoom: 1.25,
    adsSeconds: 0.12,
    move: 0.85,
    recoveryPerSecond: 8,
  },
  sniper: {
    hip: { base: 4.0, max: 4.0, perShot: 0 },
    ads: { base: 0.02, max: 0.02, perShot: 0 },
    recoilAds: 0.5,
    zoom: 4,
    adsSeconds: 0.35,
    move: 0.55,
    recoveryPerSecond: 6,
  },
}

export interface SpreadContext {
  // ADS transition 0..1.
  ads: number
  // Recent shots (decays).
  bloom: number
  moving: boolean
  airborne: boolean
  crouching: boolean
}

const DEG = Math.PI / 180
// Softer than the document's ×1.5 and +3°, same playtest.
const MOVING_HIP = 1.3
const AIR_HIP = 2
export const ADS_SNAP = 0.9

// Share of the way from hip to ADS: interpolated during the transition, full only from 90 %.
export function adsBlend(ads: number): number {
  return ads >= ADS_SNAP ? 1 : ads * 0.85
}

// Half-angle of the cone in radians.
export function computeSpread(weapon: WeaponId, ctx: SpreadContext): number {
  const s = SPREAD[weapon]
  let hip = Math.min(s.hip.max, s.hip.base + ctx.bloom * s.hip.perShot)
  let ads = Math.min(s.ads.max, s.ads.base + ctx.bloom * s.ads.perShot)
  if (ctx.moving) {
    hip *= MOVING_HIP
    ads *= 1.25
    if (weapon === 'sniper') ads += 1.5
  }
  if (ctx.airborne) {
    hip += AIR_HIP
    ads += 1.5
  }
  if (ctx.crouching) {
    hip *= 0.8
    ads *= 0.8
  }
  const blend = adsBlend(ctx.ads)
  return (hip + (ads - hip) * blend) * DEG
}

// Radius inside the cone for a uniform random u: uniform over the disk from the hip
// (r = √u), centred in ADS (r = u); the exponent follows the same blend.
export function scatterRadius(u: number, blend: number): number {
  const exponent = 0.5 + 0.5 * blend
  return Math.pow(u, exponent)
}

// Upper bound of bloom in shots, so it never pushes past the hip maximum.
export function maxBloom(weapon: WeaponId): number {
  const s = SPREAD[weapon]
  if (s.hip.perShot <= 0) return 0
  return (s.hip.max - s.hip.base) / s.hip.perShot
}
