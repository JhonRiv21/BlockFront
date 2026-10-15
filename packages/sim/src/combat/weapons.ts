// Single source of balance numbers (PLAN.md §3). Distances in blocks, times in seconds,
// angles in degrees.
export type WeaponId = 'rifle' | 'carbine' | 'smg' | 'shotgun' | 'sniper' | 'pistol'
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

export interface WeaponSpec {
  damage: ZoneDamage
  fireInterval: number
  magazine: number
  reserve: number
  pellets: number
  automatic: boolean
  falloff: Falloff | null
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
    blockDamage: 50,
    reloadSeconds: 1.8,
    reloadPerShell: false,
  },
  // Automatic carbine (docs/f2-5-polish.md §4.4): 4 torso shots in 0.36 s, wins at mid range.
  carbine: {
    damage: { torso: 28, head: 70, limbs: 20 },
    fireInterval: 0.12,
    magazine: 30,
    reserve: 90,
    pellets: 1,
    automatic: true,
    falloff: { fullUntil: 35, minAt: 70, minFactor: 0.75 },
    blockDamage: 30,
    reloadSeconds: 2.2,
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
    blockDamage: 15,
    reloadSeconds: 0.5,
    reloadPerShell: true,
  },
  // Secondary, always present (docs/f2-5-polish.md §4.4).
  pistol: {
    damage: { torso: 30, head: 80, limbs: 20 },
    fireInterval: 0.18,
    magazine: 12,
    reserve: 48,
    pellets: 1,
    automatic: false,
    falloff: { fullUntil: 15, minAt: 40, minFactor: 0.7 },
    blockDamage: 20,
    reloadSeconds: 1.4,
    reloadPerShell: false,
  },
  sniper: {
    damage: { torso: 90, head: 150, limbs: 60 },
    fireInterval: 1.3,
    magazine: 5,
    reserve: 25,
    pellets: 1,
    automatic: false,
    falloff: null,
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
  // docs/f2-5-polish.md §5.3: a 350 ms swing whose hit lands at ~40 % (the PLAN table said 0.25 s).
  interval: 0.35,
  impactDelay: 0.14,
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
  // 150 at the centre fading to 0 at 4.5 blocks: lethal inside 1.5, 50 at 3.
  damageRadius: 4.5,
  maxDamage: 150,
} as const

export const PLAYER_HP = 100
// Knockback on hits: metres per second per point of damage, plus a floor, and the explosion push.
export const KNOCKBACK = { perDamage: 0.06, min: 1.5, max: 6, up: 1.2, explosion: 9 } as const
// Seconds after sprinting before the gun can fire again.
export const SPRINT_RECOVERY = 0.15
export const RESPAWN_SECONDS = 5
