import type { GameConfig, GameEvent, Snapshot } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'

export type SimRequest =
  | { type: 'start'; config: GameConfig; localPlayerId: number }
  | { type: 'input'; frame: InputFrame }

export type SimResponse = {
  type: 'update'
  snapshot: Snapshot
  events: GameEvent[]
  stepMs: number
}
