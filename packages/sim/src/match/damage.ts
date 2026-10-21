import { KNOCKBACK, RESPAWN_SECONDS, type HitZone } from '../combat/weapons.ts'
import { TICK_RATE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { MatchContext } from './context.ts'
import type { PlayerEntity } from './entities.ts'
import type { DamageSource } from './types.ts'

const RESPAWN_TICKS = RESPAWN_SECONDS * TICK_RATE

export function applyDamage(
  ctx: MatchContext,
  attacker: PlayerEntity,
  victim: PlayerEntity,
  damage: number,
  zone: HitZone,
  tool: DamageSource,
): void {
  if (damage <= 0 || !victim.alive) return
  victim.hp = Math.max(0, victim.hp - damage)
  if (attacker !== victim && attacker.config.team !== victim.config.team) {
    victim.lastAttacker = attacker.config.id
    victim.lastAttackedTick = ctx.tick
  }
  ctx.events.push({
    type: 'hit',
    attacker: attacker.config.id,
    victim: victim.config.id,
    zone,
    damage,
    tool,
  })
  if (victim.hp > 0) return
  victim.alive = false
  victim.cooking = -1
  victim.respawnTick = ctx.tick + RESPAWN_TICKS
  ctx.events.push({
    type: 'death',
    victim: victim.config.id,
    attacker: attacker.config.id,
    tool,
  })
}

// Shove the victim along dir (horizontal part) and a little up, so shots and blasts move
// people, including off ledges.
export function knockback(victim: PlayerEntity, dir: Vec3, speed: number): void {
  if (!victim.alive) return
  const horizontal = Math.hypot(dir[0], dir[2]) || 1
  victim.state.vel[0] += (dir[0] / horizontal) * speed
  victim.state.vel[2] += (dir[2] / horizontal) * speed
  victim.state.vel[1] += KNOCKBACK.up
  victim.state.onGround = false
}
