import type { GameConfig, GameEvent, Snapshot } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'

export type SimRequest =
  | { type: 'start'; config: GameConfig; localPlayerId: number }
  | { type: 'input'; frame: InputFrame }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  // QA mode (dev builds only): poke the local player directly.
  | { type: 'dev'; op: DevOp }

export type DevItem = 'blocks' | 'grenades' | 'tnt' | 'ladders' | 'bandages' | 'ammo'

export type DevOp =
  | { kind: 'teleport'; x: number; y: number; z: number }
  | { kind: 'give'; item: DevItem; n: number }
  | { kind: 'setHp'; hp: number }
  | { kind: 'kill' }
  // A standing dummy on a team, for scoreboards and targets.
  | { kind: 'addDummy'; team: 'blue' | 'red'; name: string; x: number; z: number }

export type SimResponse = {
  type: 'update'
  snapshot: Snapshot
  events: GameEvent[]
  stepMs: number
}
