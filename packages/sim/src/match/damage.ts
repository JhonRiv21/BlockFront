import { KNOCKBACK, type HitZone } from '../combat/weapons.ts'
import { nextWaveTick } from '../rules/ctf.ts'
import { dropFlag } from './ctf-system.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { MatchContext } from './context.ts'
import type { PlayerEntity } from './entities.ts'
import type { DamageSource } from './types.ts'

export function applyDamage(
  ctx: MatchContext,
  attacker: PlayerEntity,
  victim: PlayerEntity,
  damage: number,
  zone: HitZone,
  tool: DamageSource,
): void {
  if (damage <= 0 || !victim.alive) return
  // Spawn protection: nothing lands until it expires, is fired away or the base is left.
  if (ctx.tick < victim.protectedUntil) return
  const dealt = Math.min(damage, victim.hp)
  victim.hp = Math.max(0, victim.hp - damage)
  victim.takenThisLife += dealt
  const enemy = attacker !== victim && attacker.config.team !== victim.config.team
  if (enemy) {
    victim.lastAttacker = attacker.config.id
    victim.lastAttackedTick = ctx.tick
    attacker.stats.damage += dealt
    attacker.dealtThisLife += dealt
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
  victim.respawnTick = nextWaveTick(ctx.tick)
  victim.stats.deaths++
  victim.killedBy = attacker.config.id
  victim.killedWith = tool
  if (enemy) attacker.stats.kills++
  dropFlag(ctx, victim)
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
