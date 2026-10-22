import { WORLD_SIZE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { CTF, enemyOf, inBase, matchStatus, withinFlag, type FlagEntity } from '../rules/ctf.ts'
import { createWeaponState } from '../combat/weapon-state.ts'
import { BLOCKS, GRENADE, PLAYER_HP, WEAPONS } from '../combat/weapons.ts'
import { TICK_RATE } from '../config.ts'
import { BLOCK } from '../world/blocks.ts'
import type { World } from '../world/world.ts'
import type { MatchContext } from './context.ts'
import type { PlayerEntity } from './entities.ts'
import type { Team } from './types.ts'

const FLAG_X = WORLD_SIZE.x / 2
const FLAG_Z: Record<Team, number> = { blue: 20, red: WORLD_SIZE.z - 1 - 20 }

// The flag stands on top of the pole the generator builds at the base centre.
export function flagHome(world: World, team: Team): Vec3 {
  const x = FLAG_X
  const z = FLAG_Z[team]
  for (let y = WORLD_SIZE.y - 1; y >= 0; y--) {
    if (world.getBlock(x, y, z) !== BLOCK.air) return [x + 0.5, y + 1, z + 0.5]
  }
  return [x + 0.5, 1, z + 0.5]
}

export function createFlag(world: World, team: Team): FlagEntity {
  const home = flagHome(world, team)
  return { team, state: 'base', home, pos: [...home], carrier: 0, droppedTick: -1 }
}

function returnFlag(ctx: MatchContext, flag: FlagEntity, by: PlayerEntity | null): void {
  flag.state = 'base'
  flag.pos = [...flag.home]
  flag.carrier = 0
  flag.droppedTick = -1
  ctx.events.push({ type: 'flag', action: 'returned', team: flag.team, player: by?.config.id ?? 0 })
}

// A dropped flag settles on the first block under where it fell, at most 12 blocks down.
function settle(ctx: MatchContext, pos: Vec3): Vec3 {
  const x = Math.floor(pos[0])
  const z = Math.floor(pos[2])
  let y = Math.floor(pos[1])
  for (let i = 0; i < 12 && y > 0; i++, y--) {
    if (ctx.isSolid(x, y - 1, z)) break
  }
  return [pos[0], y, pos[2]]
}

export function dropFlag(ctx: MatchContext, carrier: PlayerEntity): void {
  const flag = ctx.flags[enemyOf(carrier.config.team)]
  if (flag.state !== 'carried' || flag.carrier !== carrier.config.id) return
  flag.state = 'dropped'
  flag.carrier = 0
  flag.pos = settle(ctx, [...carrier.state.pos])
  flag.droppedTick = ctx.tick
  ctx.events.push({ type: 'flag', action: 'dropped', team: flag.team, player: carrier.config.id })
}

export function isCarrying(ctx: MatchContext, player: PlayerEntity): boolean {
  const flag = ctx.flags[enemyOf(player.config.team)]
  return flag.state === 'carried' && flag.carrier === player.config.id
}

// Pickups, returns and captures for one tick, then the clock.
export function stepCtf(ctx: MatchContext): void {
  for (const flag of Object.values(ctx.flags)) {
    if (
      flag.state === 'dropped' &&
      ctx.tick - flag.droppedTick >= CTF.flagReturnSeconds * TICK_RATE
    )
      returnFlag(ctx, flag, null)
  }
  for (const player of ctx.players.values()) {
    if (!player.alive) continue
    const team = player.config.team
    const own = ctx.flags[team]
    const theirs = ctx.flags[enemyOf(team)]
    const pos = player.state.pos
    if (theirs.state !== 'carried' && withinFlag(pos, theirs.pos)) {
      theirs.state = 'carried'
      theirs.carrier = player.config.id
      theirs.droppedTick = -1
      ctx.events.push({
        type: 'flag',
        action: 'taken',
        team: theirs.team,
        player: player.config.id,
      })
    }
    if (own.state === 'dropped' && withinFlag(pos, own.pos)) {
      player.stats.returns++
      returnFlag(ctx, own, player)
    }
    if (isCarrying(ctx, player) && own.state === 'base' && withinFlag(pos, own.home)) {
      ctx.match.score[team]++
      player.stats.captures++
      ctx.events.push({
        type: 'flag',
        action: 'captured',
        team: theirs.team,
        player: player.config.id,
      })
      returnFlag(ctx, theirs, player)
    }
  }
  for (const flag of Object.values(ctx.flags)) {
    if (flag.state !== 'carried') continue
    const carrier = ctx.players.get(flag.carrier)
    if (carrier) flag.pos = [...carrier.state.pos]
  }
  const status = matchStatus(ctx.match.score, ctx.tick)
  if (status.state !== ctx.match.state) ctx.match.state = status.state
  if (status.state === 'ended' && ctx.match.winner === null) {
    ctx.match.winner = status.winner
    ctx.match.endTick = ctx.tick
    ctx.events.push({ type: 'matchEnd', winner: status.winner ?? 'none' })
  }
}

// Inside the own base: spawn protection holds, and every 15 s hp, blocks, grenades and ammo
// come back. Stepping out of the base ends the protection.
export function stepBase(ctx: MatchContext, player: PlayerEntity): void {
  const home = ctx.flags[player.config.team].home
  if (!inBase(player.state.pos, home)) {
    player.protectedUntil = 0
    return
  }
  if (ctx.tick - player.lastRestockTick < CTF.restockSeconds * TICK_RATE) return
  const needs =
    player.hp < PLAYER_HP ||
    player.blocks < BLOCKS.max ||
    player.grenades < GRENADE.perLife ||
    player.weapon.mag + player.weapon.reserve <
      WEAPONS[player.weapon.weapon].magazine + WEAPONS[player.weapon.weapon].reserve ||
    player.pistol.mag + player.pistol.reserve < WEAPONS.pistol.magazine + WEAPONS.pistol.reserve
  if (!needs) return
  player.lastRestockTick = ctx.tick
  player.hp = PLAYER_HP
  player.blocks = BLOCKS.max
  player.grenades = GRENADE.perLife
  player.weapon = createWeaponState(player.weapon.weapon)
  player.pistol = createWeaponState('pistol')
  ctx.events.push({ type: 'restock', player: player.config.id })
}
