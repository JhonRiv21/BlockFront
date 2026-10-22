import type { BlockHealth } from '../combat/blocks.ts'
import type { GrenadeEntity } from '../combat/grenade.ts'
import type { SolidTest } from '../physics/sweep.ts'
import type { LiquidTest } from '../physics/water.ts'
import type { Rng } from '../rng.ts'
import type { BlockId } from '../world/blocks.ts'
import type { World } from '../world/world.ts'
import type { PlayerEntity } from './entities.ts'
import type { FlagEntity, MatchEntity } from '../rules/ctf.ts'
import type { GameEvent, Team } from './types.ts'

// What the match systems (hitscan, block edits, grenades, damage) need from the Game. The Game
// itself is the context: these are its fields, so the systems stay plain functions.
export interface MatchContext {
  readonly world: World
  readonly health: BlockHealth
  readonly isSolid: SolidTest
  readonly isLiquid: LiquidTest
  readonly players: Map<number, PlayerEntity>
  readonly rng: Rng
  readonly blockChanges: Map<number, [number, number, number, BlockId]>
  tick: number
  events: GameEvent[]
  grenades: GrenadeEntity[]
  nextGrenadeId: number
  readonly flags: Record<Team, FlagEntity>
  readonly match: MatchEntity
  // Team that placed each block; a team cannot break its own (D3).
  readonly blockOwners: Map<number, Team>
}
