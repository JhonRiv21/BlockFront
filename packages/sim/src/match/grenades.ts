import { explodeBlocks } from '../combat/blocks.ts'
import { stepGrenade, throwSpeed, throwVelocity, type GrenadeEntity } from '../combat/grenade.ts'
import { GRENADE, KNOCKBACK, PLAYER_HP } from '../combat/weapons.ts'
import { TICK_SECONDS } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import { BLOCK } from '../world/blocks.ts'
import { clearDecorAbove, fillWithWater, recordBlock } from './block-edits.ts'
import type { MatchContext } from './context.ts'
import { applyDamage, knockback } from './damage.ts'
import { bodyCenter, eyePosition, type PlayerEntity } from './entities.ts'

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
  ctx.events.push({ type: 'explosion', x: center[0], y: center[1], z: center[2] })
  const broken = explodeBlocks(ctx.world, ctx.health, center, GRENADE.blockRadius)
  for (const [x, y, z] of broken) {
    recordBlock(ctx, x, y, z, BLOCK.air)
    clearDecorAbove(ctx, x, y, z)
  }
  for (const [x, y, z] of broken) fillWithWater(ctx, x, y, z)
  for (const player of ctx.players.values()) {
    if (!player.alive) continue
    if (owner && player !== owner && player.config.team === owner.config.team) continue
    const target = bodyCenter(player)
    const dx = target[0] - center[0]
    const dy = target[1] - center[1]
    const dz = target[2] - center[2]
    const distance = Math.hypot(dx, dy, dz)
    if (distance >= GRENADE.damageRadius) continue
    const blocked = raycastVoxels(ctx.isSolid, center, [dx, dy, dz], distance)
    if (blocked && blocked.distance > 0) continue
    const damage = GRENADE.maxDamage * (1 - distance / GRENADE.damageRadius)
    applyDamage(ctx, owner ?? player, player, damage, 'torso', 'grenade')
    const push = KNOCKBACK.explosion * (1 - distance / GRENADE.damageRadius)
    // Blast at the body centre (distance 0) pushes straight up instead of dividing by zero.
    const dir: Vec3 = distance > 0 ? [dx / distance, dy / distance, dz / distance] : [0, 1, 0]
    knockback(player, dir, push)
  }
}
