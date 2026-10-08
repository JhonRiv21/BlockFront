// Single source of balance numbers (PLAN.md §3). Distances in blocks, times in seconds,
// angles in degrees.
export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper'
export type ToolId = WeaponId | 'shovel' | 'blocks' | 'grenade'
export type HitZone = 'head' | 'torso' | 'limbs'

export interface ZoneDamage {
  torso: number
  head: number
  limbs: number
}

export interface Falloff {
  fullUntil: number
  minAt: number
  minFactor: number
}

export interface Spread {
  base: number
  perShot: number
  max: number
  recoveryPerSecond: number
  aimed: number
}

export interface WeaponSpec {
  damage: ZoneDamage
  fireInterval: number
  magazine: number
  reserve: number
  pellets: number
  automatic: boolean
  falloff: Falloff | null
  spread: Spread
  blockDamage: number
  reloadSeconds: number
  reloadPerShell: boolean
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    damage: { torso: 50, head: 100, limbs: 34 },
    fireInterval: 0.5,
    magazine: 8,
    reserve: 48,
    pellets: 1,
    automatic: false,
    falloff: null,
    spread: { base: 0.4, perShot: 0.3, max: 1.5, recoveryPerSecond: 4, aimed: 0.2 },
    blockDamage: 50,
    reloadSeconds: 1.8,
    reloadPerShell: false,
  },
  smg: {
    damage: { torso: 25, head: 60, limbs: 18 },
    fireInterval: 0.1,
    magazine: 30,
    reserve: 120,
    pellets: 1,
    automatic: true,
    falloff: { fullUntil: 20, minAt: 45, minFactor: 0.6 },
    spread: { base: 1.2, perShot: 0.5, max: 6, recoveryPerSecond: 6, aimed: 0.8 },
    blockDamage: 25,
    reloadSeconds: 2.2,
    reloadPerShell: false,
  },
  shotgun: {
    damage: { torso: 14, head: 20, limbs: 9 },
    fireInterval: 0.9,
    magazine: 6,
    reserve: 36,
    pellets: 8,
    automatic: false,
    falloff: { fullUntil: 8, minAt: 20, minFactor: 0.25 },
    spread: { base: 6, perShot: 0, max: 6, recoveryPerSecond: 0, aimed: 5 },
    blockDamage: 15,
    reloadSeconds: 0.5,
    reloadPerShell: true,
  },
  sniper: {
    damage: { torso: 90, head: 150, limbs: 60 },
    fireInterval: 1.3,
    magazine: 5,
    reserve: 25,
    pellets: 1,
    automatic: false,
    falloff: null,
    spread: { base: 4, perShot: 0, max: 4, recoveryPerSecond: 0, aimed: 0.05 },
    blockDamage: 100,
    reloadSeconds: 2.6,
    reloadPerShell: false,
  },
}

export const SHOVEL = {
  damage: 60,
  meleeRange: 2.5,
  blockReach: 5,
  blockDamage: 55,
  interval: 0.25,
  // Right click breaks the aimed block plus the ones directly above and below.
  columnSize: 3,
} as const

export const BLOCKS = {
  max: 50,
  placeInterval: 0.2,
  reach: 5,
} as const

export const GRENADE = {
  perLife: 3,
  fuse: 3,
  throwSpeed: 16,
  gravity: 28,
  bounce: 0.45,
  groundFriction: 0.6,
  size: 0.3,
  blockRadius: 2,
  damageRadius: 4,
  maxDamage: 100,
} as const

export const CROUCH_SPREAD_FACTOR = 0.6
export const PLAYER_HP = 100
export const RESPAWN_SECONDS = 5
