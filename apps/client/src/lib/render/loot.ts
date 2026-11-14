import type { PlayerSnapshot } from '@blockfront/sim/game'

export interface LootGain {
  ammo: boolean
  bandages: number
  grenades: number
}

// What a chest really gave: the difference between the snapshot before and after the opening.
export function lootGain(before: PlayerSnapshot | null, after: PlayerSnapshot): LootGain {
  if (!before) return { ammo: false, bandages: 0, grenades: 0 }
  return {
    ammo: after.reserve > before.reserve || after.pistolReserve > before.pistolReserve,
    bandages: Math.max(0, after.bandages - before.bandages),
    grenades: Math.max(0, after.grenades - before.grenades),
  }
}
