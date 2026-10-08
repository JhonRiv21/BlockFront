import { SHOVEL, WEAPONS, type HitZone, type ToolId } from './weapons.ts'

function falloffFactor(tool: ToolId, distance: number): number {
  if (tool === 'shovel' || tool === 'blocks' || tool === 'grenade') return 1
  const falloff = WEAPONS[tool].falloff
  if (!falloff || distance <= falloff.fullUntil) return 1
  if (distance >= falloff.minAt) return falloff.minFactor
  const t = (distance - falloff.fullUntil) / (falloff.minAt - falloff.fullUntil)
  return 1 - t * (1 - falloff.minFactor)
}

// Damage of one bullet or pellet (or a shovel swing) on a zone at a distance.
export function damageFor(tool: ToolId, zone: HitZone, distance: number): number {
  if (tool === 'shovel') return SHOVEL.damage
  if (tool === 'blocks' || tool === 'grenade') return 0
  return WEAPONS[tool].damage[zone] * falloffFactor(tool, distance)
}
