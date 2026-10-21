import { BLOCKS } from '../combat/weapons.ts'
import { WORLD_SIZE } from '../config.ts'
import { playerAabb } from '../physics/player-controller.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import { BLOCK, isCross, type BlockId } from '../world/blocks.ts'
import { TERRAIN } from '../world/generator.ts'
import type { MatchContext } from './context.ts'
import { eyePosition, overlapsBox, viewDirection, type PlayerEntity } from './entities.ts'

function blockKey(x: number, y: number, z: number): number {
  return x + y * WORLD_SIZE.x + z * WORLD_SIZE.x * WORLD_SIZE.y
}

export function recordBlock(ctx: MatchContext, x: number, y: number, z: number, id: BlockId): void {
  ctx.blockChanges.set(blockKey(x, y, z), [x, y, z, id])
  ctx.events.push({ type: 'block', x, y, z, id })
}

export function setBlock(
  ctx: MatchContext,
  x: number,
  y: number,
  z: number,
  id: BlockId,
  emit: boolean,
): void {
  ctx.world.fillBlock(x, y, z, id)
  ctx.health.forget(x, y, z)
  if (emit) recordBlock(ctx, x, y, z, id)
  else ctx.blockChanges.set(blockKey(x, y, z), [x, y, z, id])
}

// One-step fill, no cascade: a hole below the water level with water beside or above it
// becomes water. Water is static otherwise, so the map stays predictable.
export function fillWithWater(ctx: MatchContext, x: number, y: number, z: number): void {
  if (y > TERRAIN.seaLevel || ctx.world.getBlock(x, y, z) !== BLOCK.air) return
  const wet =
    ctx.isLiquid(x, y + 1, z) ||
    ctx.isLiquid(x + 1, y, z) ||
    ctx.isLiquid(x - 1, y, z) ||
    ctx.isLiquid(x, y, z + 1) ||
    ctx.isLiquid(x, y, z - 1)
  if (!wet) return
  ctx.world.fillBlock(x, y, z, BLOCK.water)
  recordBlock(ctx, x, y, z, BLOCK.water)
}

// Tall grass and flowers cannot float: they go with the block under them.
export function clearDecorAbove(ctx: MatchContext, x: number, y: number, z: number): void {
  if (!isCross(ctx.world.getBlock(x, y + 1, z))) return
  ctx.world.fillBlock(x, y + 1, z, BLOCK.air)
  recordBlock(ctx, x, y + 1, z, BLOCK.air)
}

export function damageBlock(
  ctx: MatchContext,
  x: number,
  y: number,
  z: number,
  amount: number,
  digger: PlayerEntity | null,
  normal: Vec3 = [0, 1, 0],
): void {
  if (ctx.world.getBlock(x, y, z) === BLOCK.air) return
  const broke = ctx.health.damage(x, y, z, amount)
  if (broke) {
    recordBlock(ctx, x, y, z, BLOCK.air)
    clearDecorAbove(ctx, x, y, z)
    fillWithWater(ctx, x, y, z)
    if (digger) digger.blocks = Math.min(BLOCKS.max, digger.blocks + 1)
  } else {
    ctx.events.push({ type: 'blockDamaged', x, y, z, hp: ctx.health.get(x, y, z), normal })
  }
}

export function placeBlock(ctx: MatchContext, player: PlayerEntity): boolean {
  if (player.blocks <= 0) return false
  const hit = raycastVoxels(
    ctx.isSolid,
    eyePosition(player),
    viewDirection(player.yaw, player.pitch),
    BLOCKS.reach,
  )
  if (!hit) return false
  const [nx, ny, nz] = hit.normal
  if (nx === 0 && ny === 0 && nz === 0) return false
  const x = hit.x + nx
  const y = hit.y + ny
  const z = hit.z + nz
  if (!ctx.world.inBounds(x, y, z) || ctx.isSolid(x, y, z)) return false
  for (const other of ctx.players.values()) {
    if (other.alive && overlapsBox(playerAabb(other.state), x, y, z)) return false
  }
  player.blocks--
  setBlock(ctx, x, y, z, player.blockColor, true)
  return true
}
