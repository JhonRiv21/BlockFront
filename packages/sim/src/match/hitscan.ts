import { damageFor } from '../combat/damage.ts'
import { playerHitboxes, rayHitboxes } from '../combat/hitboxes.ts'
import { adsBlend, computeSpread, scatterRadius } from '../combat/spread.ts'
import type { WeaponState } from '../combat/weapon-state.ts'
import { KNOCKBACK, SHOVEL, WEAPONS, type HitZone, type ToolId } from '../combat/weapons.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import type { Rng } from '../rng.ts'
import { damageBlock } from './block-edits.ts'
import type { MatchContext } from './context.ts'
import { applyDamage, knockback } from './damage.ts'
import { eyePosition, viewDirection, type PlayerEntity } from './entities.ts'

const BULLET_RANGE = 200

// Spread of the weapon in hand with the shooter's situation (docs/f2-6-feel.md §2).
export function spreadOf(player: PlayerEntity): number {
  const weapon = player.slot === 2 ? player.pistol : player.weapon
  const vel = player.state.vel
  return computeSpread(weapon.weapon, {
    ads: player.ads,
    bloom: weapon.bloom,
    moving: Math.hypot(vel[0], vel[2]) > 0.5,
    airborne: !player.state.onGround && !player.state.inWater,
    crouching: player.state.crouching,
  })
}

export function fireWeapon(ctx: MatchContext, player: PlayerEntity, weapon: WeaponState): void {
  const spec = WEAPONS[weapon.weapon]
  player.protectedUntil = 0
  const spread = spreadOf(player)
  const blend = adsBlend(player.ads)
  const origin = eyePosition(player)
  const aim = viewDirection(player.yaw, player.pitch)
  ctx.events.push({
    type: 'shot',
    player: player.config.id,
    tool: weapon.weapon,
    origin,
    dir: aim,
  })
  for (let i = 0; i < spec.pellets; i++) {
    const dir = scatter(ctx.rng, aim, spread, blend)
    traceBullet(ctx, player, origin, dir, weapon.weapon, BULLET_RANGE, spec.blockDamage)
  }
}

// Random direction inside the cone of half-angle `spread` around dir: uniform over the disk
// from the hip, centred in ADS.
export function scatter(rng: Rng, dir: Vec3, spread: number, blend: number): Vec3 {
  if (spread <= 0) return dir
  const angle = rng.next() * Math.PI * 2
  const radius = scatterRadius(rng.next(), blend) * Math.tan(spread)
  const up: Vec3 = Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]
  const right: Vec3 = [
    dir[1] * up[2] - dir[2] * up[1],
    dir[2] * up[0] - dir[0] * up[2],
    dir[0] * up[1] - dir[1] * up[0],
  ]
  const rl = Math.hypot(right[0], right[1], right[2])
  right[0] /= rl
  right[1] /= rl
  right[2] /= rl
  const trueUp: Vec3 = [
    right[1] * dir[2] - right[2] * dir[1],
    right[2] * dir[0] - right[0] * dir[2],
    right[0] * dir[1] - right[1] * dir[0],
  ]
  const ox = Math.cos(angle) * radius
  const oy = Math.sin(angle) * radius
  const out: Vec3 = [
    dir[0] + right[0] * ox + trueUp[0] * oy,
    dir[1] + right[1] * ox + trueUp[1] * oy,
    dir[2] + right[2] * ox + trueUp[2] * oy,
  ]
  const l = Math.hypot(out[0], out[1], out[2])
  return [out[0] / l, out[1] / l, out[2] / l]
}

// Nearest enemy hitbox along the ray within `limit`, if any.
function nearestEnemy(
  ctx: MatchContext,
  shooter: PlayerEntity,
  origin: Vec3,
  dir: Vec3,
  limit: number,
): { victim: PlayerEntity; zone: HitZone; distance: number } | null {
  let victim: PlayerEntity | null = null
  let zone: HitZone = 'torso'
  let distance = limit
  for (const other of ctx.players.values()) {
    if (other === shooter || !other.alive || other.config.team === shooter.config.team) continue
    const hit = rayHitboxes(
      origin,
      dir,
      distance,
      playerHitboxes(other.state.pos, other.state.crouching),
    )
    if (hit && hit.distance < distance) {
      victim = other
      zone = hit.zone
      distance = hit.distance
    }
  }
  return victim ? { victim, zone, distance } : null
}

// Hitscan: the nearest of a block or an enemy hitbox along the ray.
function traceBullet(
  ctx: MatchContext,
  shooter: PlayerEntity,
  origin: Vec3,
  dir: Vec3,
  tool: ToolId,
  range: number,
  blockDamage: number,
): void {
  const blockHit = raycastVoxels(ctx.isSolid, origin, dir, range)
  const limit = blockHit ? blockHit.distance : range
  const hit = nearestEnemy(ctx, shooter, origin, dir, limit)
  if (hit) {
    const damage = damageFor(tool, hit.zone, hit.distance)
    applyDamage(ctx, shooter, hit.victim, damage, hit.zone, tool)
    knockback(
      hit.victim,
      dir,
      Math.min(KNOCKBACK.max, KNOCKBACK.min + damage * KNOCKBACK.perDamage),
    )
  } else if (blockHit && blockDamage > 0) {
    damageBlock(
      ctx,
      blockHit.x,
      blockHit.y,
      blockHit.z,
      blockDamage,
      null,
      shooter.config.team,
      blockHit.normal,
    )
  }
}

// The shovel lands: melee on an enemy within reach, otherwise one block (or a column of three).
export function swingShovel(ctx: MatchContext, player: PlayerEntity, column: boolean): void {
  player.protectedUntil = 0
  const origin = eyePosition(player)
  const dir = viewDirection(player.yaw, player.pitch)
  if (!column) {
    const hit = nearestEnemy(ctx, player, origin, dir, SHOVEL.meleeRange)
    if (hit) {
      applyDamage(
        ctx,
        player,
        hit.victim,
        damageFor('shovel', hit.zone, hit.distance),
        hit.zone,
        'shovel',
      )
      return
    }
  }
  const blockHit = raycastVoxels(ctx.isSolid, origin, dir, SHOVEL.blockReach)
  if (!blockHit) return
  const half = Math.floor(SHOVEL.columnSize / 2)
  const rows = column ? [-half, 0, half].filter((o, i, a) => a.indexOf(o) === i) : [0]
  for (const offset of rows) {
    damageBlock(
      ctx,
      blockHit.x,
      blockHit.y + offset,
      blockHit.z,
      SHOVEL.blockDamage,
      player,
      player.config.team,
      blockHit.normal,
    )
  }
}
