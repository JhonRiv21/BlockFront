import { SHOVEL, WEAPONS, type HitZone, type ToolId, type WeaponId } from './weapons.ts'

function isGun(tool: ToolId): tool is WeaponId {
  return tool in WEAPONS
}

function falloffFactor(tool: ToolId, distance: number): number {
  if (!isGun(tool)) return 1
  const falloff = WEAPONS[tool].falloff
  if (!falloff || distance <= falloff.fullUntil) return 1
  if (distance >= falloff.minAt) return falloff.minFactor
  const t = (distance - falloff.fullUntil) / (falloff.minAt - falloff.fullUntil)
  return 1 - t * (1 - falloff.minFactor)
}

// Damage of one bullet or pellet (or a shovel swing) on a zone at a distance.
export function damageFor(tool: ToolId, zone: HitZone, distance: number): number {
  if (tool === 'shovel') return SHOVEL.damage
  if (!isGun(tool)) return 0
  return WEAPONS[tool].damage[zone] * falloffFactor(tool, distance)
}
