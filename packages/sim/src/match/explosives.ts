import { explodeBlocks } from '../combat/blocks.ts'
import { ITEMS, KNOCKBACK } from '../combat/weapons.ts'
import { TICK_RATE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import { BLOCK } from '../world/blocks.ts'
import { blockTeam, clearDecorAbove, fillWithWater, recordBlock } from './block-edits.ts'
import type { MatchContext } from './context.ts'
import { applyDamage, knockback } from './damage.ts'
import { bodyCenter, isEnemy, type PlayerEntity } from './entities.ts'
import type { DamageSource } from './types.ts'

export interface TntEntity {
  x: number
  y: number
  z: number
  owner: number
  // Tick at which the fuse runs out.
  detonateTick: number
}

export interface BlastSpec {
  blockRadius: number
  damageRadius: number
  maxDamage: number
}

// A blast at `center`: blocks within blockRadius go (never the owner team's), players within
// damageRadius and in line of sight take damage falling off with distance plus a push. Friendly
// fire is off, so teammates of the owner are spared; the owner is not. TNT caught in the blast
// goes off too.
export function explodeAt(
  ctx: MatchContext,
  center: Vec3,
  owner: PlayerEntity | null,
  spec: BlastSpec,
  source: DamageSource,
): void {
  ctx.events.push({ type: 'explosion', x: center[0], y: center[1], z: center[2] })
  const team = owner?.config.team ?? null
  const broken = explodeBlocks(
    ctx.world,
    ctx.health,
    center,
    spec.blockRadius,
    (x, y, z) => team !== null && blockTeam(ctx, x, y, z) === team,
  )
  for (const [x, y, z] of broken) {
    recordBlock(ctx, x, y, z, BLOCK.air)
    clearDecorAbove(ctx, x, y, z)
  }
  for (const [x, y, z] of broken) fillWithWater(ctx, x, y, z)
  for (const player of ctx.players.values()) {
    if (!player.alive) continue
    if (owner && player !== owner && !isEnemy(ctx.mode, owner, player)) continue
    const target = bodyCenter(player)
    const dx = target[0] - center[0]
    const dy = target[1] - center[1]
    const dz = target[2] - center[2]
    const distance = Math.hypot(dx, dy, dz)
    if (distance >= spec.damageRadius) continue
    const blocked = raycastVoxels(ctx.isSolid, center, [dx, dy, dz], distance)
    if (blocked && blocked.distance > 0) continue
    const damage = spec.maxDamage * (1 - distance / spec.damageRadius)
    applyDamage(ctx, owner ?? player, player, damage, 'torso', source)
    const push = KNOCKBACK.explosion * (1 - distance / spec.damageRadius)
    // Blast at the body centre (distance 0) pushes straight up instead of dividing by zero.
    const dir: Vec3 = distance > 0 ? [dx / distance, dy / distance, dz / distance] : [0, 1, 0]
    knockback(player, dir, push)
  }
  // Chain reaction: any TNT whose block the blast reached.
  const caught = ctx.tnts.filter((tnt) => {
    const dx = tnt.x + 0.5 - center[0]
    const dy = tnt.y + 0.5 - center[1]
    const dz = tnt.z + 0.5 - center[2]
    return dx * dx + dy * dy + dz * dz <= spec.blockRadius * spec.blockRadius
  })
  for (const tnt of caught) detonateTnt(ctx, tnt.x, tnt.y, tnt.z)
}

export function placeTnt(
  ctx: MatchContext,
  owner: PlayerEntity,
  x: number,
  y: number,
  z: number,
): void {
  ctx.tnts.push({
    x,
    y,
    z,
    owner: owner.config.id,
    detonateTick: ctx.tick + ITEMS.tnt.fuseSeconds * TICK_RATE,
  })
}

// A TNT block dug out or blown away without going off is simply gone.
export function forgetTnt(ctx: MatchContext, x: number, y: number, z: number): void {
  const index = ctx.tnts.findIndex((tnt) => tnt.x === x && tnt.y === y && tnt.z === z)
  if (index !== -1) ctx.tnts.splice(index, 1)
}

export function detonateTnt(ctx: MatchContext, x: number, y: number, z: number): void {
  const index = ctx.tnts.findIndex((tnt) => tnt.x === x && tnt.y === y && tnt.z === z)
  if (index === -1) return
  const [tnt] = ctx.tnts.splice(index, 1)
  if (ctx.world.getBlock(x, y, z) === BLOCK.tnt) {
    ctx.world.fillBlock(x, y, z, BLOCK.air)
    ctx.health.forget(x, y, z)
    recordBlock(ctx, x, y, z, BLOCK.air)
  }
  const owner = ctx.players.get(tnt!.owner) ?? null
  explodeAt(ctx, [x + 0.5, y + 0.5, z + 0.5], owner, ITEMS.tnt, 'tnt')
}

// The own shovel takes the own TNT back before it blows (an exception to D3): +1 stock, no blast.
export function pickUpTnt(
  ctx: MatchContext,
  player: PlayerEntity,
  x: number,
  y: number,
  z: number,
): boolean {
  const tnt = ctx.tnts.find((t) => t.x === x && t.y === y && t.z === z)
  if (!tnt || tnt.owner !== player.config.id) return false
  ctx.world.fillBlock(x, y, z, BLOCK.air)
  ctx.health.forget(x, y, z)
  recordBlock(ctx, x, y, z, BLOCK.air)
  fillWithWater(ctx, x, y, z)
  player.tnt = Math.min(ITEMS.tnt.perLife, player.tnt + 1)
  return true
}

export function isTntAt(ctx: MatchContext, x: number, y: number, z: number): boolean {
  return ctx.tnts.some((tnt) => tnt.x === x && tnt.y === y && tnt.z === z)
}

export function stepTnt(ctx: MatchContext): void {
  const due = ctx.tnts.filter((tnt) => ctx.tick >= tnt.detonateTick)
  for (const tnt of due) detonateTnt(ctx, tnt.x, tnt.y, tnt.z)
}
