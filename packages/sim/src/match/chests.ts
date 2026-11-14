import { CHEST, GRENADE, ITEMS, WEAPONS } from '../combat/weapons.ts'
import { TICK_RATE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { withinFlag } from '../rules/ctf.ts'
import type { World } from '../world/world.ts'
import type { MatchContext } from './context.ts'
import type { PlayerEntity } from './entities.ts'
import { chestSpots } from './placement.ts'

export interface ChestEntity {
  id: number
  pos: Vec3
  full: boolean
  // Tick at which an empty chest fills again; -1 while full.
  refillTick: number
}

export function createChests(world: World, seed: number, flagHomes: Vec3[]): ChestEntity[] {
  return chestSpots(world, seed, flagHomes).map((pos, index) => ({
    id: index + 1,
    pos,
    full: true,
    refillTick: -1,
  }))
}

// Both reserves back to their maximum (magazines stay), +1 bandage and +1 grenade up to the caps.
function loot(player: PlayerEntity): void {
  player.weapon.reserve = WEAPONS[player.weapon.weapon].reserve
  player.pistol.reserve = WEAPONS.pistol.reserve
  player.bandages = Math.min(ITEMS.bandage.max, player.bandages + CHEST.bandages)
  player.grenades = Math.min(GRENADE.perLife, player.grenades + CHEST.grenades)
}

// Refills first, then a living player touching a full chest (reach as for a flag) opens it.
export function stepChests(ctx: MatchContext): void {
  for (const chest of ctx.chests) {
    if (chest.full || ctx.tick < chest.refillTick) continue
    chest.full = true
    chest.refillTick = -1
    ctx.events.push({ type: 'chestRefill', chest: chest.id })
  }
  for (const player of ctx.players.values()) {
    if (!player.alive) continue
    for (const chest of ctx.chests) {
      if (!chest.full || !withinFlag(player.state.pos, chest.pos)) continue
      chest.full = false
      chest.refillTick = ctx.tick + CHEST.refillSeconds * TICK_RATE
      loot(player)
      ctx.events.push({ type: 'loot', player: player.config.id, chest: chest.id })
    }
  }
}
