import type { WeaponId } from '@blockfront/sim/combat/weapons'

// How each gun is held while aiming (2026-11-14 playtest). 'optic': the red dot or holo window
// sits on the view axis. 'low': iron sights made of voxels hide the target, so the gun comes to
// the centre a few degrees low and the HUD draws a dot at the centre instead. The sniper's
// scope is a HUD overlay of its own.
export const ADS_STYLE: Record<WeaponId, 'optic' | 'low'> = {
  rifle: 'low',
  carbine: 'optic',
  smg: 'optic',
  shotgun: 'low',
  sniper: 'optic',
  pistol: 'low',
}

// Degrees below the view axis for the line of sight of a 'low' gun.
export const ADS_LOW_DEGREES = 7

// The gun in hand from the hotbar slot: 1 the primary, 2 the pistol, anything else none.
export function gunInHand(slot: number, primary: WeaponId): WeaponId | null {
  return slot === 1 ? primary : slot === 2 ? 'pistol' : null
}
