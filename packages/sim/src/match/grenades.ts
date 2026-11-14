import { stepGrenade, throwSpeed, throwVelocity, type GrenadeEntity } from '../combat/grenade.ts'
import { GRENADE, PLAYER_HP } from '../combat/weapons.ts'
import { TICK_SECONDS } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { MatchContext } from './context.ts'
import { applyDamage } from './damage.ts'
import { eyePosition, type PlayerEntity } from './entities.ts'
import { explodeAt } from './explosives.ts'

// Press: pin out, fuse running, power charging for 0.8 s; then it only cooks. Release throws
// with the charged speed; the right click while holding lobs it underhand (docs §4).
export function handleGrenade(
  ctx: MatchContext,
  player: PlayerEntity,
  fire: boolean,
  firePressed: boolean,
  altPressed: boolean,
): void {
  if (player.cooking >= 0) {
    player.cooking -= TICK_SECONDS
    player.charge += TICK_SECONDS
    if (player.cooking <= 0) {
      // Cooked too long: it goes off in the hand and the holder does not survive it.
      player.cooking = -1
      player.charge = 0
      player.grenades--
      applyDamage(ctx, player, player, PLAYER_HP, 'torso', 'grenade')
      explode(ctx, eyePosition(player), player)
      return
    }
    if (!fire || altPressed) {
      const fuse = player.cooking
      const charge = player.charge
      player.cooking = -1
      player.charge = 0
      throwGrenade(ctx, player, fuse, charge, altPressed)
    }
    return
  }
  if (firePressed && player.grenades > 0) {
    player.cooking = GRENADE.fuse
    player.charge = 0
  }
}

export function throwGrenade(
  ctx: MatchContext,
  player: PlayerEntity,
  fuse: number,
  charge: number,
  underhand: boolean,
): void {
  player.protectedUntil = 0
  const vel = throwVelocity(
    player.yaw,
    player.pitch,
    throwSpeed(charge),
    player.state.vel,
    underhand,
  )
  const grenade: GrenadeEntity = {
    id: ctx.nextGrenadeId++,
    owner: player.config.id,
    pos: eyePosition(player),
    vel,
    fuse,
  }
  ctx.grenades.push(grenade)
  player.grenades--
  ctx.events.push({ type: 'grenade', player: player.config.id, grenade: grenade.id })
}

export function stepGrenades(ctx: MatchContext): void {
  const remaining: GrenadeEntity[] = []
  for (const grenade of ctx.grenades) {
    if (stepGrenade(grenade, ctx.isSolid, TICK_SECONDS)) {
      explode(ctx, grenade.pos, ctx.players.get(grenade.owner) ?? null)
    } else {
      remaining.push(grenade)
    }
  }
  ctx.grenades = remaining
}

export function explode(ctx: MatchContext, center: Vec3, owner: PlayerEntity | null): void {
  explodeAt(ctx, center, owner, GRENADE, 'grenade')
}
